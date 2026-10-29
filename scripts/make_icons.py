"""Render the extension icons: a squircle tile with a struck-through sparkle.

Run: python3 scripts/make_icons.py
"""
from math import copysign, cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # work at high resolution, then downsample
OUT = Path(__file__).resolve().parent.parent / "icons"


def superellipse(cx, cy, r, n=5.0, steps=720):
    pts = []
    for i in range(steps):
        t = 2 * pi * i / steps
        c, s = cos(t), sin(t)
        x = copysign(abs(c) ** (2 / n), c)
        y = copysign(abs(s) ** (2 / n), s)
        pts.append((cx + r * x, cy + r * y))
    return pts


def cubic(p0, p1, p2, p3, steps=48):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t**2
        d = t**3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def sparkle(scale, ox, oy):
    # Same path as the in-page glyph (20x20 viewBox).
    segs = [
        ((10, 1.6), (11.2, 5.6), (14.4, 8.8), (18.4, 10)),
        ((18.4, 10), (14.4, 11.2), (11.2, 14.4), (10, 18.4)),
        ((10, 18.4), (8.8, 14.4), (5.6, 11.2), (1.6, 10)),
        ((1.6, 10), (5.6, 8.8), (8.8, 5.6), (10, 1.6)),
    ]
    pts = [(10, 1.6)]
    for seg in segs:
        pts += cubic(*seg)
    return [(ox + x * scale, oy + y * scale) for x, y in pts]


def round_line(draw, a, b, width, fill):
    draw.line([a, b], fill=fill, width=int(width))
    r = width / 2
    for x, y in (a, b):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def render():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Tile with a soft vertical gradient.
    tile_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile_mask).polygon(superellipse(S / 2, S / 2, S * 0.47), fill=255)
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    top, bottom = (46, 46, 52), (14, 14, 17)
    for y in range(S):
        t = y / (S - 1)
        gd.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    img.paste(grad, (0, 0), tile_mask)

    # Sparkle with a gap cut where the slash crosses it.
    scale = S * 0.62 / 20
    off = (S - 20 * scale) / 2
    a = (off + 3.4 * scale, off + 16.6 * scale)
    b = (off + 16.6 * scale, off + 3.4 * scale)
    glyph = Image.new("L", (S, S), 0)
    gdraw = ImageDraw.Draw(glyph)
    gdraw.polygon(sparkle(scale, off, off), fill=255)
    round_line(gdraw, a, b, 4.4 * scale, 0)
    img.paste((250, 250, 252, 255), (0, 0), glyph)

    # The slash itself.
    slash = Image.new("L", (S, S), 0)
    round_line(ImageDraw.Draw(slash), a, b, 1.8 * scale, 255)
    img.paste((255, 69, 58, 255), (0, 0), slash)

    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        img.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
    img.resize((512, 512), Image.LANCZOS).save(OUT / "icon512.png")


if __name__ == "__main__":
    render()
