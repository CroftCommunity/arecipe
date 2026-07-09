#!/usr/bin/env python3
"""Generate the "no image" meal placeholders from the two-up standin sheet.

Source: design/no_meal_image_standin.png — a 1024x1024 sheet with two versions
side by side:
  - left  half: VERSION 1, dark teal  -> the LIGHT-theme placeholder
  - right half: VERSION 2, pale teal  -> the DARK-theme placeholder
Both sit on a baked-in transparency-checkerboard with a white glow, text labels,
and a faint mint butterfly behind the cutlery.

We want a crisp cutlery-only mark (spoon/knife/fork + three gold dots), no
butterfly — the source butterfly is a low-contrast, mottled texture whose
anti-aliased fringe overlaps the cutlery's colour space, so no per-pixel rule
removes it cleanly and it reads as an ugly haze on the dark theme tile. Two
stages get there:

  1. Colour key -> alpha. The grey checkerboard is chroma ~0; the white/glow and
     the light butterfly are light (max channel high); the cutlery is dark
     (max ~98 light / ~181 dark) and the gold dots are ~184-189. So: transparent
     where chroma <= FEATHER_LO (checker) or max channel > MAX_V (white/glow/
     butterfly), opaque where chroma >= KEEP, feathered between for clean edges.
  2. Largest-connected-component + gold. The three utensils cross into a single
     connected blob; the butterfly strokes are detached islands. Keeping only the
     largest component (dilated a little to recover the anti-aliased rim) plus any
     distinctly-gold pixels removes the leftover butterfly fringe while keeping
     the cutlery and dots.

To restore the butterfly, supply a cleaner source (a solid/high-contrast
butterfly layer, or separate transparent light/dark exports) — not this key.

Outputs assets/no-meal-light.png and assets/no-meal-dark.png, cropped to a
single shared bounding box so the two are pixel-aligned and swap cleanly.

Run manually when the standin changes:  python3 scripts/make-no-meal-images.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Design source lives outside assets/ — build.mjs cpSync's all of assets/ into
# dist/, so a 1.3 MB standin in assets/ would ship to production.
SRC = ROOT / "design" / "no_meal_image_standin.png"

FEATHER_LO = 6    # chroma <= this -> background (grey checkerboard is ~0)
KEEP = 18         # chroma >= this -> fully opaque; feather between for edges

# max-channel ceiling: pixels lighter than this are dropped as white/glow/
# butterfly. It must sit just above each version's cutlery brightness, which
# differs — VERSION 1 is DARK teal (max ~98-120) so a tight ceiling also kills
# its lighter butterfly outline; VERSION 2 is PALE teal (max ~181) so it needs a
# looser ceiling. The gold dots (max ~184-189) are re-added explicitly, so a
# tight ceiling never costs us the dots.
MAX_V_LIGHT = 160
MAX_V_DARK = 205

TOP_CUT = 210     # drop the "VERSION 1 …" text band before splitting
PAD = 12          # breathing room around the mark in the final crop


def key_alpha(im: Image.Image, max_v: int) -> np.ndarray:
    """RGBA float image -> uint8 alpha keyed by chroma + a value ceiling."""
    a = np.asarray(im.convert("RGBA"), dtype=np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hi = np.maximum(np.maximum(r, g), b)
    lo = np.minimum(np.minimum(r, g), b)
    chroma = hi - lo
    alpha = np.clip((chroma - FEATHER_LO) / (KEEP - FEATHER_LO) * 255, 0, 255)
    alpha[chroma <= FEATHER_LO] = 0
    alpha[hi > max_v] = 0  # white / glow / faint butterfly
    return alpha.astype(np.uint8)


def dilate(mask: np.ndarray, iterations: int = 2) -> np.ndarray:
    m = mask.copy()
    for _ in range(iterations):
        d = m.copy()
        d[1:, :] |= m[:-1, :]
        d[:-1, :] |= m[1:, :]
        d[:, 1:] |= m[:, :-1]
        d[:, :-1] |= m[:, 1:]
        m = d
    return m


def largest_component(solid: np.ndarray) -> np.ndarray:
    """Boolean mask of the single largest 8-connected component in `solid`."""
    h, w = solid.shape
    labels = np.zeros((h, w), dtype=np.int32)
    cur = 0
    sizes: dict[int, int] = {}
    neigh = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    for sy in range(h):
        for sx in range(w):
            if not solid[sy, sx] or labels[sy, sx]:
                continue
            cur += 1
            stack = [(sy, sx)]
            labels[sy, sx] = cur
            size = 0
            while stack:
                cy, cx = stack.pop()
                size += 1
                for dy, dx in neigh:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = cur
                        stack.append((ny, nx))
            sizes[cur] = size
    if not sizes:
        return np.zeros_like(solid, dtype=bool)
    return labels == max(sizes, key=sizes.get)


def cutlery_only(im: Image.Image, max_v: int) -> Image.Image:
    """Key -> keep the largest cutlery blob (+ gold dots), drop the butterfly."""
    rgba = np.asarray(im.convert("RGBA"), dtype=np.uint8).copy()
    alpha = key_alpha(im, max_v)

    r, g, b = (rgba[..., i].astype(np.int16) for i in range(3))
    gold = (b < 120) & (r > 140) & (g > 110) & (r - b > 60)  # the dots

    keep = dilate(largest_component(alpha > 40), 2) | gold
    out = np.where(keep, alpha, 0)
    # The gold dots are brighter than the light-theme ceiling, so key_alpha
    # zeroed them; keep re-includes them but the alpha must be restored too, or
    # the dots come out hollow. Force gold fully opaque.
    out[gold] = 255
    rgba[..., 3] = out
    return Image.fromarray(rgba, "RGBA")


def union_bbox(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA").crop((0, TOP_CUT, 1024, 1024))
    w, h = sheet.size
    mid = w // 2

    left = cutlery_only(sheet.crop((0, 0, mid, h)), MAX_V_LIGHT)   # V1 -> light
    right = cutlery_only(sheet.crop((mid, 0, w, h)), MAX_V_DARK)   # V2 -> dark

    # Shared crop box so the two placeholders are identical dimensions and aligned.
    box = union_bbox(left.getbbox(), right.getbbox())
    box = (
        max(0, box[0] - PAD),
        max(0, box[1] - PAD),
        min(mid, box[2] + PAD),
        min(h, box[3] + PAD),
    )

    for img, name in ((left, "no-meal-light.png"), (right, "no-meal-dark.png")):
        out = img.crop(box)
        out.save(ROOT / "assets" / name)
        print(f"wrote assets/{name}  {out.size[0]}x{out.size[1]}")


if __name__ == "__main__":
    main()
