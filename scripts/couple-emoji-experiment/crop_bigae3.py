"""비개구리 3차 스케치(한 페이지에 7종)를 낱장으로 자른다.

2차(`crop_bigae2.py`)와 다른 점 하나: **사진이 3장인데 같은 페이지다.** `p3k…` 가 페이지 전체를
찍은 것이고 `nzw…`·`zyq…` 는 그 페이지의 위·아래를 당겨 찍은 것이다. 같은 그림이면 **당겨 찍은
쪽에서 자른다** — 해상도가 같은 1440 이라 좁게 찍힌 쪽이 그림당 픽셀이 더 많다. 페이지 전체
사진은 가장자리에 걸려 확대 컷에서 잘린 그림(01)에만 쓴다.

나머지는 2차와 같다 — 자른 뒤 autocontrast(연필 윤곽), 정사각 흰 캔버스, 768 저장, 대조표.
"""
from __future__ import annotations

import glob
import os

from PIL import Image, ImageOps

PHOTOS = 'scripts/couple-emoji-experiment/photos'
OUT = f'{PHOTOS}/bigae3'
SHEET = 'scripts/couple-emoji-experiment/out/bigae3-crops-sheet.png'

# 같은 페이지를 찍은 사진 3장. 전부 1440×1440.
WIDE = f'{PHOTOS}/p3kchewdcufydbgsoprz.jpg'   # 페이지 전체
TOP = f'{PHOTOS}/nzw1ribtujf2vx4rejk7.jpg'    # 위쪽 당겨 찍기
BOTTOM = f'{PHOTOS}/zyqro9d0a2gafltkgews.jpg'  # 아래쪽 당겨 찍기

REF_SIZE = 1440

# (사진, 좌표) — 좌표계는 그 사진의 1440 기준
BOXES = {
    '01-whistle': (WIDE, (120, 190, 470, 450)),    # ε 눈 + 작은 동그란 입 (확대 컷에서는 왼쪽이 잘린다)
    '02-mirror': (TOP, (590, 460, 1140, 850)),     # 손거울 + 앞머리 빗질 — 꽃단장
    '03-relaxed': (TOP, (60, 790, 550, 1170)),     # 눈 내리깔고 잔잔한 미소
    '04-wink': (TOP, (660, 910, 1210, 1230)),      # 한쪽 눈 감고 한쪽은 실눈
    '05-flower': (BOTTOM, (0, 770, 640, 1220)),    # 미소 + 옆에 작은 꽃
    '06-grin': (BOTTOM, (760, 470, 1270, 850)),    # 속눈썹 감은 눈 + 큰 미소
    # 리본 + 속눈썹 — 꽃단장 2. 아래쪽 확대 컷에서는 사진 오른쪽 끝에 얼굴이 잘려서 전체 사진을 쓴다
    '07-ribbon': (WIDE, (580, 1080, 1090, 1440)),
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    cache: dict[str, Image.Image] = {}

    for name, (src, (x0, y0, x1, y1)) in BOXES.items():
        im = cache.setdefault(src, Image.open(src).convert('RGB'))
        sx, sy = im.width / REF_SIZE, im.height / REF_SIZE
        crop = im.crop((int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy)))
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
    print(f'cropped {len(files)} -> {OUT}')


if __name__ == '__main__':
    main()
