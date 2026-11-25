#!/usr/bin/env python3
"""Génère toutes les images du plugin (SVG -> PNG via rsvg-convert)."""
import math, os, subprocess, tempfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "com.medilase.retro-slate.sdPlugin", "imgs")
F = dict(base="#1f6672", light="#3a8f9b", dark="#0f3d45")
INK = "#3b3b39"


def png(svg, path, size):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as t:
        t.write(svg)
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", full, t.name], check=True)
    os.unlink(t.name)


def both(svg, base, size):
    png(svg, base + ".png", size)
    png(svg, base + "@2x.png", size * 2)


# ---------- le dessin d'exemple (un seul trait, comme sur l'ardoise) ----------
def sample_points():
    pts = [(40, 372), (170, 372), (170, 252), (250, 172), (330, 252), (330, 372),
           (420, 372), (420, 300), (470, 300), (470, 372), (600, 372), (600, 140), (545, 140)]
    cx, cy, r = 490, 140, 55
    steps = 18
    for i in range(1, steps + 1):  # soleil en escalier
        a = i / steps * 2 * math.pi
        x, y = cx + r * math.cos(a), cy - r * math.sin(a)
        px, py = pts[-1]
        pts.append((round(x), py))
        pts.append((round(x), round(y)))
    return pts


def sample_path(ox, oy, k):
    p = sample_points()
    return "M" + " L".join(f"{ox + x * k:.1f} {oy + y * k:.1f}" for x, y in p)


def slate_group(x, y, w, ink_w, knob_r_ratio=0.062, with_label=False):
    """Ardoise vue de face, largeur w (rapport 1000 × 860)."""
    k = w / 1000
    sx, sy, sw, sh = x + 80 * k, y + 70 * k, 840 * k, 577.5 * k
    kr = 62 * k
    s = f"""
    <rect x="{x}" y="{y}" width="{w}" height="{860*k}" rx="{70*k}" fill="url(#fr)"/>
    <rect x="{x}" y="{y}" width="{w}" height="{860*k}" rx="{70*k}" fill="url(#sheen)"/>
    <rect x="{sx-14*k}" y="{sy-14*k}" width="{sw+28*k}" height="{sh+28*k}" rx="{26*k}" fill="#000" opacity=".35"/>
    <rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="{16*k}" fill="url(#scr)"/>
    <path d="{sample_path(sx, sy, sw/640)}" fill="none" stroke="{INK}" stroke-width="{ink_w}" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="{16*k}" fill="url(#glare)"/>
    """
    for cx in (110, 890):
        s += f"""<circle cx="{x+cx*k}" cy="{y+760*k}" r="{kr}" fill="url(#kn)" stroke="#000" stroke-opacity=".35" stroke-width="{3*k}"/>
        <circle cx="{x+cx*k}" cy="{y+760*k}" r="{kr*0.66}" fill="url(#cap)"/>"""
    return s


DEFS = f"""<defs>
<linearGradient id="fr" x1="0" y1="0" x2=".38" y2="1"><stop offset="0" stop-color="{F['light']}"/><stop offset=".42" stop-color="{F['base']}"/><stop offset="1" stop-color="{F['dark']}"/></linearGradient>
<radialGradient id="sheen" cx=".22" cy=".06" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="scr" cx=".3" cy=".2" r="1.1"><stop offset="0" stop-color="#e6e6e1"/><stop offset=".62" stop-color="#c8c8c3"/><stop offset="1" stop-color="#b2b2ad"/></radialGradient>
<linearGradient id="glare" x1="0" y1="0" x2="1" y2=".55"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".3" stop-color="#fff" stop-opacity=".07"/><stop offset=".305" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="kn" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#babdc2"/><stop offset="1" stop-color="#6d7177"/></radialGradient>
<radialGradient id="cap" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#cfd2d6"/><stop offset="1" stop-color="#959aa1"/></radialGradient>
<radialGradient id="bg" cx=".5" cy=".38" r=".85"><stop offset="0" stop-color="#3b342c"/><stop offset=".6" stop-color="#231e19"/><stop offset="1" stop-color="#13100d"/></radialGradient>
<radialGradient id="kbg" cx=".5" cy=".35" r=".85"><stop offset="0" stop-color="#2c3a40"/><stop offset="1" stop-color="#11171a"/></radialGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f5f6"/><stop offset=".55" stop-color="#b9bdc2"/><stop offset="1" stop-color="#7c8188"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-opacity=".55"/></filter>
</defs>"""


