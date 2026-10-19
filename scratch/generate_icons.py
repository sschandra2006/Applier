"""
Generates crisp PNG icons for the Applier Chrome Extension using PyMuPDF.
"""

import os
import fitz

ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "extension", "icons")
os.makedirs(ICONS_DIR, exist_ok=True)

sizes = [16, 32, 48, 128]

for size in sizes:
    doc = fitz.open()
    page = doc.new_page(width=size, height=size)

    # Background circle (Applier Blue #2563eb)
    center = fitz.Point(size / 2, size / 2)
    radius = (size / 2) * 0.9
    page.draw_circle(center, radius, color=(0.145, 0.388, 0.922), fill=(0.145, 0.388, 0.922))

    # Lightning bolt icon in white
    # Normalize coordinates 0.0 - 1.0 to size
    pts = [
        fitz.Point(size * 0.55, size * 0.20),
        fitz.Point(size * 0.35, size * 0.52),
        fitz.Point(size * 0.50, size * 0.52),
        fitz.Point(size * 0.45, size * 0.80),
        fitz.Point(size * 0.68, size * 0.45),
        fitz.Point(size * 0.52, size * 0.45)
    ]
    page.draw_polyline(pts, color=(1, 1, 1), fill=(1, 1, 1), closePath=True)

    pix = page.get_pixmap(dpi=72)
    out_path = os.path.join(ICONS_DIR, f"icon{size}.png")
    pix.save(out_path)
    doc.close()
    print(f"Generated {out_path} ({size}x{size})")
