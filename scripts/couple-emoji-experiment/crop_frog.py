"""비개구리 스케치 첫 장(한 페이지에 7종)을 낱장으로 자른다 — 좌표는 692×692 기준 눈대중."""
import glob
import os
from PIL import Image

SRC = 'scripts/couple-emoji-experiment/photos/72CX4bg2_3D3iyP_4ELcrV_478864.jpg'
OUT = 'scripts/couple-emoji-experiment/photos/frog'
BOXES = {
    '01-top-angry-bird': (190, 25, 430, 150),
    '02-frame-angry': (280, 175, 425, 300),
    '03-frame-sad': (265, 345, 405, 470),
    '04-frame-happy': (245, 500, 425, 650),
    '05-left-tongue': (25, 305, 145, 400),
    '06-left-sulky': (25, 465, 135, 565),
    '07-right-laugh': (430, 335, 625, 475),
}

im = Image.open(SRC).convert('RGB')
W, H = im.size
sx, sy = W / 692, H / 692
os.makedirs(OUT, exist_ok=True)
paper = im.getpixel((5, 5))
for name, (x0, y0, x1, y1) in BOXES.items():
    c = im.crop((int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy)))
    s = max(c.size)
    canvas = Image.new('RGB', (s, s), paper)
    canvas.paste(c, ((s - c.width) // 2, (s - c.height) // 2))
    canvas.resize((768, 768)).save(f'{OUT}/{name}.jpg', quality=92)

files = sorted(glob.glob(f'{OUT}/*.jpg'))
C, P = 220, 6
sheet = Image.new('RGB', (P + len(files) * (C + P), P + C + P), 'white')
for i, f in enumerate(files):
    sheet.paste(Image.open(f).resize((C, C)), (P + i * (C + P), P))
sheet.save('scripts/couple-emoji-experiment/out/frog-crops-sheet.png')
print('cropped', len(files))
