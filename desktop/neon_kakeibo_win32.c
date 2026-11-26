#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#define _CRT_SECURE_NO_WARNINGS

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "embedded_assets.h"

static wchar_t g_dataDir[MAX_PATH * 2];
static wchar_t g_dbPath[MAX_PATH * 2];
static wchar_t g_dbTmpPath[MAX_PATH * 2];
static wchar_t g_dbBakPath[MAX_PATH * 2];
static wchar_t g_portFilePath[MAX_PATH * 2];
static wchar_t g_profileDir[MAX_PATH * 2];

static CRITICAL_SECTION g_dbLock;
static volatile LONGLONG g_lastActivityTick = 0;
static volatile LONG g_hasSeenClient = 0;
static volatile LONG g_activeSseClients = 0;
static volatile LONGLONG g_lastZeroSseTick = 0;
static volatile LONG g_windowClosedSignal = 0;
static volatile LONGLONG g_windowClosedTick = 0;
static volatile LONG g_running = 1;

static void touch_activity(void) {
    InterlockedExchange64(&g_lastActivityTick, (LONGLONG)GetTickCount64());
}

static int send_all(SOCKET s, const char* buf, size_t len) {
    size_t total = 0;
    while (total < len) {
        int chunk = (len - total) > 65536 ? 65536 : (int)(len - total);
        int n = send(s, buf + total, chunk, 0);
        if (n <= 0) return -1;
        total += (size_t)n;
    }
    return 0;
}

static void send_http_response(
    SOCKET s,
    const char* status,
    const char* content_type,
    const void* body,
    size_t body_len
) {
    char header[512];
    int hlen = snprintf(
        header,
        sizeof(header),
        "HTTP/1.1 %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %llu\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: close\r\n"
        "\r\n",
        status,
        content_type,
        (unsigned long long)body_len
    );
    if (hlen > 0) {
        send_all(s, header, (size_t)hlen);
        if (body && body_len > 0) {
            send_all(s, (const char*)body, body_len);
        }
    }
}

static int ascii_strncasecmp(const char* a, const char* b, size_t n) {
    for (size_t i = 0; i < n; i++) {
        unsigned char ca = (unsigned char)a[i];
        unsigned char cb = (unsigned char)b[i];
        if (ca >= 'A' && ca <= 'Z') ca = (unsigned char)(ca + ('a' - 'A'));
        if (cb >= 'A' && cb <= 'Z') cb = (unsigned char)(cb + ('a' - 'A'));
        if (ca != cb) return (int)ca - (int)cb;
        if (ca == 0) return 0;
    }
    return 0;
}

static size_t parse_content_length(const char* headers, size_t headers_len) {
    const char* p = headers;
    const char* end = headers + headers_len;
    while (p < end) {
        const char* line_end = strstr(p, "\r\n");
        if (!line_end || line_end > end) break;
        size_t line_len = (size_t)(line_end - p);
        if (line_len > 15 && ascii_strncasecmp(p, "Content-Length:", 15) == 0) {
            const char* val = p + 15;
            while (*val == ' ' || *val == '\t') val++;
            unsigned long long cl = strtoull(val, NULL, 10);
            if (cl > 64ULL * 1024ULL * 1024ULL) cl = 64ULL * 1024ULL * 1024ULL;
            return (size_t)cl;
        }
        p = line_end + 2;
    }
    return 0;
}

static void json_escape_wstring(const wchar_t* wstr, char* out, size_t out_cap) {
    char utf8[MAX_PATH * 4];
    int n = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, utf8, (int)sizeof(utf8), NULL, NULL);
    if (n <= 0) {
        out[0] = '\0';
        return;
    }
    size_t j = 0;
    for (int i = 0; utf8[i] != '\0' && j + 3 < out_cap; i++) {
        char c = utf8[i];
        if (c == '\\' || c == '"') {
            out[j++] = '\\';
            out[j++] = c;
        } else if ((unsigned char)c >= 0x20) {
            out[j++] = c;
        }
    }
    out[j] = '\0';
}

