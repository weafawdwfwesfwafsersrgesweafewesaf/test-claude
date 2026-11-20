"""Génère les textures 2D de visages (style Roblox) avec PIL.
Chaque expression existe en version yeux ouverts et yeux fermés (clignement).
Sortie : textures/faces/<nom>.png et <nom>_blink.png (1024x512, fond transparent).
La texture couvre la moitié avant de la tête cylindrique (u: -90°..+90°)."""
import os, math
from PIL import Image, ImageDraw

W, H = 1024, 512
INK = (20, 18, 22, 255)
WHITE = (255, 255, 255, 255)
RED = (225, 30, 35, 255)
TONGUE = (200, 70, 80, 255)
SWEAT = (110, 190, 255, 255)
LW = 22  # épaisseur de trait


def _canvas():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def eye_open(d, cx, cy, s=1.0, look=(0, 0)):
    rx, ry = 34 * s, 48 * s
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=INK)
    hx, hy = cx - 10 * s + look[0], cy - 18 * s + look[1]
    d.ellipse([hx - 11 * s, hy - 11 * s, hx + 11 * s, hy + 11 * s], fill=WHITE)


def eye_wide(d, cx, cy):
    # yeux de peur : blanc avec petite pupille
    d.ellipse([cx - 52, cy - 62, cx + 52, cy + 62], fill=WHITE, outline=INK, width=16)
    d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=INK)


def eye_closed(d, cx, cy, happy=False):
    # arc fermé
    if happy:
        d.arc([cx - 46, cy - 30, cx + 46, cy + 40], 200, 340, fill=INK, width=LW)
    else:
        d.arc([cx - 46, cy - 40, cx + 46, cy + 30], 20, 160, fill=INK, width=LW)


def brow(d, cx, cy, angle):
    L = 60
    a = math.radians(angle)
    dx, dy = math.cos(a) * L, math.sin(a) * L
    d.line([cx - dx, cy - dy, cx + dx, cy + dy], fill=INK, width=LW)


def make(name, blink=False):
    im = _canvas()
    d = ImageDraw.Draw(im)
    ex, ey = 120, 210  # écart des yeux / hauteur
    L, R = W / 2 - ex, W / 2 + ex
    mx, my = W / 2, 340
    if name in ("neutral", "smile", "smirk", "determined"):
        if blink:
            eye_closed(d, L, ey); eye_closed(d, R, ey)
        else:
            eye_open(d, L, ey); eye_open(d, R, ey)
        if name == "neutral":
            d.arc([mx - 70, my - 60, mx + 70, my + 40], 30, 150, fill=INK, width=LW)
        elif name == "smile":
            d.chord([mx - 95, my - 80, mx + 95, my + 75], 0, 180, fill=INK)
            d.chord([mx - 60, my + 5, mx + 60, my + 62], 0, 180, fill=TONGUE)
        elif name == "smirk":
            d.arc([mx - 80, my - 70, mx + 60, my + 30], 20, 120, fill=INK, width=LW)
        elif name == "determined":
            brow(d, L, ey - 85, 15); brow(d, R, ey - 85, -15)
            d.line([mx - 55, my, mx + 55, my - 6], fill=INK, width=LW)
    elif name in ("scared", "sweat"):
        if blink:
            eye_closed(d, L, ey); eye_closed(d, R, ey)
        else:
            eye_wide(d, L, ey); eye_wide(d, R, ey)
        brow(d, L, ey - 95, -18); brow(d, R, ey - 95, 18)
        d.ellipse([mx - 48, my - 40, mx + 48, my + 80], fill=INK)
        d.ellipse([mx - 28, my + 30, mx + 28, my + 70], fill=TONGUE)
        if name == "sweat":
            sx, sy = R + 120, ey - 40
            d.polygon([(sx, sy - 70), (sx - 34, sy + 10), (sx + 34, sy + 10)], fill=SWEAT)
            d.ellipse([sx - 34, sy - 22, sx + 34, sy + 46], fill=SWEAT)
            d.ellipse([sx - 14, sy - 6, sx, sy + 8], fill=WHITE)
    elif name == "angry":
        if blink:
            eye_closed(d, L, ey); eye_closed(d, R, ey)
        else:
            eye_open(d, L, ey + 10, 0.85); eye_open(d, R, ey + 10, 0.85)
        brow(d, L, ey - 70, 22); brow(d, R, ey - 70, -22)
        d.arc([mx - 70, my, mx + 70, my + 90], 200, 340, fill=INK, width=LW)
    elif name == "sleep":
        eye_closed(d, L, ey); eye_closed(d, R, ey)
        d.ellipse([mx - 26, my - 10, mx + 26, my + 44], fill=INK)
    elif name == "happy":
        eye_closed(d, L, ey, happy=True); eye_closed(d, R, ey, happy=True)
        d.chord([mx - 95, my - 80, mx + 95, my + 75], 0, 180, fill=INK)
        d.chord([mx - 60, my + 5, mx + 60, my + 62], 0, 180, fill=TONGUE)
    elif name == "hiccup":
        # yeux écarquillés + petite bouche en O
        if blink:
            eye_closed(d, L, ey); eye_closed(d, R, ey)
        else:
            eye_wide(d, L, ey); eye_wide(d, R, ey)
        d.ellipse([mx - 24, my - 10, mx + 24, my + 40], fill=INK)
    elif name == "holdbreath":
        # yeux plissés >< , joues gonflées, bouche pincée
        for cx, s in ((L, 1), (R, -1)):
            d.line([cx - 40 * s, ey - 30, cx + 30 * s, ey, cx - 40 * s, ey + 30], fill=INK, width=LW, joint="curve")
        for cx in (L - 40, R + 40):
            d.ellipse([cx - 55, my - 55, cx + 55, my + 25], fill=(255, 120, 120, 130))
        d.line([mx - 30, my, mx + 30, my], fill=INK, width=LW)
        sx, sy = R + 150, ey - 60
        d.polygon([(sx, sy - 60), (sx - 30, sy + 10), (sx + 30, sy + 10)], fill=SWEAT)
        d.ellipse([sx - 30, sy - 18, sx + 30, sy + 42], fill=SWEAT)
    elif name == "dog":
        # visage de chien : yeux ronds + truffe
        if blink:
            eye_closed(d, L, ey); eye_closed(d, R, ey)
        else:
            eye_open(d, L, ey, 1.1); eye_open(d, R, ey, 1.1)
    elif name == "frost":
        # yeux du monstre : fentes lumineuses (texture d'émission séparée)
        for cx in (L, R):
            d.polygon([(cx - 70, ey - 10), (cx + 70, ey - 30), (cx + 60, ey + 25), (cx - 60, ey + 30)], fill=WHITE)
    return im


ALL = ["neutral", "smile", "smirk", "determined", "scared", "sweat", "angry", "sleep", "happy", "hiccup", "holdbreath"]


def build(outdir):
    os.makedirs(outdir, exist_ok=True)
    for n in ALL:
        make(n).save(os.path.join(outdir, f"{n}.png"))
        make(n, blink=True).save(os.path.join(outdir, f"{n}_blink.png"))


if __name__ == "__main__":
    build(os.path.join(os.path.dirname(__file__), "..", "textures", "faces"))
