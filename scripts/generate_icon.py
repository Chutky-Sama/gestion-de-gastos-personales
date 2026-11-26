#!/usr/bin/env python3
"""
Builds the Windows multi-resolution .ico (desktop/neon_kakeibo.ico),
public/favicon.ico, and public/icon-256.png from the user's personal seal logo
(desktop/logo_personal.png or /tmp/arena-coding-uploads/logo_color.png).
Uses premultiplied-alpha Lanczos resampling so circular edges have zero halo.
"""
import os
import shutil
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADED_SRC = "/tmp/arena-coding-uploads/logo_color.png"
MASTER_PNG = os.path.join(ROOT, "desktop", "logo_personal.png")
OUT_ICO = os.path.join(ROOT, "desktop", "neon_kakeibo.ico")
PUB_ICO = os.path.join(ROOT, "public", "favicon.ico")
PUB_PNG = os.path.join(ROOT, "public", "icon-256.png")


def ensure_pillow_and_run():
    try:
        from PIL import Image  # noqa: F401
        return True
    except ImportError:
        zig_py = "/tmp/zigenv/bin/python"
        if os.path.exists(zig_py) and os.path.abspath(sys.executable) != os.path.abspath(zig_py):
            res = subprocess.run([zig_py, os.path.abspath(__file__)], check=False)
            sys.exit(res.returncode)
        return False


def resize_premultiplied(im, size: int):
    from PIL import Image

    im = im.convert("RGBA")
    w, h = im.size
    raw = bytearray(im.tobytes())
    # Premultiply RGB by alpha to prevent white edge bleed during Lanczos
    for i in range(0, len(raw), 4):
        a = raw[i + 3]
        if a == 0:
            raw[i] = 0
            raw[i + 1] = 0
            raw[i + 2] = 0
        elif a < 255:
            raw[i] = (raw[i] * a + 127) // 255
            raw[i + 1] = (raw[i + 1] * a + 127) // 255
            raw[i + 2] = (raw[i + 2] * a + 127) // 255

    pre = Image.frombytes("RGBA", (w, h), bytes(raw))
    resized = pre.resize((size, size), Image.Resampling.LANCZOS)

    out = bytearray(resized.tobytes())
    for i in range(0, len(out), 4):
        a = out[i + 3]
        if a == 0:
            out[i] = 0
            out[i + 1] = 0
            out[i + 2] = 0
        elif a < 255:
            out[i] = min(255, (out[i] * 255 + a // 2) // a)
            out[i + 1] = min(255, (out[i + 1] * 255 + a // 2) // a)
            out[i + 2] = min(255, (out[i + 2] * 255 + a // 2) // a)

    return Image.frombytes("RGBA", (size, size), bytes(out))


def build_bmp_ico_entry(im) -> bytes:
    """Create a standard 32-bit BGRA DIB/BMP payload for Windows ICO frames < 256px."""
    w, h = im.size
    rgba = im.tobytes()
    # BITMAPINFOHEADER (40 bytes), height is doubled (XOR + AND masks)
    bih = struct.pack(
        "<IiiHHIIiiII",
        40,
        w,
        h * 2,
        1,
        32,
        0,
        w * h * 4,
        0,
        0,
        0,
        0,
    )
    # XOR mask: bottom-up BGRA rows
    xor_rows = bytearray()
    stride = w * 4
    for y in range(h - 1, -1, -1):
        row = rgba[y * stride : (y + 1) * stride]
        for x in range(0, stride, 4):
            r, g, b, a = row[x], row[x + 1], row[x + 2], row[x + 3]
            xor_rows.extend((b, g, r, a))

    # AND mask: 1-bit transparency mask padded to 32-bit (4-byte) row boundaries
    and_row_bytes = ((w + 31) // 32) * 4
    and_rows = bytearray()
    for y in range(h - 1, -1, -1):
        row_bits = bytearray(and_row_bytes)
        row = rgba[y * stride : (y + 1) * stride]
        for px in range(w):
            a = row[px * 4 + 3]
            if a < 16:
                row_bits[px // 8] |= 0x80 >> (px % 8)
        and_rows.extend(row_bits)

    return bih + bytes(xor_rows) + bytes(and_rows)


def write_windows_ico(frames_dict, path: str):
    """
    Writes a maximally compatible Windows .ico:
    - 16, 24, 32, 48, 64, 128 stored as 32-bit BGRA DIBs (instant Explorer/GDI/Taskbar support)
    - 256 stored as compressed RGBA PNG (standard Windows Vista/10/11 HiDPI icon frame)
    """
    import io

    sizes = sorted(frames_dict.keys())
    blobs = []
    for s in sizes:
        im = frames_dict[s]
        if s >= 256:
            buf = io.BytesIO()
            im.save(buf, format="PNG", optimize=True)
            blobs.append((s, buf.getvalue()))
        else:
            blobs.append((s, build_bmp_ico_entry(im)))

    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    dir_entries = []
    payloads = []
    for s, data in blobs:
        b_dim = 0 if s >= 256 else s
        dir_entries.append(
            struct.pack("<BBBBHHII", b_dim, b_dim, 0, 0, 1, 32, len(data), offset)
        )
        payloads.append(data)
        offset += len(data)

    with open(path, "wb") as f:
        f.write(header + b"".join(dir_entries) + b"".join(payloads))


def main():
    os.makedirs(os.path.join(ROOT, "desktop"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "public"), exist_ok=True)

    if not ensure_pillow_and_run():
        # If Pillow is unavailable and icons already exist in repo, keep existing icons
        if os.path.exists(OUT_ICO) and os.path.exists(PUB_PNG):
            print("Using pre-generated personal seal icons.")
            return
        raise RuntimeError("Pillow is required to regenerate icons from source PNG.")

    from PIL import Image

    src_path = UPLOADED_SRC if os.path.exists(UPLOADED_SRC) else MASTER_PNG
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Missing icon source: {src_path}")

    src = Image.open(src_path).convert("RGBA")

    # Tight square crop around non-transparent content with subtle 1.5% breathing margin
    bbox = src.getchannel("A").getbbox()
    if bbox:
        left, top, right, bottom = bbox
        bw = right - left
        bh = bottom - top
        side = max(bw, bh)
        pad = int(side * 0.015)
        cx = (left + right) / 2.0
        cy = (top + bottom) / 2.0
        half = side / 2.0 + pad
        crop_box = (
            max(0, int(round(cx - half))),
            max(0, int(round(cy - half))),
            min(src.width, int(round(cx + half))),
            min(src.height, int(round(cy + half))),
        )
        src = src.crop(crop_box)

    # Save 512x512 master seal in desktop/logo_personal.png if building from uploaded source
    if os.path.abspath(src_path) != os.path.abspath(MASTER_PNG):
        master_512 = resize_premultiplied(src, 512)
        master_512.save(MASTER_PNG, format="PNG", optimize=True)

    # Generate crisp multi-resolution frames
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = {s: resize_premultiplied(src, s) for s in ico_sizes}

    write_windows_ico(frames, OUT_ICO)

    # Browser/App-mode favicon (16, 32, 48) + 256px PNG seal
    fav_frames = {s: frames[s] for s in (16, 32, 48)}
    write_windows_ico(fav_frames, PUB_ICO)
    frames[256].save(PUB_PNG, format="PNG", optimize=True)

    print(
        f"Personal seal icons generated -> {OUT_ICO} ({os.path.getsize(OUT_ICO)} B), "
        f"{PUB_PNG} ({os.path.getsize(PUB_PNG)} B)"
    )


if __name__ == "__main__":
    main()
