"""비개구리 2차 스케치(한 페이지에 8종)를 낱장으로 자른다.

1차(`crop_frog.py`)와 다른 점 두 가지:

1. **좌표를 원본 픽셀로 적는다.** 1차는 692 기준 눈대중 좌표를 실제 크기에 맞춰 늘렸는데,
   사진 해상도가 바뀌면 조용히 어긋난다. 이 페이지는 1440×1440 이고 아래 BOXES 도 그 좌표계다.
   다른 해상도의 사진을 넣으면 비율로 환산한다.
2. **대비를 올린다.** 이 페이지는 흰 줄노트에 **연필로 그린 얼굴 윤곽 + 볼펜으로 그린 이목구비**가
   섞여 있다. 윤곽선이 종이와 거의 붙어 있어서 그대로 넘기면 이미지 모델이 하트형 머리를 못 보고
   눈·입만 떠 있는 그림을 그린다. autocontrast 로 종이를 흰색까지 밀어 올린다.

대조표(`out/bigae2-crops-sheet.png`)를 함께 저장한다 — 잘린 위치는 그걸 보고 고친다.
"""
from __future__ import annotations

import glob
import os

from PIL import Image, ImageOps

SRC = 'scripts/couple-emoji-experiment/photos/mfz7w1avf0dird46ybsj.jpg'
OUT = 'scripts/couple-emoji-experiment/photos/bigae2'
SHEET = 'scripts/couple-emoji-experiment/out/bigae2-crops-sheet.png'

# 좌표계 = 원본 1440×1440. 다른 크기면 비율로 환산한다.
REF_SIZE = 1440

# 페이지에 있지만 뺀 것:
#  - 왼쪽 가장자리·아래 가장자리에 걸려 잘린 그림 2개
#  - 오른쪽 위 "지하철 손잡이 + 회사가방"(낙서로 지워진 초안) — 같은 구도의 깨끗한 판이 08 에 있다
BOXES = {
    '01-hehe': (355, 185, 620, 370),        # 큰 웃음 + 혀 — 히히
    '02-kiss': (845, 185, 1010, 305),       # 하트 눈 + ε 입 — 뽀뽀
    '03-angry': (300, 375, 640, 570),       # 치켜뜬 눈 + 짜증 표시 — 화남
    '04-like': (415, 615, 610, 725),        # >< 눈 + 세모 입 — 좋아
    # 오른쪽 위 소용돌이 표시는 뺐다 — 넣으면 검은 덩어리로 그려져 얼굴 옆에 때처럼 남는다
    '05-dizzy': (420, 765, 625, 950),       # 소용돌이 눈 + 혀 — 어질~
    '06-gift': (805, 675, 1065, 960),       # 리본 상자를 안은 전신 — 선물
    '07-dance': (290, 1010, 710, 1285),     # 뒷모습 + 음표 — 신나~
    '08-offwork': (815, 970, 1095, 1295),   # 지하철 손잡이 + 회사가방 — 퇴근
}


def main() -> None:
    im = Image.open(SRC).convert('RGB')
    scale = im.width / REF_SIZE, im.height / REF_SIZE
    os.makedirs(OUT, exist_ok=True)

    for name, (x0, y0, x1, y1) in BOXES.items():
        box = (int(x0 * scale[0]), int(y0 * scale[1]), int(x1 * scale[0]), int(y1 * scale[1]))
        crop = im.crop(box)
        # 연필 윤곽을 살린다 — 자른 뒤에 해야 이 그림의 밝기 범위로 늘어난다
        crop = ImageOps.autocontrast(crop, cutoff=(0.5, 12))
        side = max(crop.size)
        canvas = Image.new('RGB', (side, side), 'white')
        canvas.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
        canvas.resize((768, 768), Image.LANCZOS).save(f'{OUT}/{name}.jpg', quality=92)

    files = sorted(glob.glob(f'{OUT}/*.jpg'))
    cell, pad = 220, 6
    sheet = Image.new('RGB', (pad + len(files) * (cell + pad), pad + cell + pad), 'white')
    for i, f in enumerate(files):
        sheet.paste(Image.open(f).resize((cell, cell)), (pad + i * (cell + pad), pad))
    os.makedirs(os.path.dirname(SHEET), exist_ok=True)
    sheet.save(SHEET)
    print(f'cropped {len(files)} → {OUT}')


if __name__ == '__main__':
    main()
