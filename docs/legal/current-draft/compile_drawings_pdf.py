#!/usr/bin/env python3
"""Compile FIG-1..13 PNGs into a USPTO-style portrait Drawings.pdf.

Simple placement rule:
  1. Center the CHART (boxes/lines — not side numerals) on the page.
  2. Keeping that center fixed, scale so CHART + annotations all fit
     inside the 1\" margins.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

DRAWINGS = Path(__file__).resolve().parent / "drawings"
OUT = Path(__file__).resolve().parent / "Drawings.pdf"
N = 13

# Generator chrome (title bar) cropped from 612×792 SVGs / 2× PNGs
TOP_FRAC = 40 / 792
BOTTOM_FRAC = 8 / 792
MARGIN = 1.0 * inch
SVG_W, SVG_H = 612.0, 792.0


def crop_chrome(img: Image.Image) -> Image.Image:
    w, h = img.size
    top = int(h * TOP_FRAC)
    bottom = int(h * (1 - BOTTOM_FRAC))
    return img.crop((0, top, w, bottom))


def load_bounds_in_cropped_png(
    fig: int, png_w: int, png_h_full: int, cropped_h: int
) -> tuple[tuple[float, float, float, float], tuple[float, float, float, float]]:
    """Map FIG-n.bounds.json (SVG pts) → cropped PNG pixel boxes (l,t,r,b)."""
    data = json.loads((DRAWINGS / f"FIG-{fig}.bounds.json").read_text(encoding="utf-8"))
    sx = png_w / SVG_W
    sy = png_h_full / SVG_H
    top_crop = png_h_full * TOP_FRAC

    def map_box(box: list[float]) -> tuple[float, float, float, float]:
        x0, y0, x1, y1 = box
        return (
            x0 * sx,
            y0 * sy - top_crop,
            x1 * sx,
            y1 * sy - top_crop,
        )

    chart = map_box(data["chart"])
    full = map_box(data["full"])
    # Clamp into cropped image
    def clamp(b: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
        l, t, r, bot = b
        return (
            max(0.0, min(l, png_w)),
            max(0.0, min(t, cropped_h)),
            max(0.0, min(r, png_w)),
            max(0.0, min(bot, cropped_h)),
        )

    return clamp(chart), clamp(full)


def place_drawing(
    img_w: int,
    img_h: int,
    chart: tuple[float, float, float, float],
    full: tuple[float, float, float, float],
    sight: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    """Center chart; scale so full (chart+annotations) fits in sight band."""
    sight_l, sight_b, sight_r, sight_t = sight
    # Reserved bands for sheet # (top) and FIG. # (bottom) — keep drawings clear
    header_band = 0.40 * inch
    footer_band = 0.55 * inch  # extra pad above "FIG. N" so notes never collide
    band_l, band_r = sight_l, sight_r
    band_b = sight_b + footer_band
    band_t = sight_t - header_band
    band_cx = (band_l + band_r) / 2.0
    band_cy = (band_b + band_t) / 2.0
    half_w = (band_r - band_l) / 2.0 - 2.0
    half_h = (band_t - band_b) / 2.0 - 2.0

    cl, ct, cr, cb = chart
    fl, ft, fr, fb = full
    chart_cx = (cl + cr) / 2.0
    chart_cy = (ct + cb) / 2.0

    # Overhangs of FULL content from the CHART center (px)
    left_over = max(1.0, chart_cx - fl)
    right_over = max(1.0, fr - chart_cx)
    top_over = max(1.0, chart_cy - ft)
    bot_over = max(1.0, fb - chart_cy)

    # Largest scale with chart locked to center where full still fits
    scale = min(
        half_w / left_over,
        half_w / right_over,
        half_h / top_over,
        half_h / bot_over,
    )
    scale = max(0.05, scale)

    x = band_cx - chart_cx * scale
    y = band_cy - (img_h - chart_cy) * scale
    return x, y, img_w * scale, img_h * scale


def main() -> None:
    page_w, page_h = letter
    sight = (MARGIN, MARGIN, page_w - MARGIN, page_h - MARGIN)
    sight_l, sight_b, sight_r, sight_t = sight

    c = canvas.Canvas(str(OUT), pagesize=letter)
    c.setTitle("par Noir — Patent Drawings (FIG. 1–13)")
    c.setAuthor("Mark Jonathan Mazzei")

    for i in range(1, N + 1):
        png = DRAWINGS / f"FIG-{i}.png"
        bounds = DRAWINGS / f"FIG-{i}.bounds.json"
        if not png.exists() or not bounds.exists():
            raise SystemExit(f"Missing {png.name} or {bounds.name} — run generate + rasterize first")

        raw = Image.open(png).convert("RGB")
        png_w, png_h_full = raw.size
        img = crop_chrome(raw)
        iw, ih = img.size
        chart, full = load_bounds_in_cropped_png(i, png_w, png_h_full, ih)

        tmp = DRAWINGS / f"_tmp_fig{i}.jpg"
        img.save(tmp, "JPEG", quality=95)

        x, y, dw, dh = place_drawing(iw, ih, chart, full, sight)
        c.drawImage(str(tmp), x, y, width=dw, height=dh, preserveAspectRatio=True, mask="auto")

        c.setFont("Helvetica", 12)
        c.drawCentredString(page_w / 2, sight_t - 0.22 * inch, f"{i}/{N}")
        # FIG. sits near the bottom of the footer band; drawing band ends above it
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(page_w / 2, sight_b + 0.15 * inch, f"FIG. {i}")

        c.showPage()
        tmp.unlink(missing_ok=True)

    c.save()
    print(f'Wrote {OUT} ({N} sheets: chart-centered, scale-to-fit, 1\" margins)')


if __name__ == "__main__":
    main()
