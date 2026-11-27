#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#define _CRT_SECURE_NO_WARNINGS

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "embedded_assets.h"

static wchar_t g_exeFullPath[MAX_PATH * 2];
static wchar_t g_dataDir[MAX_PATH * 2];
static wchar_t g_dbPath[MAX_PATH * 2];
static wchar_t g_dbTmpPath[MAX_PATH * 2];
static wchar_t g_dbBakPath[MAX_PATH * 2];
static wchar_t g_backupCfgPath[MAX_PATH * 2];
static wchar_t g_taskXmlPath[MAX_PATH * 2];
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

typedef struct {
    int enabled;
    char frequency[16]; // "daily", "weekly", "monthly"
    int dayOfWeek;      // 1 = Mon ... 7 = Sun
    int dayOfMonth;     // 1 .. 28
    int hour;           // 0 .. 23
    int minute;         // 0 .. 59
    int maxBackups;     // 2 .. 100
    int runOnStartupIfMissed;
    int taskRegistered;
    unsigned long long enabledSinceSec;
    unsigned long long lastBackupSec;
    wchar_t targetDir[MAX_PATH * 2];
    wchar_t lastBackupAt[64];
    wchar_t lastBackupFile[MAX_PATH * 2];
    wchar_t lastError[256];
    wchar_t registeredExePath[MAX_PATH * 2];
} BackupConfig;

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
    char utf8[MAX_PATH * 6];
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

static void xml_escape_wstring(const wchar_t* src, wchar_t* dst, size_t dst_cap) {
    size_t j = 0;
    for (size_t i = 0; src[i] != L'\0' && j + 8 < dst_cap; i++) {
        wchar_t c = src[i];
        if (c == L'&') {
            wcscpy(&dst[j], L"&amp;");
            j += 5;
        } else if (c == L'<') {
            wcscpy(&dst[j], L"&lt;");
            j += 4;
        } else if (c == L'>') {
            wcscpy(&dst[j], L"&gt;");
            j += 4;
        } else if (c == L'"') {
            wcscpy(&dst[j], L"&quot;");
            j += 6;
        } else if (c == L'\'') {
            wcscpy(&dst[j], L"&apos;");
            j += 6;
        } else {
            dst[j++] = c;
        }
    }
    dst[j] = L'\0';
}

