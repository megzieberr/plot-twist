"""Generate Plot Twist PWA icons: a neon film-reel 'twist' on midnight purple."""
from PIL import Image, ImageDraw
import math, os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

BG = (11, 8, 23)
PINK = (255, 61, 139)
TEAL = (33, 230, 193)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make(size, maskable=False, name=None):
    S = size * 4  # supersample
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)

    # subtle radial glow
    cx, cy = S / 2, S / 2
    for r in range(S // 2, 0, -8):
        t = r / (S / 2)
        col = lerp((26, 18, 48), BG, t)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)

    # spiral "plot twist": two interleaved arms, pink and teal
    margin = 0.30 if maskable else 0.18
    max_r = S * (0.5 - margin)
    dot_r = S * 0.026
    for arm, col_a, col_b in [(0, PINK, (148, 61, 255)), (math.pi, TEAL, (61, 148, 255))]:
        steps = 26
        for i in range(steps):
            t = i / (steps - 1)
            ang = arm + t * math.pi * 2.4
            r = max_r * (0.18 + 0.82 * t)
            x = cx + r * math.cos(ang)
            y = cy + r * math.sin(ang)
            col = lerp(col_a, col_b, t)
            rr = dot_r * (0.55 + 0.9 * t)
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=col)

    # centre dot
    rr = dot_r * 1.6
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 215, 231))

    img = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(OUT, name or f"icon-{size}.png")
    img.save(path)
    print("wrote", path)


make(192)
make(512)
make(512, maskable=True, name="icon-maskable-512.png")