static char* read_file_bytes_locked(const wchar_t* path, size_t* out_size) {
    *out_size = 0;
    HANDLE hFile = CreateFileW(
        path,
        GENERIC_READ,
        FILE_SHARE_READ,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );
    if (hFile == INVALID_HANDLE_VALUE) return NULL;

    LARGE_INTEGER li;
    if (!GetFileSizeEx(hFile, &li) || li.QuadPart <= 0 || li.QuadPart > 64LL * 1024LL * 1024LL) {
        CloseHandle(hFile);
        return NULL;
    }

    size_t sz = (size_t)li.QuadPart;
    char* buf = (char*)malloc(sz + 1);
    if (!buf) {
        CloseHandle(hFile);
        return NULL;
    }

    size_t total = 0;
    while (total < sz) {
        DWORD to_read = (sz - total) > 65536 ? 65536 : (DWORD)(sz - total);
        DWORD got = 0;
        if (!ReadFile(hFile, buf + total, to_read, &got, NULL) || got == 0) break;
        total += (size_t)got;
    }
    CloseHandle(hFile);
    buf[total] = '\0';
    *out_size = total;
    return buf;
}

static int write_db_atomic_locked(const char* data, size_t len) {
    if (PathFileExistsW(g_dbPath)) {
        CopyFileW(g_dbPath, g_dbBakPath, FALSE);
    }

    HANDLE hTmp = CreateFileW(
        g_dbTmpPath,
        GENERIC_WRITE,
        0,
        NULL,
        CREATE_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );
    if (hTmp == INVALID_HANDLE_VALUE) return -1;

    size_t total = 0;
    while (total < len) {
        DWORD chunk = (len - total) > 65536 ? 65536 : (DWORD)(len - total);
        DWORD written = 0;
        if (!WriteFile(hTmp, data + total, chunk, &written, NULL) || written == 0) {
            CloseHandle(hTmp);
            DeleteFileW(g_dbTmpPath);
            return -1;
        }
        total += (size_t)written;
    }

    FlushFileBuffers(hTmp);
    CloseHandle(hTmp);

    if (!MoveFileExW(
            g_dbTmpPath,
            g_dbPath,
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH
        )) {
        DeleteFileW(g_dbTmpPath);
        return -1;
    }
    return 0;
}

static const EmbeddedAsset* find_embedded_asset(const char* url_path) {
    for (size_t i = 0; i < EMBEDDED_ASSETS_COUNT; i++) {
        if (strcmp(EMBEDDED_ASSETS[i].url_path, url_path) == 0) {
            return &EMBEDDED_ASSETS[i];
        }
    }
    return NULL;
}