static char* read_file_bytes_locked(const wchar_t* path, size_t* out_size) {
    *out_size = 0;
    HANDLE hFile = CreateFileW(
        path,
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
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

static int write_bytes_atomic(const wchar_t* final_path, const wchar_t* tmp_path, const void* data, size_t len) {
    HANDLE hTmp = CreateFileW(
        tmp_path,
        GENERIC_WRITE,
        0,
        NULL,
        CREATE_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );
    if (hTmp == INVALID_HANDLE_VALUE) return -1;

    const char* ptr = (const char*)data;
    size_t total = 0;
    while (total < len) {
        DWORD chunk = (len - total) > 65536 ? 65536 : (DWORD)(len - total);
        DWORD written = 0;
        if (!WriteFile(hTmp, ptr + total, chunk, &written, NULL) || written == 0) {
            CloseHandle(hTmp);
            DeleteFileW(tmp_path);
            return -1;
        }
        total += (size_t)written;
    }

    FlushFileBuffers(hTmp);
    CloseHandle(hTmp);

    if (!MoveFileExW(
            tmp_path,
            final_path,
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH
        )) {
        DeleteFileW(tmp_path);
        return -1;
    }
    return 0;
}

static int write_db_atomic_locked(const char* data, size_t len) {
    if (PathFileExistsW(g_dbPath)) {
        CopyFileW(g_dbPath, g_dbBakPath, FALSE);
    }
    return write_bytes_atomic(g_dbPath, g_dbTmpPath, data, len);
}

/* ---------------- Time & Schedule Math ---------------- */

static unsigned long long systemtime_to_sec(const SYSTEMTIME* st) {
    FILETIME ft;
    if (!SystemTimeToFileTime(st, &ft)) return 0;
    ULARGE_INTEGER uli;
    uli.LowPart = ft.dwLowDateTime;
    uli.HighPart = ft.dwHighDateTime;
    if (uli.QuadPart < 116444736000000000ULL) return 0;
    return (uli.QuadPart - 116444736000000000ULL) / 10000000ULL;
}

static unsigned long long current_local_sec(SYSTEMTIME* out_local) {
    SYSTEMTIME st;
    GetLocalTime(&st);
    if (out_local) *out_local = st;
    return systemtime_to_sec(&st);
}

static int is_scheduled_backup_due(const BackupConfig* cfg) {
    if (!cfg->enabled) return 0;

    SYSTEMTIME now;
    unsigned long long now_sec = current_local_sec(&now);
    if (now_sec == 0) return 0;

    SYSTEMTIME cand = now;
    cand.wHour = (WORD)(cfg->hour >= 0 && cfg->hour <= 23 ? cfg->hour : 20);
    cand.wMinute = (WORD)(cfg->minute >= 0 && cfg->minute <= 59 ? cfg->minute : 0);
    cand.wSecond = 0;
    cand.wMilliseconds = 0;

    unsigned long long latest_due = 0;

    if (strcmp(cfg->frequency, "daily") == 0) {
        unsigned long long today_slot = systemtime_to_sec(&cand);
        latest_due = (today_slot <= now_sec) ? today_slot : (today_slot - 86400ULL);
    } else if (strcmp(cfg->frequency, "monthly") == 0) {
        int dom = cfg->dayOfMonth;
        if (dom < 1) dom = 1;
        if (dom > 28) dom = 28;
        cand.wDay = (WORD)dom;
        unsigned long long this_month_slot = systemtime_to_sec(&cand);
        if (this_month_slot > 0 && this_month_slot <= now_sec) {
            latest_due = this_month_slot;
        } else {
            SYSTEMTIME prev = cand;
            if (prev.wMonth == 1) {
                prev.wMonth = 12;
                prev.wYear = (WORD)(prev.wYear - 1);
            } else {
                prev.wMonth = (WORD)(prev.wMonth - 1);
            }
            prev.wDay = (WORD)dom;
            latest_due = systemtime_to_sec(&prev);
        }
    } else {
        // Default: weekly (dayOfWeek: 1=Mon ... 7=Sun)
        int target_dow = cfg->dayOfWeek;
        if (target_dow < 1 || target_dow > 7) target_dow = 6;
        int iso_now = (now.wDayOfWeek == 0) ? 7 : (int)now.wDayOfWeek;
        int days_back = (iso_now - target_dow + 7) % 7;
        unsigned long long today_slot = systemtime_to_sec(&cand);
        unsigned long long slot = today_slot - ((unsigned long long)days_back * 86400ULL);
        if (days_back == 0 && slot > now_sec) {
            slot -= 7ULL * 86400ULL;
        }
        latest_due = slot;
    }

    if (latest_due == 0) return 0;
    if (cfg->enabledSinceSec > 0 && latest_due < cfg->enabledSinceSec) return 0;
    return (cfg->lastBackupSec < latest_due) ? 1 : 0;
}

/* ---------------- Config Persistence (UTF-8 key=value) ---------------- */

static void init_default_backup_config(BackupConfig* cfg) {
    ZeroMemory(cfg, sizeof(*cfg));
    cfg->enabled = 0;
    strcpy(cfg->frequency, "weekly");
    cfg->dayOfWeek = 6;  // Sabado
    cfg->dayOfMonth = 1; // Dia 1
    cfg->hour = 20;      // 20:00
    cfg->minute = 0;
    cfg->maxBackups = 12;
    cfg->runOnStartupIfMissed = 1;
    cfg->taskRegistered = 0;
    _snwprintf(cfg->targetDir, MAX_PATH * 2 - 1, L"%s\\Respaldos_Automaticos", g_dataDir);
    cfg->targetDir[MAX_PATH * 2 - 1] = L'\0';
}

static void utf8_to_wide_safe(const char* src, wchar_t* dst, size_t dst_cap) {
    if (!src || !src[0]) {
        dst[0] = L'\0';
        return;
    }
    int n = MultiByteToWideChar(CP_UTF8, 0, src, -1, dst, (int)dst_cap);
    if (n <= 0) {
        dst[0] = L'\0';
    } else {
        dst[dst_cap - 1] = L'\0';
    }
}

static void wide_to_utf8_safe(const wchar_t* src, char* dst, size_t dst_cap) {
    if (!src || !src[0]) {
        dst[0] = '\0';
        return;
    }
    int n = WideCharToMultiByte(CP_UTF8, 0, src, -1, dst, (int)dst_cap, NULL, NULL);
    if (n <= 0) {
        dst[0] = '\0';
    } else {
        dst[dst_cap - 1] = '\0';
    }
}

static void load_backup_config_locked(BackupConfig* cfg) {
    init_default_backup_config(cfg);

    size_t sz = 0;
    char* raw = read_file_bytes_locked(g_backupCfgPath, &sz);
    if (!raw) return;

    char* line = raw;
    while (line && *line) {
        char* next = strchr(line, '\n');
        if (next) {
            *next = '\0';
            next++;
        }
        size_t l = strlen(line);
        while (l > 0 && (line[l - 1] == '\r' || line[l - 1] == ' ')) {
            line[--l] = '\0';
        }
        char* eq = strchr(line, '=');
        if (eq) {
            *eq = '\0';
            const char* k = line;
            const char* v = eq + 1;

            if (strcmp(k, "enabled") == 0) cfg->enabled = atoi(v) ? 1 : 0;
            else if (strcmp(k, "frequency") == 0) {
                if (strcmp(v, "daily") == 0 || strcmp(v, "weekly") == 0 || strcmp(v, "monthly") == 0) {
                    strncpy(cfg->frequency, v, sizeof(cfg->frequency) - 1);
                }
            } else if (strcmp(k, "dayOfWeek") == 0) {
                int d = atoi(v);
                if (d >= 1 && d <= 7) cfg->dayOfWeek = d;
            } else if (strcmp(k, "dayOfMonth") == 0) {
                int d = atoi(v);
                if (d >= 1 && d <= 28) cfg->dayOfMonth = d;
            } else if (strcmp(k, "hour") == 0) {
                int h = atoi(v);
                if (h >= 0 && h <= 23) cfg->hour = h;
            } else if (strcmp(k, "minute") == 0) {
                int m = atoi(v);
                if (m >= 0 && m <= 59) cfg->minute = m;
            } else if (strcmp(k, "maxBackups") == 0) {
                int mb = atoi(v);
                if (mb >= 2 && mb <= 100) cfg->maxBackups = mb;
            } else if (strcmp(k, "runOnStartupIfMissed") == 0) {
                cfg->runOnStartupIfMissed = atoi(v) ? 1 : 0;
            } else if (strcmp(k, "taskRegistered") == 0) {
                cfg->taskRegistered = atoi(v) ? 1 : 0;
            } else if (strcmp(k, "enabledSinceSec") == 0) {
                cfg->enabledSinceSec = strtoull(v, NULL, 10);
            } else if (strcmp(k, "lastBackupSec") == 0) {
                cfg->lastBackupSec = strtoull(v, NULL, 10);
            } else if (strcmp(k, "targetDir") == 0 && v[0] != '\0') {
                utf8_to_wide_safe(v, cfg->targetDir, MAX_PATH * 2);
            } else if (strcmp(k, "lastBackupAt") == 0) {
                utf8_to_wide_safe(v, cfg->lastBackupAt, 64);
            } else if (strcmp(k, "lastBackupFile") == 0) {
                utf8_to_wide_safe(v, cfg->lastBackupFile, MAX_PATH * 2);
            } else if (strcmp(k, "lastError") == 0) {
                utf8_to_wide_safe(v, cfg->lastError, 256);
            } else if (strcmp(k, "registeredExePath") == 0) {
                utf8_to_wide_safe(v, cfg->registeredExePath, MAX_PATH * 2);
            }
        }
        line = next;
    }

    free(raw);
}

static void save_backup_config_locked(const BackupConfig* cfg) {
    char u_target[MAX_PATH * 6];
    char u_lastAt[256];
    char u_lastFile[MAX_PATH * 6];
    char u_lastErr[1024];
    char u_regExe[MAX_PATH * 6];

    wide_to_utf8_safe(cfg->targetDir, u_target, sizeof(u_target));
    wide_to_utf8_safe(cfg->lastBackupAt, u_lastAt, sizeof(u_lastAt));
    wide_to_utf8_safe(cfg->lastBackupFile, u_lastFile, sizeof(u_lastFile));
    wide_to_utf8_safe(cfg->lastError, u_lastErr, sizeof(u_lastErr));
    wide_to_utf8_safe(cfg->registeredExePath, u_regExe, sizeof(u_regExe));

    size_t cap = sizeof(u_target) + sizeof(u_lastFile) + sizeof(u_regExe) + 2048;
    char* out = (char*)malloc(cap);
    if (!out) return;

    int len = snprintf(
        out,
        cap,
        "enabled=%d\n"
        "frequency=%s\n"
        "dayOfWeek=%d\n"
        "dayOfMonth=%d\n"
        "hour=%d\n"
        "minute=%d\n"
        "maxBackups=%d\n"
        "runOnStartupIfMissed=%d\n"
        "taskRegistered=%d\n"
        "enabledSinceSec=%llu\n"
        "lastBackupSec=%llu\n"
        "targetDir=%s\n"
        "lastBackupAt=%s\n"
        "lastBackupFile=%s\n"
        "lastError=%s\n"
        "registeredExePath=%s\n",
        cfg->enabled,
        cfg->frequency,
        cfg->dayOfWeek,
        cfg->dayOfMonth,
        cfg->hour,
        cfg->minute,
        cfg->maxBackups,
        cfg->runOnStartupIfMissed,
        cfg->taskRegistered,
        cfg->enabledSinceSec,
        cfg->lastBackupSec,
        u_target,
        u_lastAt,
        u_lastFile,
        u_lastErr,
        u_regExe
    );

    if (len > 0) {
        wchar_t tmp_cfg[MAX_PATH * 2];
        _snwprintf(tmp_cfg, MAX_PATH * 2 - 1, L"%s.tmp", g_backupCfgPath);
        tmp_cfg[MAX_PATH * 2 - 1] = L'\0';
        write_bytes_atomic(g_backupCfgPath, tmp_cfg, out, (size_t)len);
    }
    free(out);
}

/* ---------------- Windows Task Scheduler & Startup Registration ---------------- */

static int run_command_hidden(wchar_t* cmdline) {
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    if (!CreateProcessW(NULL, cmdline, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        return -1;
    }
    WaitForSingleObject(pi.hProcess, 5000);
    DWORD exit_code = 1;
    GetExitCodeProcess(pi.hProcess, &exit_code);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return (exit_code == 0) ? 0 : -1;
}

static void sync_startup_registry(const BackupConfig* cfg) {
    HKEY hKey = NULL;
    if (RegCreateKeyExW(
            HKEY_CURRENT_USER,
            L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            0,
            NULL,
            0,
            KEY_SET_VALUE,
            NULL,
            &hKey,
            NULL
        ) != ERROR_SUCCESS) {
        return;
    }

    if (cfg->enabled && cfg->runOnStartupIfMissed) {
        wchar_t val[MAX_PATH * 3];
        _snwprintf(val, (sizeof(val) / sizeof(wchar_t)) - 1, L"\"%s\" --silent-backup", g_exeFullPath);
        val[(sizeof(val) / sizeof(wchar_t)) - 1] = L'\0';
        DWORD bytes = (DWORD)((wcslen(val) + 1) * sizeof(wchar_t));
        RegSetValueExW(hKey, L"NeonKakeiboAutoSalva", 0, REG_SZ, (const BYTE*)val, bytes);
    } else {
        RegDeleteValueW(hKey, L"NeonKakeiboAutoSalva");
    }

    RegCloseKey(hKey);
}

static void sync_windows_scheduler_locked(BackupConfig* cfg) {
    sync_startup_registry(cfg);

    if (!cfg->enabled) {
        wchar_t del_cmd[256];
        wcscpy(del_cmd, L"schtasks.exe /Delete /TN \"NeonKakeibo_AutoSalva\" /F");
        run_command_hidden(del_cmd);
        DeleteFileW(g_taskXmlPath);
        cfg->taskRegistered = 0;
        cfg->registeredExePath[0] = L'\0';
        return;
    }

    static const wchar_t* XML_DOW[8] = {
        L"Saturday", L"Monday", L"Tuesday", L"Wednesday",
        L"Thursday", L"Friday", L"Saturday", L"Sunday"
    };
    static const wchar_t* CLI_DOW[8] = {
        L"SAT", L"MON", L"TUE", L"WED", L"THU", L"FRI", L"SAT", L"SUN"
    };

    int dow = (cfg->dayOfWeek >= 1 && cfg->dayOfWeek <= 7) ? cfg->dayOfWeek : 6;
    int dom = (cfg->dayOfMonth >= 1 && cfg->dayOfMonth <= 28) ? cfg->dayOfMonth : 1;
    int hr = (cfg->hour >= 0 && cfg->hour <= 23) ? cfg->hour : 20;
    int mn = (cfg->minute >= 0 && cfg->minute <= 59) ? cfg->minute : 0;

    wchar_t esc_exe[MAX_PATH * 4];
    xml_escape_wstring(g_exeFullPath, esc_exe, MAX_PATH * 4);

    wchar_t schedule_block[1024];
    if (strcmp(cfg->frequency, "daily") == 0) {
        _snwprintf(
            schedule_block,
            1023,
            L"<ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>"
        );
    } else if (strcmp(cfg->frequency, "monthly") == 0) {
        _snwprintf(
            schedule_block,
            1023,
            L"<ScheduleByMonth><DaysOfMonth><Day>%d</Day></DaysOfMonth>"
            L"<Months><January/><February/><March/><April/><May/><June/>"
            L"<July/><August/><September/><October/><November/><December/></Months></ScheduleByMonth>",
            dom
        );
    } else {
        _snwprintf(
            schedule_block,
            1023,
            L"<ScheduleByWeek><WeeksInterval>1</WeeksInterval>"
            L"<DaysOfWeek><%s/></DaysOfWeek></ScheduleByWeek>",
            XML_DOW[dow]
        );
    }
    schedule_block[1023] = L'\0';

    wchar_t xml_buf[8192];
    int wlen = _snwprintf(
        xml_buf,
        8190,
        L"<?xml version=\"1.0\" encoding=\"UTF-16\"?>\r\n"
        L"<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\r\n"
        L"  <Triggers>\r\n"
        L"    <CalendarTrigger>\r\n"
        L"      <StartBoundary>2026-01-01T%02d:%02d:00</StartBoundary>\r\n"
        L"      <Enabled>true</Enabled>\r\n"
        L"      %s\r\n"
        L"    </CalendarTrigger>\r\n"
        L"  </Triggers>\r\n"
        L"  <Settings>\r\n"
        L"    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n"
        L"    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n"
        L"    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\r\n"
        L"    <AllowHardTerminate>true</AllowHardTerminate>\r\n"
        L"    <StartWhenAvailable>%s</StartWhenAvailable>\r\n"
        L"    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>\r\n"
        L"    <AllowStartOnDemand>true</AllowStartOnDemand>\r\n"
        L"    <Enabled>true</Enabled>\r\n"
        L"    <Hidden>true</Hidden>\r\n"
        L"    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>\r\n"
        L"  </Settings>\r\n"
        L"  <Actions Context=\"Author\">\r\n"
        L"    <Exec>\r\n"
        L"      <Command>\"%s\"</Command>\r\n"
        L"      <Arguments>--silent-backup</Arguments>\r\n"
        L"    </Exec>\r\n"
        L"  </Actions>\r\n"
        L"</Task>\r\n",
        hr,
        mn,
        schedule_block,
        cfg->runOnStartupIfMissed ? L"true" : L"false",
        esc_exe
    );

    int ok = -1;
    if (wlen > 0) {
        xml_buf[wlen] = L'\0';
        HANDLE hXml = CreateFileW(
            g_taskXmlPath,
            GENERIC_WRITE,
            0,
            NULL,
            CREATE_ALWAYS,
            FILE_ATTRIBUTE_NORMAL,
            NULL
        );
        if (hXml != INVALID_HANDLE_VALUE) {
            WORD bom = 0xFEFF;
            DWORD wr = 0;
            WriteFile(hXml, &bom, sizeof(bom), &wr, NULL);
            WriteFile(hXml, xml_buf, (DWORD)(wlen * sizeof(wchar_t)), &wr, NULL);
            CloseHandle(hXml);

            wchar_t create_cmd[MAX_PATH * 4];
            _snwprintf(
                create_cmd,
                (sizeof(create_cmd) / sizeof(wchar_t)) - 1,
                L"schtasks.exe /Create /TN \"NeonKakeibo_AutoSalva\" /XML \"%s\" /F",
                g_taskXmlPath
            );
            create_cmd[(sizeof(create_cmd) / sizeof(wchar_t)) - 1] = L'\0';
            ok = run_command_hidden(create_cmd);
        }
    }

    // Fallback CLI registration if XML import was rejected on restricted editions
    if (ok != 0) {
        wchar_t cli_cmd[MAX_PATH * 5];
        if (strcmp(cfg->frequency, "daily") == 0) {
            _snwprintf(
                cli_cmd,
                (sizeof(cli_cmd) / sizeof(wchar_t)) - 1,
                L"schtasks.exe /Create /TN \"NeonKakeibo_AutoSalva\" /TR \"\\\"%s\\\" --silent-backup\" /SC DAILY /ST %02d:%02d /F",
                g_exeFullPath,
                hr,
                mn
            );
        } else if (strcmp(cfg->frequency, "monthly") == 0) {
            _snwprintf(
                cli_cmd,
                (sizeof(cli_cmd) / sizeof(wchar_t)) - 1,
                L"schtasks.exe /Create /TN \"NeonKakeibo_AutoSalva\" /TR \"\\\"%s\\\" --silent-backup\" /SC MONTHLY /D %d /ST %02d:%02d /F",
                g_exeFullPath,
                dom,
                hr,
                mn
            );
        } else {
            _snwprintf(
                cli_cmd,
                (sizeof(cli_cmd) / sizeof(wchar_t)) - 1,
                L"schtasks.exe /Create /TN \"NeonKakeibo_AutoSalva\" /TR \"\\\"%s\\\" --silent-backup\" /SC WEEKLY /D %s /ST %02d:%02d /F",
                g_exeFullPath,
                CLI_DOW[dow],
                hr,
                mn
            );
        }
        cli_cmd[(sizeof(cli_cmd) / sizeof(wchar_t)) - 1] = L'\0';
        ok = run_command_hidden(cli_cmd);
    }

    cfg->taskRegistered = (ok == 0) ? 1 : 0;
    wcsncpy(cfg->registeredExePath, g_exeFullPath, MAX_PATH * 2 - 1);
    cfg->registeredExePath[MAX_PATH * 2 - 1] = L'\0';
}

/* ---------------- Backup Creation & Rotation ---------------- */

typedef struct {
    wchar_t fileName[MAX_PATH];
    unsigned long long sizeBytes;
    wchar_t modifiedAt[32];
} FoundBackupItem;

static int compare_backup_asc(const void* a, const void* b) {
    const FoundBackupItem* fa = (const FoundBackupItem*)a;
    const FoundBackupItem* fb = (const FoundBackupItem*)b;
    return wcscmp(fa->fileName, fb->fileName);
}

static int compare_backup_desc(const void* a, const void* b) {
    return compare_backup_asc(b, a);
}

static size_t scan_dated_backups(const wchar_t* dir, FoundBackupItem* items, size_t max_items, int sort_desc) {
    if (!dir || !dir[0] || !PathIsDirectoryW(dir)) return 0;

    wchar_t pattern[MAX_PATH * 2];
    _snwprintf(pattern, MAX_PATH * 2 - 1, L"%s\\Salva_Kakeibo_2*.json", dir);
    pattern[MAX_PATH * 2 - 1] = L'\0';

    WIN32_FIND_DATAW fd;
    HANDLE hFind = FindFirstFileW(pattern, &fd);
    if (hFind == INVALID_HANDLE_VALUE) return 0;

    size_t count = 0;
    do {
        if ((fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 && count < max_items) {
            wcsncpy(items[count].fileName, fd.cFileName, MAX_PATH - 1);
            items[count].fileName[MAX_PATH - 1] = L'\0';

            ULARGE_INTEGER sz;
            sz.LowPart = fd.nFileSizeLow;
            sz.HighPart = fd.nFileSizeHigh;
            items[count].sizeBytes = sz.QuadPart;

            FILETIME lft;
            SYSTEMTIME st;
            if (FileTimeToLocalFileTime(&fd.ftLastWriteTime, &lft) && FileTimeToSystemTime(&lft, &st)) {
                _snwprintf(
                    items[count].modifiedAt,
                    31,
                    L"%04u-%02u-%02u %02u:%02u:%02u",
                    st.wYear,
                    st.wMonth,
                    st.wDay,
                    st.wHour,
                    st.wMinute,
                    st.wSecond
                );
                items[count].modifiedAt[31] = L'\0';
            } else {
                items[count].modifiedAt[0] = L'\0';
            }
            count++;
        }
    } while (FindNextFileW(hFind, &fd));

    FindClose(hFind);

    if (count > 1) {
        qsort(items, count, sizeof(FoundBackupItem), sort_desc ? compare_backup_desc : compare_backup_asc);
    }
    return count;
}

static int perform_backup_locked(BackupConfig* cfg) {
    size_t db_sz = 0;
    char* db_bytes = read_file_bytes_locked(g_dbPath, &db_sz);
    if (!db_bytes && PathFileExistsW(g_dbBakPath)) {
        db_bytes = read_file_bytes_locked(g_dbBakPath, &db_sz);
    }

    if (!db_bytes || db_sz < 20 || db_bytes[0] != '{') {
        if (db_bytes) free(db_bytes);
        wcsncpy(cfg->lastError, L"Aún no existe una base de datos guardada para respaldar.", 255);
        save_backup_config_locked(cfg);
        return -1;
    }

    if (!cfg->targetDir[0]) {
        _snwprintf(cfg->targetDir, MAX_PATH * 2 - 1, L"%s\\Respaldos_Automaticos", g_dataDir);
        cfg->targetDir[MAX_PATH * 2 - 1] = L'\0';
    }

    if (!PathIsDirectoryW(cfg->targetDir)) {
        int dir_rc = SHCreateDirectoryExW(NULL, cfg->targetDir, NULL);
        if (dir_rc != ERROR_SUCCESS && dir_rc != ERROR_ALREADY_EXISTS && !PathIsDirectoryW(cfg->targetDir)) {
            free(db_bytes);
            wcsncpy(
                cfg->lastError,
                L"La carpeta o memoria USB de destino no está conectada o disponible.",
                255
            );
            save_backup_config_locked(cfg);
            return -1;
        }
    }

    SYSTEMTIME now;
    unsigned long long now_sec = current_local_sec(&now);

    wchar_t dated_path[MAX_PATH * 2];
    wchar_t tmp_path[MAX_PATH * 2];
    wchar_t latest_path[MAX_PATH * 2];

    _snwprintf(
        dated_path,
        MAX_PATH * 2 - 1,
        L"%s\\Salva_Kakeibo_%04u-%02u-%02u_%02u%02u%02u.json",
        cfg->targetDir,
        now.wYear,
        now.wMonth,
        now.wDay,
        now.wHour,
        now.wMinute,
        now.wSecond
    );
    dated_path[MAX_PATH * 2 - 1] = L'\0';

    _snwprintf(tmp_path, MAX_PATH * 2 - 1, L"%s.tmp", dated_path);
    tmp_path[MAX_PATH * 2 - 1] = L'\0';

    _snwprintf(latest_path, MAX_PATH * 2 - 1, L"%s\\Salva_Kakeibo_Ultima.json", cfg->targetDir);
    latest_path[MAX_PATH * 2 - 1] = L'\0';

    int rc = write_bytes_atomic(dated_path, tmp_path, db_bytes, db_sz);
    free(db_bytes);

    if (rc != 0) {
        wcsncpy(cfg->lastError, L"No se pudo escribir el archivo de salva en la carpeta elegida.", 255);
        save_backup_config_locked(cfg);
        return -1;
    }

    CopyFileW(dated_path, latest_path, FALSE);

    // Rotate older dated backups beyond cfg->maxBackups
    FoundBackupItem* found = (FoundBackupItem*)malloc(sizeof(FoundBackupItem) * 256);
    if (found) {
        size_t cnt = scan_dated_backups(cfg->targetDir, found, 256, 0);
        int keep = cfg->maxBackups >= 2 ? cfg->maxBackups : 12;
        if (cnt > (size_t)keep) {
            size_t to_remove = cnt - (size_t)keep;
            for (size_t i = 0; i < to_remove; i++) {
                wchar_t old_full[MAX_PATH * 2];
                _snwprintf(old_full, MAX_PATH * 2 - 1, L"%s\\%s", cfg->targetDir, found[i].fileName);
                old_full[MAX_PATH * 2 - 1] = L'\0';
                DeleteFileW(old_full);
            }
        }
        free(found);
    }

    _snwprintf(
        cfg->lastBackupAt,
        63,
        L"%04u-%02u-%02u %02u:%02u:%02u",
        now.wYear,
        now.wMonth,
        now.wDay,
        now.wHour,
        now.wMinute,
        now.wSecond
    );
    cfg->lastBackupAt[63] = L'\0';
    cfg->lastBackupSec = now_sec;
    wcsncpy(cfg->lastBackupFile, dated_path, MAX_PATH * 2 - 1);
    cfg->lastBackupFile[MAX_PATH * 2 - 1] = L'\0';
    cfg->lastError[0] = L'\0';

    save_backup_config_locked(cfg);
    return 0;
}

/* ---------------- JSON Helpers for Backup API ---------------- */

static const char* find_json_key_value(const char* json, const char* key) {
    char pat[128];
    snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char* p = strstr(json, pat);
    if (!p) return NULL;
    p += strlen(pat);
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    if (*p != ':') return NULL;
    p++;
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    return p;
}

static int json_get_bool(const char* json, const char* key, int* out_val) {
    const char* v = find_json_key_value(json, key);
    if (!v) return 0;
    if (strncmp(v, "true", 4) == 0) {
        *out_val = 1;
        return 1;
    }
    if (strncmp(v, "false", 5) == 0) {
        *out_val = 0;
        return 1;
    }
    return 0;
}

static int json_get_int(const char* json, const char* key, int* out_val) {
    const char* v = find_json_key_value(json, key);
    if (!v) return 0;
    if ((*v >= '0' && *v <= '9') || *v == '-') {
        *out_val = atoi(v);
        return 1;
    }
    return 0;
}

static int json_get_utf8_str(const char* json, const char* key, char* out_buf, size_t out_cap) {
    const char* v = find_json_key_value(json, key);
    if (!v || *v != '"') return 0;
    v++;
    size_t j = 0;
    while (*v && *v != '"' && j + 1 < out_cap) {
        if (*v == '\\' && v[1] != '\0') {
            v++;
            if (*v == 'n') out_buf[j++] = '\n';
            else if (*v == 'r') out_buf[j++] = '\r';
            else if (*v == 't') out_buf[j++] = '\t';
            else out_buf[j++] = *v;
            v++;
        } else {
            out_buf[j++] = *v++;
        }
    }
    out_buf[j] = '\0';
    return 1;
}

static char* build_backup_config_json_locked(const BackupConfig* cfg, size_t* out_len) {
    char esc_target[MAX_PATH * 6];
    char esc_lastAt[256];
    char esc_lastFile[MAX_PATH * 6];
    char esc_lastErr[1024];
    char esc_regExe[MAX_PATH * 6];

    json_escape_wstring(cfg->targetDir, esc_target, sizeof(esc_target));
    json_escape_wstring(cfg->lastBackupAt, esc_lastAt, sizeof(esc_lastAt));
    json_escape_wstring(cfg->lastBackupFile, esc_lastFile, sizeof(esc_lastFile));
    json_escape_wstring(cfg->lastError, esc_lastErr, sizeof(esc_lastErr));
    json_escape_wstring(cfg->registeredExePath, esc_regExe, sizeof(esc_regExe));

    FoundBackupItem* found = (FoundBackupItem*)malloc(sizeof(FoundBackupItem) * 24);
    size_t cnt = 0;
    if (found) {
        cnt = scan_dated_backups(cfg->targetDir, found, 20, 1);
    }

    size_t cap = 32768;
    char* buf = (char*)malloc(cap);
    if (!buf) {
        if (found) free(found);
        *out_len = 0;
        return NULL;
    }

    int pos = snprintf(
        buf,
        cap,
        "{"
        "\"enabled\":%s,"
        "\"frequency\":\"%s\","
        "\"dayOfWeek\":%d,"
        "\"dayOfMonth\":%d,"
        "\"hour\":%d,"
        "\"minute\":%d,"
        "\"targetDir\":\"%s\","
        "\"maxBackups\":%d,"
        "\"runOnStartupIfMissed\":%s,"
        "\"taskRegistered\":%s,"
        "\"lastBackupAt\":\"%s\","
        "\"lastBackupFile\":\"%s\","
        "\"lastError\":\"%s\","
        "\"registeredExePath\":\"%s\","
        "\"recentBackups\":[",
        cfg->enabled ? "true" : "false",
        cfg->frequency,
        cfg->dayOfWeek,
        cfg->dayOfMonth,
        cfg->hour,
        cfg->minute,
        esc_target,
        cfg->maxBackups,
        cfg->runOnStartupIfMissed ? "true" : "false",
        cfg->taskRegistered ? "true" : "false",
        esc_lastAt,
        esc_lastFile,
        esc_lastErr,
        esc_regExe
    );

    for (size_t i = 0; i < cnt && (size_t)pos + 1024 < cap; i++) {
        char esc_fn[MAX_PATH * 4];
        char esc_mod[128];
        json_escape_wstring(found[i].fileName, esc_fn, sizeof(esc_fn));
        json_escape_wstring(found[i].modifiedAt, esc_mod, sizeof(esc_mod));
        pos += snprintf(
            buf + pos,
            cap - (size_t)pos,
            "%s{\"fileName\":\"%s\",\"sizeBytes\":%llu,\"modifiedAt\":\"%s\"}",
            i > 0 ? "," : "",
            esc_fn,
            found[i].sizeBytes,
            esc_mod
        );
    }

    if (found) free(found);
    pos += snprintf(buf + pos, cap - (size_t)pos, "]}");
    *out_len = (size_t)pos;
    return buf;
}

static int CALLBACK browse_folder_callback(HWND hwnd, UINT uMsg, LPARAM lParam, LPARAM lpData) {
    (void)lParam;
    if (uMsg == BFFM_INITIALIZED) {
        SetForegroundWindow(hwnd);
        const wchar_t* init_dir = (const wchar_t*)lpData;
        if (init_dir && init_dir[0] && PathIsDirectoryW(init_dir)) {
            SendMessageW(hwnd, BFFM_SETSELECTIONW, TRUE, (LPARAM)init_dir);
        }
    }
    return 0;
}

/* ---------------- Embedded Web Assets & HTTP Server ---------------- */

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
    } else if (strcmp(raw_path, "/api/desktop/backup/config") == 0 && strcmp(method, "GET") == 0) {
        EnterCriticalSection(&g_dbLock);
        BackupConfig cfg;
        load_backup_config_locked(&cfg);
        size_t jlen = 0;
        char* jresp = build_backup_config_json_locked(&cfg, &jlen);
        LeaveCriticalSection(&g_dbLock);

        if (jresp) {
            send_http_response(client, "200 OK", "application/json; charset=utf-8", jresp, jlen);
            free(jresp);
        } else {
            const char* err = "{\"error\":\"Memoria insuficiente\"}";
            send_http_response(client, "500 Internal Server Error", "application/json; charset=utf-8", err, strlen(err));
        }
    } else if (strcmp(raw_path, "/api/desktop/backup/config") == 0 && strcmp(method, "PUT") == 0) {
        EnterCriticalSection(&g_dbLock);
        BackupConfig cfg;
        load_backup_config_locked(&cfg);

        int prev_enabled = cfg.enabled;
        int prev_dow = cfg.dayOfWeek;
        int prev_dom = cfg.dayOfMonth;
        int prev_hr = cfg.hour;
        int prev_mn = cfg.minute;
        char prev_freq[16];
        strcpy(prev_freq, cfg.frequency);

        int bval = 0;
        int ival = 0;
        char sval[MAX_PATH * 6];

        if (json_get_bool(body_ptr, "enabled", &bval)) cfg.enabled = bval;
        if (json_get_utf8_str(body_ptr, "frequency", sval, sizeof(sval))) {
            if (strcmp(sval, "daily") == 0 || strcmp(sval, "weekly") == 0 || strcmp(sval, "monthly") == 0) {
                strncpy(cfg.frequency, sval, sizeof(cfg.frequency) - 1);
            }
        }
        if (json_get_int(body_ptr, "dayOfWeek", &ival) && ival >= 1 && ival <= 7) cfg.dayOfWeek = ival;
        if (json_get_int(body_ptr, "dayOfMonth", &ival) && ival >= 1 && ival <= 28) cfg.dayOfMonth = ival;
        if (json_get_int(body_ptr, "hour", &ival) && ival >= 0 && ival <= 23) cfg.hour = ival;
        if (json_get_int(body_ptr, "minute", &ival) && ival >= 0 && ival <= 59) cfg.minute = ival;
        if (json_get_int(body_ptr, "maxBackups", &ival) && ival >= 2 && ival <= 100) cfg.maxBackups = ival;
        if (json_get_bool(body_ptr, "runOnStartupIfMissed", &bval)) cfg.runOnStartupIfMissed = bval;
        if (json_get_utf8_str(body_ptr, "targetDir", sval, sizeof(sval)) && sval[0] != '\0') {
            utf8_to_wide_safe(sval, cfg.targetDir, MAX_PATH * 2);
        }

        int schedule_changed =
            (!prev_enabled && cfg.enabled) ||
            strcmp(prev_freq, cfg.frequency) != 0 ||
            prev_dow != cfg.dayOfWeek ||
            prev_dom != cfg.dayOfMonth ||
            prev_hr != cfg.hour ||
            prev_mn != cfg.minute;

        if (cfg.enabled && (schedule_changed || cfg.enabledSinceSec == 0)) {
            cfg.enabledSinceSec = current_local_sec(NULL);
        }

        sync_windows_scheduler_locked(&cfg);
        save_backup_config_locked(&cfg);

        size_t jlen = 0;
        char* jresp = build_backup_config_json_locked(&cfg, &jlen);
        LeaveCriticalSection(&g_dbLock);

        if (jresp) {
            send_http_response(client, "200 OK", "application/json; charset=utf-8", jresp, jlen);
            free(jresp);
        } else {
            const char* err = "{\"error\":\"Error guardando configuracion\"}";
            send_http_response(client, "500 Internal Server Error", "application/json; charset=utf-8", err, strlen(err));
        }
    } else if (strcmp(raw_path, "/api/desktop/backup/pick-folder") == 0 && strcmp(method, "POST") == 0) {
        wchar_t current_dir[MAX_PATH * 2];
        EnterCriticalSection(&g_dbLock);
        BackupConfig cfg;
        load_backup_config_locked(&cfg);
        wcsncpy(current_dir, cfg.targetDir, MAX_PATH * 2 - 1);
        current_dir[MAX_PATH * 2 - 1] = L'\0';
        LeaveCriticalSection(&g_dbLock);

        HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
        wchar_t picked[MAX_PATH * 2] = {0};
        int got_folder = 0;

        BROWSEINFOW bi;
        ZeroMemory(&bi, sizeof(bi));
        bi.hwndOwner = GetForegroundWindow();
        bi.lpszTitle = L"Elige la carpeta o unidad (ej. D:\\ o Memoria USB) donde guardar tus salvas automáticas:";
        bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX;
        bi.lpfn = browse_folder_callback;
        bi.lParam = (LPARAM)current_dir;

        LPITEMIDLIST pidl = SHBrowseForFolderW(&bi);
        if (pidl) {
            if (SHGetPathFromIDListW(pidl, picked) && picked[0] != L'\0') {
                got_folder = 1;
            }
            CoTaskMemFree(pidl);
        }
        if (SUCCEEDED(hr)) {
            CoUninitialize();
        }

        if (got_folder) {
            char esc_picked[MAX_PATH * 6];
            json_escape_wstring(picked, esc_picked, sizeof(esc_picked));
            char resp[MAX_PATH * 7];
            int rlen = snprintf(resp, sizeof(resp), "{\"cancelled\":false,\"path\":\"%s\"}", esc_picked);
            send_http_response(client, "200 OK", "application/json; charset=utf-8", resp, (size_t)rlen);
        } else {
            const char* cancelled = "{\"cancelled\":true}";
            send_http_response(client, "200 OK", "application/json; charset=utf-8", cancelled, strlen(cancelled));
        }
    } else if (strcmp(raw_path, "/api/desktop/backup/run-now") == 0 && strcmp(method, "POST") == 0) {
        EnterCriticalSection(&g_dbLock);
        BackupConfig cfg;
        load_backup_config_locked(&cfg);
        int rc = perform_backup_locked(&cfg);
        size_t cfg_len = 0;
        char* cfg_json = build_backup_config_json_locked(&cfg, &cfg_len);
        char esc_file[MAX_PATH * 6];
        char esc_err[1024];
        json_escape_wstring(cfg.lastBackupFile, esc_file, sizeof(esc_file));
        json_escape_wstring(cfg.lastError, esc_err, sizeof(esc_err));
        LeaveCriticalSection(&g_dbLock);

        if (rc == 0 && cfg_json) {
            size_t rcap = cfg_len + sizeof(esc_file) + 256;
            char* resp = (char*)malloc(rcap);
            if (resp) {
                int rlen = snprintf(
                    resp,
                    rcap,
                    "{\"ok\":true,\"filePath\":\"%s\",\"config\":%s}",
                    esc_file,
                    cfg_json
                );
                send_http_response(client, "200 OK", "application/json; charset=utf-8", resp, (size_t)rlen);
                free(resp);
            }
        } else {
            char resp[1200];
            int rlen = snprintf(
                resp,
                sizeof(resp),
                "{\"error\":\"%s\"}",
                esc_err[0] ? esc_err : "No se pudo crear la salva"
            );
            send_http_response(client, "400 Bad Request", "application/json; charset=utf-8", resp, (size_t)rlen);
        }
        if (cfg_json) free(cfg_json);
    } else if (strcmp(raw_path, "/api/desktop/backup/open-folder") == 0 && strcmp(method, "POST") == 0) {
        wchar_t target_dir[MAX_PATH * 2];
        EnterCriticalSection(&g_dbLock);
        BackupConfig cfg;
        load_backup_config_locked(&cfg);
        wcsncpy(target_dir, cfg.targetDir, MAX_PATH * 2 - 1);
        target_dir[MAX_PATH * 2 - 1] = L'\0';
        LeaveCriticalSection(&g_dbLock);

        if (!PathIsDirectoryW(target_dir)) {
            SHCreateDirectoryExW(NULL, target_dir, NULL);
        }
        ShellExecuteW(NULL, L"open", target_dir, NULL, NULL, SW_SHOWNORMAL);
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
    GetModuleFileNameW(NULL, g_exeFullPath, MAX_PATH * 2);
    g_exeFullPath[MAX_PATH * 2 - 1] = L'\0';

    wchar_t exe_dir[MAX_PATH * 2];
    wcsncpy(exe_dir, g_exeFullPath, MAX_PATH * 2 - 1);
    exe_dir[MAX_PATH * 2 - 1] = L'\0';
    PathRemoveFileSpecW(exe_dir);

    wchar_t portable_dir[MAX_PATH * 2];
    _snwprintf(portable_dir, MAX_PATH * 2 - 1, L"%s\\datos_portables", exe_dir);
    portable_dir[MAX_PATH * 2 - 1] = L'\0';

    if (PathIsDirectoryW(portable_dir)) {
        wcsncpy(g_dataDir, portable_dir, MAX_PATH * 2 - 1);
    } else {
        wchar_t local_app[MAX_PATH * 2];
        DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", local_app, MAX_PATH * 2);
        if (n > 0 && n < MAX_PATH * 2) {
            _snwprintf(g_dataDir, MAX_PATH * 2 - 1, L"%s\\NeonKakeibo", local_app);
        } else {
            _snwprintf(g_dataDir, MAX_PATH * 2 - 1, L"%s\\datos_kakeibo", exe_dir);
        }
    }
    g_dataDir[MAX_PATH * 2 - 1] = L'\0';
    CreateDirectoryW(g_dataDir, NULL);

    _snwprintf(g_dbPath, MAX_PATH * 2 - 1, L"%s\\kakeibo-store.json", g_dataDir);
    _snwprintf(g_dbTmpPath, MAX_PATH * 2 - 1, L"%s\\kakeibo-store.tmp.json", g_dataDir);
    _snwprintf(g_dbBakPath, MAX_PATH * 2 - 1, L"%s\\kakeibo-store.bak.json", g_dataDir);
    _snwprintf(g_backupCfgPath, MAX_PATH * 2 - 1, L"%s\\backup-config.cfg", g_dataDir);
    _snwprintf(g_taskXmlPath, MAX_PATH * 2 - 1, L"%s\\auto_backup_task.xml", g_dataDir);
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

    init_storage_paths();
    InitializeCriticalSection(&g_dbLock);

    // Silent Background Auto-Backup Mode (invoked by Windows Task Scheduler or Startup catch-up)
    const wchar_t* full_cmd = GetCommandLineW();
    if (full_cmd && wcsstr(full_cmd, L"--silent-backup") != NULL) {
        EnterCriticalSection(&g_dbLock);
        BackupConfig cfg;
        load_backup_config_locked(&cfg);
        if (cfg.enabled && is_scheduled_backup_due(&cfg)) {
            perform_backup_locked(&cfg);
        }
        LeaveCriticalSection(&g_dbLock);
        DeleteCriticalSection(&g_dbLock);
        return 0;
    }

    SetProcessDPIAware();

    // Auto-update scheduler path if user moved NeonKakeibo.exe, and catch up any missed backup
    EnterCriticalSection(&g_dbLock);
    {
        BackupConfig cfg;
        load_backup_config_locked(&cfg);
        if (cfg.enabled) {
            if (_wcsicmp(cfg.registeredExePath, g_exeFullPath) != 0) {
                sync_windows_scheduler_locked(&cfg);
                save_backup_config_locked(&cfg);
            }
            if (is_scheduled_backup_due(&cfg)) {
                perform_backup_locked(&cfg);
            }
        }
    }
    LeaveCriticalSection(&g_dbLock);

    HANDLE hMutex = CreateMutexW(NULL, FALSE, L"Local\\NeonKakeiboDesktopApp_v1");
    if (hMutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        unsigned short existing_port = read_active_port();
        if (existing_port > 0) {
            HANDLE hSecond = launch_desktop_window(existing_port);
            if (hSecond) CloseHandle(hSecond);
            CloseHandle(hMutex);
            DeleteCriticalSection(&g_dbLock);
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
        if (hMutex) CloseHandle(hMutex);
        DeleteCriticalSection(&g_dbLock);
        return 1;
    }

    touch_activity();

    SOCKET listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listen_sock == INVALID_SOCKET) {
        WSACleanup();
        if (hMutex) CloseHandle(hMutex);
        DeleteCriticalSection(&g_dbLock);
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
        if (hMutex) CloseHandle(hMutex);
        DeleteCriticalSection(&g_dbLock);
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
