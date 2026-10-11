#!/usr/bin/env python3
"""폰에서 찍은 실제 캡처 + 배경판 → 스토어에 올릴 이미지.

    python3 store/compose.py <캡처_폴더> [--size play-phone]

캡처 폴더의 파일을 <b>이름순</b>으로 배경판 문구 순서(01~05)에 맞춘다. 파일이 5개보다
적으면 있는 만큼만 만든다. 결과는 store/out/<size>/ 에 떨어진다.

문구를 <b>골라 쓰고 싶으면 파일 이름을 문구 키로 지으면 된다</b> — `04-place.png` 처럼.
찍은 화면이 5개 축을 다 덮지 못할 때(예: 럽슐랭이 아직 빈 상태) 순서대로 밀어 넣어
엉뚱한 문구가 붙는 걸 막는다. 키가 아닌 이름은 남은 문구에 순서대로 배정된다.

캡처는 비율이 달라도 된다 — 자리에 맞춰 <b>가운데를 채우도록</b> 잘라 넣는다(cover).

<b>맨 위 상태바(시각·배터리·알림 아이콘)는 지운다</b>(2026-09-28, 기본값). 잘라내지 않고 앱의 맨 윗줄을
위로 늘려 덮는다 — 자리 비율이 그대로이고, 홈처럼 윗부분이 그라데이션이어도 자연스럽다.
그대로 두려면 `--keep-status-bar`. 하단 내비게이션 바는 그대로 둔다.
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


# 상태바 24dp — 캡처 기준(1080 폭 @ 420dpi)에서 63px. 폭에 비례해 다른 크기 캡처에도 맞춘다
STATUS_BAR_PX_AT_1080 = 63


def clear_status_bar(img: Image.Image) -> Image.Image:
    """상태바 영역을 <b>상태바 맨 윗부분의 한 줄</b>로 덮는다. 원본은 건드리지 않는다.

    앱은 상태바 뒤까지 제 배경을 그리고(edge-to-edge) 아이콘은 상태바 세로 가운데에만 있어서, 맨 위 몇 줄은
    순수한 앱 배경이다. 처음엔 상태바 바로 <b>아래</b> 줄을 늘렸는데, 홈에서는 그 줄에 프로필 링 윗가장자리가
    걸쳐 세로 줄무늬로 늘어났다. 혹시 남는 가는 것은 가로 중앙값 필터(창 61px)로 지운다.
    """
    import numpy as np

    bar = round(img.width * STATUS_BAR_PX_AT_1080 / 1080)
    src_y = max(1, round(bar * 0.05))  # 63px 바에서 3번째 줄 — 아이콘(가운데 약 2/3)보다 위
    row = np.asarray(img.crop((0, src_y, img.width, src_y + 1)))[0].astype(np.int16)  # (W, 3)
    half = 30
    padded = np.pad(row, ((half, half), (0, 0)), mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, 2 * half + 1, axis=0)  # (W, 3, 61)
    smooth = np.median(windows, axis=2).astype(np.uint8)
    fill = Image.fromarray(np.repeat(smooth[None, :, :], bar + 2, axis=0), "RGB")
    out = img.copy()
    out.paste(fill, (0, 0))
    return out


STICKERS_DIR = ROOT.parent / "frontend" / "assets" / "stickers"

# 휴대폰 가장자리에 걸치는 스티커 — (그림, 가로 중심, 세로 중심, 폭) 은 판 크기에 대한 비율, 마지막은 기울기(도).
# 그림은 앱에 실제로 있는 스티커 PNG 이거나, ("crop", cx, cy, r) = 캡처 속 원을 오려 낸 것(우리 이모지).
# 화면을 가리지 않게 가장자리에만 둔다 — 캡처 속 글자를 덮으면 "실제 화면"의 의미가 흐려진다.
STICKERS: dict[str, list[tuple]] = {
    "01-emoji": [(("crop", 861, 1590, 150), 0.86, 0.60, 0.25, -8), (("crop", 291, 891, 150), 0.13, 0.44, 0.23, 7)],
    "02-sticker": [("duo_love.png", 0.11, 0.50, 0.24, 8), ("duo_heart_eyes.png", 0.89, 0.83, 0.23, -8)],
    "03-home": [("duo_happy.png", 0.89, 0.33, 0.23, -7), ("egg_happy.png", 0.11, 0.80, 0.21, 8)],
    "04-play": [("duo_idea.png", 0.89, 0.24, 0.21, -8), ("duo_wink.png", 0.11, 0.86, 0.22, 8)],
    "05-place": [("duo_drool.png", 0.89, 0.31, 0.23, -7), ("duo_kiss.png", 0.11, 0.84, 0.21, 8)],
    "06-photo": [("duo_relaxed.png", 0.89, 0.84, 0.23, -8), ("egg_angel.png", 0.11, 0.40, 0.21, 7)],
}


def sticker_image(spec, shot: Image.Image) -> Image.Image:
    """스티커 한 장(RGBA). 크롭은 원으로 오리고 흰 바탕을 둔다 — 채팅 속 이모지 말풍선과 같은 모양."""
    from PIL import ImageDraw

    if isinstance(spec, tuple) and spec[0] == "crop":
        _, cx, cy, r = spec
        k = shot.width / 1080
        cx, cy, r = cx * k, cy * k, r * k
        im = shot.crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).convert("RGBA")
        m = Image.new("L", (im.width * 4, im.height * 4), 0)
        ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
        im.putalpha(m.resize(im.size, Image.LANCZOS))
        return im
    return Image.open(STICKERS_DIR / spec).convert("RGBA")


def outlined(st: Image.Image, width_px: int, angle: float) -> Image.Image:
    """흰 테두리 + 옅은 그림자를 두른 스티커 — 나노바나나 시안의 '떠 있는 스티커'."""
    from PIL import ImageFilter

    pad = width_px * 3
    base = Image.new("RGBA", (st.width + pad * 2, st.height + pad * 2), (0, 0, 0, 0))
    base.alpha_composite(st, (pad, pad))
    a = base.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    ring = a.filter(ImageFilter.MaxFilter(width_px * 2 + 1)).filter(ImageFilter.GaussianBlur(1))
    shadow = ring.filter(ImageFilter.GaussianBlur(width_px * 1.2)).point(lambda v: v * 0.28)
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sh = Image.new("RGBA", base.size, (40, 30, 30, 255)); sh.putalpha(shadow)
    out.alpha_composite(sh, (0, width_px // 2))
    white = Image.new("RGBA", base.size, (255, 255, 255, 255)); white.putalpha(ring)
    out.alpha_composite(white)
    out.alpha_composite(base)
    return out.rotate(angle, resample=Image.BICUBIC, expand=True)


def place_stickers(canvas: Image.Image, cap_key: str, shot: Image.Image) -> None:
    w, h = canvas.size
    for spec, fx, fy, fw, angle in STICKERS.get(cap_key, []):
        st = sticker_image(spec, shot)
        tw = round(w * fw)
        st = st.resize((tw, round(st.height * tw / st.width)), Image.LANCZOS)
        st = outlined(st, max(4, round(w * 0.009)), angle)
        canvas.alpha_composite(st, (round(w * fx - st.width / 2), round(h * fy - st.height / 2)))


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

    keep_status_bar = "--keep-status-bar" in argv
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
            img = Image.open(shot).convert("RGB")
            if not keep_status_bar:
                img = clear_status_bar(img)
            canvas.paste(cover(img, sw, sh), (x, y))
            canvas.alpha_composite(plate)          # 뚫린 자리로 캡처가 비친다
            place_stickers(canvas, cap_key, Image.open(shot).convert("RGB"))
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
