"""Trim the rendered logo PNGs to their content (plus an 8 px margin). Run after render.cjs."""
import glob, os
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
for f in glob.glob(os.path.join(here, "..", "*.png")):
    if "icon" in os.path.basename(f):
        continue
    im = Image.open(f)
    l, t, r, b = im.getbbox()
    m = 8
    im.crop((max(0, l - m), max(0, t - m), min(im.width, r + m), min(im.height, b + m))).save(f)
