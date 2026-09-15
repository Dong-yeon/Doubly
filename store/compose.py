#!/usr/bin/env python3
"""폰에서 찍은 실제 캡처 + 배경판 → 스토어에 올릴 이미지.

    python3 store/compose.py <캡처_폴더> [--size play-phone]

캡처 폴더의 파일을 <b>이름순</b>으로 배경판 문구 순서(01~05)에 맞춘다. 파일이 5개보다
적으면 있는 만큼만 만든다. 결과는 store/out/<size>/ 에 떨어진다.

캡처는 비율이 달라도 된다 — 자리에 맞춰 <b>가운데를 채우도록</b> 잘라 넣는다(cover).
상·하단 상태바까지 그대로 찍혀 있어도 되고, 그게 오히려 실제 화면이라는 근거가 된다.
"""
import pathlib
import sys

from PIL import Image

from make_plates import CAPTIONS, SIZES, slot_box

ROOT = pathlib.Path(__file__).resolve().parent
PLATES = ROOT / "plates"
OUT = ROOT / "out"
EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    """자리를 가득 채우도록 비율 유지 확대 후 가운데 잘라내기."""
    scale = max(w / img.width, h / img.height)
    resized = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    return resized.crop((left, top, left + w, top + h))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    shots_dir = pathlib.Path(argv[1])
    if not shots_dir.is_dir():
        print(f"캡처 폴더를 못 찾았어요: {shots_dir}", file=sys.stderr)
        return 1

    wanted = None
    if "--size" in argv:
        wanted = argv[argv.index("--size") + 1]

    shots = sorted(p for p in shots_dir.iterdir() if p.suffix.lower() in EXTS)
    if not shots:
        print(f"이미지가 없어요: {shots_dir}", file=sys.stderr)
        return 1
    if len(shots) < len(CAPTIONS):
        print(f"캡처 {len(shots)}장 — 문구 {len(CAPTIONS)}개 중 앞 {len(shots)}개만 씁니다.")

    made = 0
    for size_key, w, h in SIZES:
        if wanted and size_key != wanted:
            continue
        dest = OUT / size_key
        dest.mkdir(parents=True, exist_ok=True)
        x, y, sw, sh = slot_box(w, h)
        for shot, (cap_key, _l1, _l2) in zip(shots, CAPTIONS):
            plate_path = PLATES / f"{size_key}_{cap_key}.png"
            if not plate_path.exists():
                print(f"배경판 없음: {plate_path.name} — make_plates.py 를 먼저 돌리세요", file=sys.stderr)
                return 1
            plate = Image.open(plate_path).convert("RGBA")
            canvas = Image.new("RGBA", (w, h), (255, 255, 255, 255))
            canvas.paste(cover(Image.open(shot).convert("RGB"), sw, sh), (x, y))
            canvas.alpha_composite(plate)          # 뚫린 자리로 캡처가 비친다
            out = dest / f"{cap_key}.png"
            canvas.convert("RGB").save(out)        # 스토어는 알파를 원하지 않는다
            made += 1
        print(f"{size_key}: {min(len(shots), len(CAPTIONS))}장 → {dest}")
    if made == 0:
        print(f"--size 값을 확인하세요. 가능한 값: {', '.join(k for k, _, _ in SIZES)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