def svg(size, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{DEFS}{body}</svg>'


# ---------- icône du plugin (Marketplace) ----------
plugin = svg(512, f'<rect width="512" height="512" fill="url(#bg)"/><g filter="url(#sh)">{slate_group(36, 70, 440, 6.5)}</g>')
both(plugin, "plugin/marketplace", 256)

# ---------- icônes monochromes blanches (liste des actions, catégorie) ----------
def mono(body, size=40):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 40 40" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">{body}</svg>'

SLATE_MONO = '<rect x="3" y="5" width="34" height="30" rx="5"/><rect x="8" y="9.5" width="24" height="15" rx="1.5"/><circle cx="9" cy="30" r="2.2" fill="#FFFFFF"/><circle cx="31" cy="30" r="2.2" fill="#FFFFFF"/>'
both(mono(SLATE_MONO + '<path d="M11 21h5v-6h6v4h6" stroke-width="1.8"/>'), "plugin/category-icon", 28)
both(mono(SLATE_MONO + '<path d="M11 21h5v-6h6v4h6" stroke-width="1.8"/>'), "actions/slate/icon", 20)
both(mono('<circle cx="20" cy="20" r="11"/><path d="M20 9v6"/><path d="M6 13a16 16 0 0 0 0 14M34 13a16 16 0 0 1 0 14" stroke-width="2"/><path d="M4 24l2 3.5 3-2.5M36 24l-2 3.5-3-2.5" stroke-width="2"/>'), "actions/knob/icon", 20)
both(mono('<path d="M6 20h24M22 11l9 9-9 9"/>'), "actions/arrow/icon", 20)
both(mono('<g transform="rotate(-12 20 20)"><rect x="9" y="8" width="22" height="24" rx="4"/><rect x="13" y="12" width="14" height="10" rx="1"/></g><path d="M4 14q-2 6 0 12M36 14q2 6 0 12" stroke-width="2"/>'), "actions/shake/icon", 20)
both(mono('<path d="M5 13h6l3-4h12l3 4h6v18H5z"/><circle cx="20" cy="22" r="5.5"/>'), "actions/photo/icon", 20)

# ---------- images des touches (couleur) ----------
def knob_body(cx, cy, r):
    knurl = ""
    for i in range(36):
        a = i * 10 * math.pi / 180
        knurl += f"M{cx+math.cos(a)*r*0.78:.1f} {cy+math.sin(a)*r*0.78:.1f}L{cx+math.cos(a)*r*0.96:.1f} {cy+math.sin(a)*r*0.96:.1f}"
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#kn)" stroke="#2f3338" stroke-width="2"/>'
            f'<path d="{knurl}" stroke="#555a60" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.6}" fill="url(#cap)"/>'
            f'<rect x="{cx-3}" y="{cy-r*0.92}" width="6" height="{r*0.36}" rx="3" fill="#2b2e33"/>')

both(svg(144, f'<rect width="144" height="144" fill="url(#kbg)"/>{knob_body(72, 72, 54)}'), "actions/knob/encoder", 72)

both(svg(144, '<rect width="144" height="144" fill="url(#kbg)"/><path d="M30 62h48V40l38 32-38 32V82H30z" fill="url(#metal)" stroke="#0b0f11" stroke-width="2" stroke-linejoin="round"/>'), "actions/arrow/key", 72)

shake = (f'<rect width="144" height="144" fill="url(#kbg)"/>'
         f'<g transform="rotate(-13 72 74)">{slate_group(26, 34, 92, 2.2)}</g>'
         '<path d="M14 50q-8 22 0 44M24 58q-5 14 0 28M130 50q8 22 0 44M120 58q5 14 0 28" stroke="#cfe6ea" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>')
both(svg(144, shake), "actions/shake/key", 72)

both(svg(144, f'<rect width="144" height="144" fill="url(#kbg)"/>{slate_group(8, 10, 128, 2.4)}'), "actions/slate/key", 72)

photo = ('<rect width="144" height="144" fill="url(#kbg)"/>'
         '<path d="M22 48h22l9-13h38l9 13h22v58H22z" fill="url(#metal)" stroke="#0b0f11" stroke-width="2.5" stroke-linejoin="round"/>'
         '<circle cx="72" cy="77" r="22" fill="#20282c" stroke="#0b0f11" stroke-width="2.5"/>'
         '<circle cx="72" cy="77" r="14" fill="url(#scr)"/>'
         '<path d="M62 82h6v-8h7v5h6" stroke="#3b3b39" stroke-width="2" fill="none"/>'
         '<circle cx="108" cy="58" r="4" fill="#e9b949"/>')
both(svg(144, photo), "actions/photo/key", 72)

print("icônes générées dans", os.path.normpath(ROOT))