static DWORD WINAPI handle_client_thread(LPVOID param) {
    SOCKET client = (SOCKET)(uintptr_t)param;
    DWORD timeout_ms = 10000;
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout_ms, sizeof(timeout_ms));
    setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, (const char*)&timeout_ms, sizeof(timeout_ms));

    size_t cap = 8192;
    size_t len = 0;
    char* buf = (char*)malloc(cap);
    if (!buf) {
        closesocket(client);
        return 0;
    }

    char* header_end = NULL;
    while (len < 65536) {
        if (len + 1 >= cap) {
            cap *= 2;
            char* nb = (char*)realloc(buf, cap);
            if (!nb) {
                free(buf);
                closesocket(client);
                return 0;
            }
            buf = nb;
        }
        int n = recv(client, buf + len, (int)(cap - len - 1), 0);
        if (n <= 0) break;
        len += (size_t)n;
        buf[len] = '\0';
        header_end = strstr(buf, "\r\n\r\n");
        if (header_end) break;
    }

    if (!header_end) {
        free(buf);
        closesocket(client);
        return 0;
    }

    size_t headers_size = (size_t)(header_end - buf) + 4;
    size_t content_len = parse_content_length(buf, headers_size);
    size_t total_needed = headers_size + content_len;

    if (total_needed > cap - 1) {
        char* nb = (char*)realloc(buf, total_needed + 1);
        if (!nb) {
            free(buf);
            closesocket(client);
            return 0;
        }
        buf = nb;
        cap = total_needed + 1;
    }

    while (len < total_needed) {
        int n = recv(client, buf + len, (int)(total_needed - len), 0);
        if (n <= 0) break;
        len += (size_t)n;
    }
    buf[len] = '\0';

    char method[16] = {0};
    char raw_path[1024] = {0};
    sscanf(buf, "%15s %1023s", method, raw_path);

    char* qmark = strchr(raw_path, '?');
    if (qmark) *qmark = '\0';

    const char* body_ptr = buf + headers_size;
    size_t body_actual_len = len >= headers_size ? (len - headers_size) : 0;
    if (body_actual_len > content_len) body_actual_len = content_len;

    touch_activity();

    if (strcmp(raw_path, "/api/desktop/info") == 0 && strcmp(method, "GET") == 0) {
        InterlockedExchange(&g_hasSeenClient, 1);
        InterlockedExchange(&g_windowClosedSignal, 0);
        char esc_db[MAX_PATH * 6];
        char esc_dir[MAX_PATH * 6];
        json_escape_wstring(g_dbPath, esc_db, sizeof(esc_db));
        json_escape_wstring(g_dataDir, esc_dir, sizeof(esc_dir));

        char resp[MAX_PATH * 13];
        int rlen = snprintf(
            resp,
            sizeof(resp),
            "{\"isDesktop\":true,\"storagePath\":\"%s\",\"dataDir\":\"%s\"}",
            esc_db,
            esc_dir
        );
        send_http_response(client, "200 OK", "application/json; charset=utf-8", resp, (size_t)rlen);
    } else if (strcmp(raw_path, "/api/desktop/events") == 0 && strcmp(method, "GET") == 0) {
        free(buf);
        const char* sse_hdr =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/event-stream\r\n"
            "Cache-Control: no-cache\r\n"
            "Connection: keep-alive\r\n"
            "\r\n"
            ": connected\n\n";
        if (send_all(client, sse_hdr, strlen(sse_hdr)) == 0) {
            InterlockedIncrement(&g_activeSseClients);
            InterlockedExchange(&g_hasSeenClient, 1);
            InterlockedExchange(&g_windowClosedSignal, 0);

            int ticks = 0;
            while (InterlockedCompareExchange(&g_running, 1, 1) == 1) {
                fd_set rfds;
                FD_ZERO(&rfds);
                FD_SET(client, &rfds);
                struct timeval tv;
                tv.tv_sec = 1;
                tv.tv_usec = 0;
                int sel = select(0, &rfds, NULL, NULL, &tv);
                if (sel > 0) {
                    char tmp[64];
                    int r = recv(client, tmp, sizeof(tmp), 0);
                    if (r <= 0) break;
                } else if (sel < 0) {
                    break;
                }
                ticks++;
                if (ticks >= 15) {
                    ticks = 0;
                    const char* ka = ": keepalive\n\n";
                    if (send_all(client, ka, strlen(ka)) != 0) break;
                }
            }

            LONG rem = InterlockedDecrement(&g_activeSseClients);
            if (rem <= 0) {
                InterlockedExchange64(&g_lastZeroSseTick, (LONGLONG)GetTickCount64());
            }
        }
        shutdown(client, SD_BOTH);
        closesocket(client);
        return 0;
    } else if (strcmp(raw_path, "/api/desktop/ping") == 0) {
        InterlockedExchange(&g_hasSeenClient, 1);
        InterlockedExchange(&g_windowClosedSignal, 0);
        const char* ok = "{\"ok\":true}";
        send_http_response(client, "200 OK", "application/json; charset=utf-8", ok, strlen(ok));
    } else if (strcmp(raw_path, "/api/desktop/window-closed") == 0) {
        InterlockedExchange64(&g_windowClosedTick, (LONGLONG)GetTickCount64());
        InterlockedExchange(&g_windowClosedSignal, 1);
        const char* ok = "{\"ok\":true}";
        send_http_response(client, "200 OK", "application/json; charset=utf-8", ok, strlen(ok));
    } else if (strcmp(raw_path, "/api/desktop/open-folder") == 0 && strcmp(method, "POST") == 0) {
        ShellExecuteW(NULL, L"open", g_dataDir, NULL, NULL, SW_SHOWNORMAL);
        const char* ok = "{\"ok\":true}";
        send_http_response(client, "200 OK", "application/json; charset=utf-8", ok, strlen(ok));
    } else if (strcmp(raw_path, "/api/desktop/db") == 0 && strcmp(method, "GET") == 0) {
        EnterCriticalSection(&g_dbLock);
        size_t db_sz = 0;
        char* db_bytes = read_file_bytes_locked(g_dbPath, &db_sz);
        if (!db_bytes && PathFileExistsW(g_dbBakPath)) {
            db_bytes = read_file_bytes_locked(g_dbBakPath, &db_sz);
        }
        LeaveCriticalSection(&g_dbLock);

        if (db_bytes) {
            send_http_response(client, "200 OK", "application/json; charset=utf-8", db_bytes, db_sz);
            free(db_bytes);
        } else {
            const char* empty_json = "null";
            send_http_response(client, "200 OK", "application/json; charset=utf-8", empty_json, 4);
        }
    } else if (strcmp(raw_path, "/api/desktop/db") == 0 && strcmp(method, "PUT") == 0) {
        int rc = -1;
        if (body_actual_len > 2) {
            EnterCriticalSection(&g_dbLock);
            rc = write_db_atomic_locked(body_ptr, body_actual_len);
            LeaveCriticalSection(&g_dbLock);
        }
        if (rc == 0) {
            const char* ok = "{\"ok\":true}";
            send_http_response(client, "200 OK", "application/json; charset=utf-8", ok, strlen(ok));
        } else {
            const char* err = "{\"error\":\"Error escribiendo en disco\"}";
            send_http_response(
                client,
                "500 Internal Server Error",
                "application/json; charset=utf-8",
                err,
                strlen(err)
            );
        }
    } else {
        const char* lookup = strcmp(raw_path, "/") == 0 ? "/index.html" : raw_path;
        const EmbeddedAsset* asset = find_embedded_asset(lookup);
        if (!asset && strncmp(raw_path, "/api/", 5) != 0) {
            asset = find_embedded_asset("/index.html");
        }
        if (asset) {
            send_http_response(client, "200 OK", asset->content_type, asset->data, asset->size);
        } else {
            const char* nf = "{\"error\":\"No encontrado\"}";
            send_http_response(
                client,
                "404 Not Found",
                "application/json; charset=utf-8",
                nf,
                strlen(nf)
            );
        }
    }

    free(buf);
    shutdown(client, SD_BOTH);
    closesocket(client);
    return 0;
}

