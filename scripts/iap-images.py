#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'iap-images'
OUT.mkdir(parents=True, exist_ok=True)
LOGO = OUT / 'honsulbar-logo.png'
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

PACKS = [
    ('honsulbar_p1000', '1,000P'),
    ('honsulbar_p3300', '3,300P'),
    ('honsulbar_p6000', '6,000P'),
    ('honsulbar_p10000', '10,000P'),
    ('honsulbar_p20000', '20,000P'),
]

SIZE = 1024
LOGO_SIZE = 148
GAP = 36
BLUE = (49, 130, 246, 255)
font = ImageFont.truetype(FONT, 132, index=2)
logo = Image.open(LOGO).convert('RGBA').resize((LOGO_SIZE, LOGO_SIZE), Image.Resampling.LANCZOS)
mask = Image.new('L', (LOGO_SIZE, LOGO_SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, LOGO_SIZE, LOGO_SIZE), radius=round(LOGO_SIZE * 146 / 600), fill=255)
logo.putalpha(mask)

for sku, points in PACKS:
    canvas = Image.new('RGBA', (SIZE, SIZE), BLUE)
    probe = ImageDraw.Draw(canvas)
    box = probe.textbbox((0, 0), points, font=font)
    text_w, text_h = box[2] - box[0], box[3] - box[1]
    stack = LOGO_SIZE + GAP + text_h
    top = (SIZE - stack) // 2
    canvas.alpha_composite(logo, ((SIZE - LOGO_SIZE) // 2, top))
    ImageDraw.Draw(canvas).text(
        ((SIZE - text_w) // 2 - box[0], top + LOGO_SIZE + GAP - box[1]),
        points,
        font=font,
        fill=(255, 255, 255, 255),
    )
    path = OUT / f'{sku}.png'
    canvas.convert('RGB').save(path, 'PNG')
    print(path)
