#!/usr/bin/env python3
"""Tile images into a contact sheet: sheet.py out.jpg cols cellW img1 img2 ..."""
import sys
from PIL import Image, ImageDraw
out, cols, cw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
ch = round(cw * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * ch), (0, 0, 0))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * cw, (i // cols) * ch
    sheet.paste(im.resize((cw, ch), Image.LANCZOS), (x, y))
    label = f.split('/')[-1].rsplit('.', 1)[0]
    d.rectangle([x, y, x + 8 * len(label) + 8, y + 16], fill=(0, 0, 0))
    d.text((x + 4, y + 2), label, fill=(255, 255, 255))
sheet.save(out, quality=90)
print(out, sheet.size)
