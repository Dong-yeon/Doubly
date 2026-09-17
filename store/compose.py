#!/usr/bin/env python3
"""폰에서 찍은 실제 캡처 + 배경판 → 스토어에 올릴 이미지.

    python3 store/compose.py <캡처_폴더> [--size play-phone]

캡처 폴더의 파일을 <b>이름순</b>으로 배경판 문구 순서(01~05)에 맞춘다. 파일이 5개보다
적으면 있는 만큼만 만든다. 결과는 store/out/<size>/ 에 떨어진다.

문구를 <b>골라 쓰고 싶으면 파일 이름을 문구 키로 지으면 된다</b> — `04-place.png` 처럼.
찍은 화면이 5개 축을 다 덮지 못할 때(예: 럽슐랭이 아직 빈 상태) 순서대로 밀어 넣어
엉뚱한 문구가 붙는 걸 막는다. 키가 아닌 이름은 남은 문구에 순서대로 배정된다.

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


def pair_up(shots: list[pathlib.Path]) -> list[tuple[pathlib.Path, tuple[str, str, str]]]:
    """캡처 ↔ 문구 짝짓기.

    파일 이름(확장자 뺀 것)이 문구 키와 같으면 그 문구를 쓴다. 나머지는 남은 문구에
    이름순으로 배정한다 — 5장을 순서대로 주던 기존 사용법이 그대로 돌아간다.
    """
    by_key = {key: (key, l1, l2) for key, l1, l2 in CAPTIONS}
    taken: dict[pathlib.Path, tuple[str, str, str]] = {}
    for shot in shots:
        cap = by_key.get(shot.stem)
        if cap and cap not in taken.values():
            taken[shot] = cap
    rest = [c for c in CAPTIONS if c not in taken.values()]
    pairs = []
    for shot in shots:
        if shot in taken:
            pairs.append((shot, taken[shot]))
        elif rest:
            pairs.append((shot, rest.pop(0)))
    return pairs


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

    pairs = pair_up(shots)
    # 안내문에 줄표(—)를 쓰지 않는다: 윈도우 기본 콘솔(cp949)이 이 글자에서 UnicodeEncodeError
    # 로 죽는다. 같은 줄의 화살표·따옴표는 cp949 에 있어서 괜찮다.
    if len(pairs) < len(shots):
        print(f"캡처 {len(shots)}장, 문구가 {len(CAPTIONS)}개뿐이라 앞 {len(pairs)}장만 씁니다.")
    if len(pairs) < len(CAPTIONS):
        done = {cap[0] for _, cap in pairs}
        missing = [key for key, _, _ in CAPTIONS if key not in done]
        print(f"아직 캡처가 없는 자리: {', '.join(missing)}")
    for shot, cap in pairs:
        print(f"  {shot.name} → {cap[0]}  “{cap[1]} {cap[2]}”")

    made = 0
    for size_key, w, h in SIZES:
        if wanted and size_key != wanted:
            continue
        dest = OUT / size_key
        dest.mkdir(parents=True, exist_ok=True)
        x, y, sw, sh = slot_box(w, h)
        for shot, (cap_key, _l1, _l2) in pairs:
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
        print(f"{size_key}: {len(pairs)}장 → {dest}")
    if made == 0:
        print(f"--size 값을 확인하세요. 가능한 값: {', '.join(k for k, _, _ in SIZES)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
