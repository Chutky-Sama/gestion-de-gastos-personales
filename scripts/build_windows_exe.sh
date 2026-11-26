#!/usr/bin/env bash
set -euo pipefail

echo "==> 1/5 Generando ícono multi-resolución de Windows (.ico)..."
python3 scripts/generate_icon.py

echo "==> 2/5 Compilando interfaz Neon Kakeibo (TypeScript + Vite)..."
npm run typecheck
npm run build

echo "==> 3/5 Empaquetando todos los recursos dentro del binario C..."
python3 scripts/pack_assets.py

ZIG_CMD=""
if command -v zig >/dev/null 2>&1; then
  ZIG_CMD="zig"
elif [ -x "/tmp/zigenv/bin/python" ]; then
  ZIG_CMD="/tmp/zigenv/bin/python -m ziglang"
elif python3 -c "import ziglang" >/dev/null 2>&1; then
  ZIG_CMD="python3 -m ziglang"
else
  echo "Instalando compilador cruzado ziglang en /tmp/zigenv..."
  python3 -m venv /tmp/zigenv
  /tmp/zigenv/bin/pip install --quiet ziglang
  ZIG_CMD="/tmp/zigenv/bin/python -m ziglang"
fi

echo "==> 4/5 Compilando recursos nativos de Windows (.rc -> .res)..."
$ZIG_CMD rc /fo desktop/neon_kakeibo.res desktop/neon_kakeibo.rc

echo "==> 5/5 Compilando ejecutable nativo NeonKakeibo.exe (Windows x64 GUI)..."
$ZIG_CMD cc -target x86_64-windows-gnu -Os -s \
  -Wl,--subsystem,windows \
  desktop/neon_kakeibo_win32.c \
  desktop/neon_kakeibo.res \
  -lws2_32 -lshell32 -lshlwapi -ladvapi32 -luser32 \
  -o NeonKakeibo.exe

ls -lh NeonKakeibo.exe
echo "¡Compilación completada! -> NeonKakeibo.exe"
