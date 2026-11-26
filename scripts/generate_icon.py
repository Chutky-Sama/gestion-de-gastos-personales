#!/usr/bin/env python3
"""Generates a multi-resolution Neon Kakeibo Windows .ico and public/favicon.ico."""
import math
import os
import struct
import zlib


def make_png(width: int, height: int) -> bytes:
    rows = []
    cx = (width - 1) / 2.0
    cy = (height - 1) / 2.0
    half = width / 2.0
    corner_r = width * 0.22

    for y in range(height):
        row = bytearray([0])  # PNG filter type 0
        for x in range(width):
            # Signed distance to rounded rectangle
            dx = max(abs(x - cx) - (half - corner_r - 1.0), 0.0)
            dy = max(abs(y - cy) - (half - corner_r - 1.0), 0.0)
            dist = math.hypot(dx, dy) - corner_r

            if dist > 0.8:
                row.extend((0, 0, 0, 0))
                continue

            alpha = 255 if dist < -0.5 else int(255 * (0.8 - dist) / 1.3)

            # Base obsidian background with subtle top-left radial glow
            nx = x / max(1, width - 1)
            ny = y / max(1, height - 1)
            r = int(8 + 14 * (1.0 - ny))
            g = int(12 + 22 * (1.0 - nx))
            b = int(26 + 34 * (1.0 - ny))

            # Outer Neon Cyan border
            border_t = max(1.2, width * 0.055)
            if -border_t <= dist <= 0.8:
                t = 1.0 - abs(dist + border_t * 0.4) / (border_t * 0.9)
                t = max(0.0, min(1.0, t))
                r = int(r * (1 - t) + 0 * t)
                g = int(g * (1 - t) + 240 * t)
                b = int(b * (1 - t) + 255 * t)

            # Inner Neon Magenta Hanko frame
            in_margin = 0.20
            if in_margin <= nx <= 1.0 - in_margin and in_margin <= ny <= 1.0 - in_margin:
                edge_d = min(
                    nx - in_margin,
                    (1.0 - in_margin) - nx,
                    ny - in_margin,
                    (1.0 - in_margin) - ny,
                )
                frame_w = max(0.045, 1.3 / width)
                if edge_d <= frame_w:
                    r, g, b = 255, 46, 136

            # Crisp Ledger / Yen-Dollar stylized glyph in center (Neon Emerald & Cyan)
            # Vertical stem
            if 0.465 <= nx <= 0.535 and 0.29 <= ny <= 0.72:
                r, g, b = 0, 255, 157
            # Top horizontal ledger bar
            if 0.31 <= nx <= 0.69 and 0.36 <= ny <= 0.43:
                r, g, b = 0, 240, 255
            # Middle horizontal ledger bar
            if 0.31 <= nx <= 0.69 and 0.49 <= ny <= 0.56:
                r, g, b = 0, 255, 157
            # Bottom horizontal ledger bar
            if 0.35 <= nx <= 0.65 and 0.62 <= ny <= 0.68:
                r, g, b = 0, 240, 255

            row.extend((max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), alpha))
        rows.append(bytes(row))

    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def build_ico(sizes=(16, 32, 48, 256)) -> bytes:
    pngs = [(s, make_png(s, s)) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries = []
    blobs = []
    for s, data in pngs:
        w_byte = 0 if s >= 256 else s
        h_byte = 0 if s >= 256 else s
        entries.append(struct.pack("<BBBBHHII", w_byte, h_byte, 0, 0, 1, 32, len(data), offset))
        blobs.append(data)
        offset += len(data)
    return header + b"".join(entries) + b"".join(blobs)


def main() -> None:
    os.makedirs("public", exist_ok=True)
    os.makedirs("desktop", exist_ok=True)
    ico_bytes = build_ico()
    with open("public/favicon.ico", "wb") as f:
        f.write(ico_bytes)
    with open("desktop/neon_kakeibo.ico", "wb") as f:
        f.write(ico_bytes)
    with open("public/icon-256.png", "wb") as f:
        f.write(make_png(256, 256))
    print(f"Generated icons ({len(ico_bytes)} bytes)")


if __name__ == "__main__":
    main()