static DWORD WINAPI accept_loop_thread(LPVOID param) {
    SOCKET listen_sock = (SOCKET)(uintptr_t)param;
    while (InterlockedCompareExchange(&g_running, 1, 1) == 1) {
        SOCKET client = accept(listen_sock, NULL, NULL);
        if (client == INVALID_SOCKET) break;
        HANDLE hThread = CreateThread(
            NULL,
            0,
            handle_client_thread,
            (LPVOID)(uintptr_t)client,
            0,
            NULL
        );
        if (hThread) {
            CloseHandle(hThread);
        } else {
            closesocket(client);
        }
    }
    return 0;
}

static int find_reg_app_path(HKEY root, const wchar_t* exe_name, wchar_t* out_path, DWORD out_cap) {
    wchar_t subkey[256];
    _snwprintf(
        subkey,
        255,
        L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\%s",
        exe_name
    );
    subkey[255] = L'\0';

    HKEY hKey = NULL;
    if (RegOpenKeyExW(root, subkey, 0, KEY_READ, &hKey) != ERROR_SUCCESS) return 0;

    DWORD type = 0;
    DWORD bytes = out_cap * sizeof(wchar_t);
    LONG res = RegQueryValueExW(hKey, NULL, NULL, &type, (LPBYTE)out_path, &bytes);
    RegCloseKey(hKey);

    if (res == ERROR_SUCCESS && (type == REG_SZ || type == REG_EXPAND_SZ) && PathFileExistsW(out_path)) {
        return 1;
    }
    return 0;
}

