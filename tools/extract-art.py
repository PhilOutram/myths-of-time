"""Cuts web-sized tile and token images out of Phil's art.

Usage: python tools/extract-art.py <Myths of Time folder>
Reads (never changes) the originals:
  Map Tiles/Explore and Conquer - Map Page 1.png   seven-hex clusters, one hex per terrain
  Units/AI Units.png                               token sheet, 10 figures x 4 colours
  Units/Castle.png, Farm.png, Sawmill.png, Gatehouse.png   building pictures on white
Writes art/tiles/<terrain>.png (flat-topped hexagon, 192 x 166),
art/tokens/<figure>-<colour>.png (96 x 96) and art/buildings/<name>.png (white removed,
at most 160 px).
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TILE_W, TILE_H = 192, 166
TOKEN = 96

# Hex centres on Map Page 1, in source pixels, and the radius inside the black border.
# Most come from the top-left cluster; stone is the centre of the middle-left cluster, since
# the edge copy runs off the cluster. edge: the hex is on a cluster's rim (corners need filling).
PAGE1_HEXES = {
    "farmland": ((519, 525), False),
    "stone": ((558, 1468), False),
    "forest": ((805, 362), True),
    "mountain": ((251, 350), True),
    "desert": ((228, 671), True),
}
INNER_RADIUS = 150

# AI Units.png: 10 columns x 7 rows of 120 px cells; rows 0-3 are yellow, teal, blue, red.
FIGURES = ["villager", "builder", "merchant", "soldier", "scientist", "explorer", "priest",
           "bandit", "ranger", "jester"]
COLOURS = ["yellow", "teal", "blue", "red"]
CELL = 120


def hex_mask(w, h):
    mask = Image.new("L", (w * 4, h * 4), 0)
    r = w * 2
    cx, cy = w * 2, h * 2
    pts = [(cx + r * math.cos(math.pi / 3 * i), cy + r * math.sin(math.pi / 3 * i)) for i in range(6)]
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    return mask.resize((w, h), Image.LANCZOS)


# Edge hexes of a cluster reach past its outer border, leaving white or grey corners. Pixels
# in the outer band of the hexagon that are close to white or grey take the parchment colour.
PARCHMENT = (214, 197, 150, 255)


def fill_edge_gaps(img):
    px = img.load()
    cx, cy = TILE_W / 2, TILE_H / 2
    for y in range(TILE_H):
        for x in range(TILE_W):
            if math.hypot(x - cx, y - cy) < 0.72 * TILE_H / 2 * 1.1:
                continue
            r, g, b, a = px[x, y]
            grey = max(r, g, b) - min(r, g, b) < 18
            if grey and (r > 200 or r < 150):
                px[x, y] = PARCHMENT


def tiles(folder):
    page = Image.open(folder / "Map Tiles" / "Explore and Conquer - Map Page 1.png").convert("RGB")
    out = ROOT / "art" / "tiles"
    out.mkdir(parents=True, exist_ok=True)
    mask = hex_mask(TILE_W, TILE_H)
    r = INNER_RADIUS
    h = r * math.sqrt(3) / 2
    for terrain, ((x, y), edge) in PAGE1_HEXES.items():
        crop = page.crop((round(x - r), round(y - h), round(x + r), round(y + h)))
        crop = crop.resize((TILE_W, TILE_H), Image.LANCZOS).convert("RGBA")
        if edge:
            fill_edge_gaps(crop)
        crop.putalpha(mask)
        crop.save(out / f"{terrain}.png", optimize=True)
        print("tile", terrain, (out / f"{terrain}.png").stat().st_size, "bytes")


def tokens(folder):
    sheet = Image.open(folder / "Units" / "AI Units.png").convert("RGBA")
    out = ROOT / "art" / "tokens"
    out.mkdir(parents=True, exist_ok=True)
    circle = Image.new("L", (TOKEN * 4, TOKEN * 4), 0)
    ImageDraw.Draw(circle).ellipse((2, 2, TOKEN * 4 - 3, TOKEN * 4 - 3), fill=255)
    circle = circle.resize((TOKEN, TOKEN), Image.LANCZOS)
    for row, colour in enumerate(COLOURS):
        for col, figure in enumerate(FIGURES):
            cell = sheet.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            # Trim to the round token: find the non-white extent.
            box = cell.convert("L").point(lambda v: 255 if v < 245 else 0).getbbox()
            if box:
                cell = cell.crop(box)
            cell = cell.resize((TOKEN, TOKEN), Image.LANCZOS)
            cell.putalpha(circle)
            cell.save(out / f"{figure}-{colour}.png", optimize=True)
    print("tokens", len(FIGURES) * len(COLOURS))


# Building pictures and what the game uses them for (provisional: there is no Mill or
# Assembly art yet, so the Farm and the Gatehouse stand in).
BUILDINGS = {
    "settlement": "Castle.png",
    "mill": "Farm.png",
    "sawmill": "Sawmill.png",
    "assembly": "Gatehouse.png",
}
BUILDING_MAX = 160


def clear_white(img, tolerance=18):
    """Makes the white background transparent by flooding in from the edges."""
    from collections import deque
    px = img.load()
    w, h = img.size
    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        queue.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        queue.extend([(0, y), (w - 1, y)])
    while queue:
        x, y = queue.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if min(r, g, b) < 255 - tolerance:
            continue
        px[x, y] = (255, 255, 255, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                queue.append((nx, ny))


def buildings(folder):
    out = ROOT / "art" / "buildings"
    out.mkdir(parents=True, exist_ok=True)
    for name, file in BUILDINGS.items():
        img = Image.open(folder / "Units" / file).convert("RGBA")
        img.thumbnail((400, 600), Image.LANCZOS)
        clear_white(img)
        img = img.crop(img.getbbox())
        img.thumbnail((BUILDING_MAX, BUILDING_MAX), Image.LANCZOS)
        img.save(out / f"{name}.png", optimize=True)
        print("building", name, img.size, (out / f"{name}.png").stat().st_size, "bytes")


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    tiles(folder)
    tokens(folder)
    buildings(folder)