static int find_chromium_app_host(wchar_t* out_path, DWORD out_cap) {
    const wchar_t* reg_candidates[] = { L"msedge.exe", L"chrome.exe", L"brave.exe" };
    for (int i = 0; i < 3; i++) {
        if (find_reg_app_path(HKEY_LOCAL_MACHINE, reg_candidates[i], out_path, out_cap)) return 1;
        if (find_reg_app_path(HKEY_CURRENT_USER, reg_candidates[i], out_path, out_cap)) return 1;
    }

    const wchar_t* env_templates[][2] = {
        { L"ProgramFiles(x86)", L"\\Microsoft\\Edge\\Application\\msedge.exe" },
        { L"ProgramFiles",      L"\\Microsoft\\Edge\\Application\\msedge.exe" },
        { L"ProgramFiles",      L"\\Google\\Chrome\\Application\\chrome.exe" },
        { L"ProgramFiles(x86)", L"\\Google\\Chrome\\Application\\chrome.exe" },
        { L"LOCALAPPDATA",      L"\\Google\\Chrome\\Application\\chrome.exe" },
        { L"ProgramFiles",      L"\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
        { L"LOCALAPPDATA",      L"\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
    };

    for (size_t i = 0; i < sizeof(env_templates) / sizeof(env_templates[0]); i++) {
        wchar_t base[MAX_PATH];
        DWORD len = GetEnvironmentVariableW(env_templates[i][0], base, MAX_PATH);
        if (len > 0 && len < MAX_PATH) {
            _snwprintf(out_path, out_cap - 1, L"%s%s", base, env_templates[i][1]);
            out_path[out_cap - 1] = L'\0';
            if (PathFileExistsW(out_path)) return 1;
        }
    }
    return 0;
}

static HANDLE launch_desktop_window(unsigned short port) {
    wchar_t url[128];
    _snwprintf(url, 127, L"http://127.0.0.1:%u/", (unsigned int)port);
    url[127] = L'\0';

    wchar_t browser_exe[MAX_PATH * 2];
    if (find_chromium_app_host(browser_exe, MAX_PATH * 2)) {
        CreateDirectoryW(g_profileDir, NULL);
        wchar_t cmdline[MAX_PATH * 6];
        _snwprintf(
            cmdline,
            (sizeof(cmdline) / sizeof(wchar_t)) - 1,
            L"\"%s\" --app=\"%s\" --user-data-dir=\"%s\" --window-size=1380,880 "
            L"--no-first-run --no-default-browser-check --disable-background-mode "
            L"--disable-features=msEdgeWelcomePage,msWelcomePage,Translate",
            browser_exe,
            url,
            g_profileDir
        );
        cmdline[(sizeof(cmdline) / sizeof(wchar_t)) - 1] = L'\0';

        STARTUPINFOW si;
        PROCESS_INFORMATION pi;
        ZeroMemory(&si, sizeof(si));
        ZeroMemory(&pi, sizeof(pi));
        si.cb = sizeof(si);

        if (CreateProcessW(browser_exe, cmdline, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
            CloseHandle(pi.hThread);
            return pi.hProcess;
        }
    }

    ShellExecuteW(NULL, L"open", url, NULL, NULL, SW_SHOWNORMAL);
    return NULL;
}

static void init_storage_paths(void) {
    wchar_t exe_path[MAX_PATH * 2];
    GetModuleFileNameW(NULL, exe_path, MAX_PATH * 2);
    PathRemoveFileSpecW(exe_path);

    wchar_t portable_dir[MAX_PATH * 2];
    _snwprintf(portable_dir, MAX_PATH * 2 - 1, L"%s\\datos_portables", exe_path);
    portable_dir[MAX_PATH * 2 - 1] = L'\0';

    if (PathIsDirectoryW(portable_dir)) {
        wcsncpy(g_dataDir, portable_dir, MAX_PATH * 2 - 1);
    } else {
        wchar_t local_app[MAX_PATH * 2];
        DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", local_app, MAX_PATH * 2);
        if (n > 0 && n < MAX_PATH * 2) {
            _snwprintf(g_dataDir, MAX_PATH * 2 - 1, L"%s\\NeonKakeibo", local_app);
        } else {
            _snwprintf(g_dataDir, MAX_PATH * 2 - 1, L"%s\\datos_kakeibo", exe_path);
        }
    }
    g_dataDir[MAX_PATH * 2 - 1] = L'\0';
    CreateDirectoryW(g_dataDir, NULL);

    _snwprintf(g_dbPath, MAX_PATH * 2 - 1, L"%s\\kakeibo-store.json", g_dataDir);
    _snwprintf(g_dbTmpPath, MAX_PATH * 2 - 1, L"%s\\kakeibo-store.tmp.json", g_dataDir);
    _snwprintf(g_dbBakPath, MAX_PATH * 2 - 1, L"%s\\kakeibo-store.bak.json", g_dataDir);
    _snwprintf(g_portFilePath, MAX_PATH * 2 - 1, L"%s\\active_port.txt", g_dataDir);
    _snwprintf(g_profileDir, MAX_PATH * 2 - 1, L"%s\\WindowProfile", g_dataDir);
}

static void save_active_port(unsigned short port) {
    char buf[32];
    int len = snprintf(buf, sizeof(buf), "%u", (unsigned int)port);
    HANDLE hFile = CreateFileW(
        g_portFilePath,
        GENERIC_WRITE,
        FILE_SHARE_READ,
        NULL,
        CREATE_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );
    if (hFile != INVALID_HANDLE_VALUE) {
        DWORD written = 0;
        WriteFile(hFile, buf, (DWORD)len, &written, NULL);
        CloseHandle(hFile);
    }
}

static unsigned short read_active_port(void) {
    HANDLE hFile = CreateFileW(
        g_portFilePath,
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );
    if (hFile == INVALID_HANDLE_VALUE) return 0;
    char buf[32] = {0};
    DWORD got = 0;
    ReadFile(hFile, buf, sizeof(buf) - 1, &got, NULL);
    CloseHandle(hFile);
    return (unsigned short)atoi(buf);
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd) {
    (void)hInstance;
    (void)hPrevInstance;
    (void)lpCmdLine;
    (void)nShowCmd;

    SetProcessDPIAware();
    init_storage_paths();

    HANDLE hMutex = CreateMutexW(NULL, FALSE, L"Local\\NeonKakeiboDesktopApp_v1");
    if (hMutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        unsigned short existing_port = read_active_port();
        if (existing_port > 0) {
            HANDLE hSecond = launch_desktop_window(existing_port);
            if (hSecond) CloseHandle(hSecond);
            CloseHandle(hMutex);
            return 0;
        }
    }

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        MessageBoxW(
            NULL,
            L"No se pudo iniciar el subsistema local de red de Windows.",
            L"Neon Kakeibo",
            MB_ICONERROR | MB_OK
        );
        return 1;
    }

    InitializeCriticalSection(&g_dbLock);
    touch_activity();

    SOCKET listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listen_sock == INVALID_SOCKET) {
        WSACleanup();
        return 1;
    }

    struct sockaddr_in addr;
    ZeroMemory(&addr, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(0);

    if (bind(listen_sock, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR ||
        listen(listen_sock, SOMAXCONN) == SOCKET_ERROR) {
        closesocket(listen_sock);
        WSACleanup();
        return 1;
    }

    int addr_len = sizeof(addr);
    getsockname(listen_sock, (struct sockaddr*)&addr, &addr_len);
    unsigned short port = ntohs(addr.sin_port);
    save_active_port(port);

    HANDLE hAcceptThread = CreateThread(
        NULL,
        0,
        accept_loop_thread,
        (LPVOID)(uintptr_t)listen_sock,
        0,
        NULL
    );

    ULONGLONG launch_tick = GetTickCount64();
    HANDLE hWindowProc = launch_desktop_window(port);

    while (1) {
        Sleep(350);
        ULONGLONG now = GetTickCount64();
        LONG active_sse = InterlockedCompareExchange(&g_activeSseClients, 0, 0);
        LONG seen = InterlockedCompareExchange(&g_hasSeenClient, 0, 0);
        ULONGLONG zero_sse_tick = (ULONGLONG)InterlockedCompareExchange64(&g_lastZeroSseTick, 0, 0);
        LONG closed_sig = InterlockedCompareExchange(&g_windowClosedSignal, 0, 0);
        ULONGLONG closed_tick = (ULONGLONG)InterlockedCompareExchange64(&g_windowClosedTick, 0, 0);

        // Keep running indefinitely while at least one desktop window holds an active connection
        if (active_sse > 0) {
            continue;
        }

        // Once the window has connected and then closed (0 active connections for >2.8s), shut down cleanly
        if (seen && zero_sse_tick > 0 && (now - zero_sse_tick > 2800)) {
            break;
        }

        if (closed_sig && (now - closed_tick > 2800)) {
            break;
        }

        // Startup safety timeout if window failed to open after 30s
        if (!seen && (now - launch_tick > 30000)) {
            if (hWindowProc == NULL || WaitForSingleObject(hWindowProc, 0) == WAIT_OBJECT_0) {
                break;
            }
        }
    }

    InterlockedExchange(&g_running, 0);
    DeleteFileW(g_portFilePath);
    closesocket(listen_sock);
    if (hAcceptThread) {
        WaitForSingleObject(hAcceptThread, 1500);
        CloseHandle(hAcceptThread);
    }
    if (hWindowProc) {
        CloseHandle(hWindowProc);
    }
    DeleteCriticalSection(&g_dbLock);
    WSACleanup();
    if (hMutex) CloseHandle(hMutex);
    return 0;
}
