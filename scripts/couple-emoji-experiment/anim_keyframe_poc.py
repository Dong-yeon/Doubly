#!/usr/bin/env python3
"""
우리 이모지 → 애니메이션 이모티콘 PoC (방식 B: keyframe flipbook)

이미 만들어진 우리 이모지(EmojiCutout 을 거친 투명 PNG, Cloudinary couple-emoji-cut/)를 참조로 넣고
같은 캐릭터의 포즈만 바꾼 keyframe 을 생성한 뒤 animated WebP 로 합친다.
결과물과 함께 일관성 확인용 contact sheet, 비용/시간 report.json 을 남긴다.

설계 §13(docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md)이 기각한 방식을 실측으로 다시 확인하는 실험이다.
그래서 생성 조건을 서버(CoupleEmojiService → GeminiClient.generateImageInBackground)와 맞춘다:
  - 모델 gemini-3.1-flash-image, imageSize 512px, temperature 0.4
  - aspectRatio 는 넣지 않는다 — 서버가 일부러 빼 둔 값이라 넣으면 그림체가 달라진다
  - 흰 배경으로 생성한 뒤 EmojiCutout 과 같은 알고리즘으로 따낸다(--bg cutout, 기본)

기준 버전: Python 3.14, google-genai 2.30.1, Pillow 12, numpy 2
설치:      pip install google-genai pillow numpy scipy

사용 예:
  GEMINI_IMAGE_API_KEY=... python anim_keyframe_poc.py --input love.png --motion heart
  python anim_keyframe_poc.py --input a.png b.png --motion blink --frames 2 --fps 6
  python anim_keyframe_poc.py --input love.png --motion custom --poses "arms up" "arms out"
  python anim_keyframe_poc.py --input love.png --motion wave --dry-run   # API 호출 없이 조립 단계만
"""

import argparse
import io
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# ---------------------------------------------------------------------------
# 모션 프리셋: 원본(frame 0) 다음에 올 포즈 설명. 영어가 이미지 모델에서 더 안정적이라 영어로 둔다.
# ---------------------------------------------------------------------------
MOTION_PRESETS = {
    "wave":  ["raising one hand up beside the face, about to wave",
              "waving the raised hand, hand tilted outward",
              "waving the raised hand, hand tilted inward"],
    "blink": ["eyes half closed",
              "eyes fully closed, gentle smile"],
    "jump":  ["crouching slightly, knees bent, preparing to jump",
              "jumping up in the air, both feet off the ground, arms raised happily",
              "landing softly, slight squash pose"],
    "nod":   ["head tilted slightly down, nodding",
              "head tilted further down, eyes closed, nodding firmly"],
    "heart": ["holding both hands together in front of the chest",
              "making a heart shape with both hands above the head",
              "making a heart shape with both hands, small pink hearts floating around"],
    "cry":   ["eyes watering, lips trembling",
              "crying with big tear drops streaming down",
              "crying loudly with mouth open, tears streaming"],
}

CHROMA_RGB = (0, 255, 0)
WHITE_RGB = (255, 255, 255)

PROMPT_TEMPLATE = (
    "Use the attached sticker as the exact character reference. "
    "Redraw the SAME character with identical face, hairstyle, outfit, colors, line weight and art style. "
    "Change ONLY the pose/expression: {pose}. "
    "Keep the same camera framing, the same character size and position, centered in a square canvas. "
    "Background: {background}. "
    "No text, no border, no shadow on the background, no extra characters or objects unless the pose requires them."
)
BG_TEXT = {
    "chroma": "a perfectly flat solid pure green (#00FF00) background",
    "white":  "a perfectly flat solid pure white (#FFFFFF) background",
}


# ---------------------------------------------------------------------------
# 이미지 유틸
# ---------------------------------------------------------------------------
def has_transparency(img: Image.Image) -> bool:
    if img.mode != "RGBA":
        return False
    alpha = np.asarray(img.getchannel("A"))
    return bool((alpha < 250).any())


def to_square(img: Image.Image, size: int, fill=(0, 0, 0, 0)) -> Image.Image:
    """비율 유지하며 size x size 캔버스 중앙에 배치."""
    img = img.convert("RGBA")
    img.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), fill)
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
    return canvas


def flatten_on(img: Image.Image, rgb) -> Image.Image:
    bg = Image.new("RGBA", img.size, rgb + (255,))
    bg.alpha_composite(img.convert("RGBA"))
    return bg.convert("RGB")


def chroma_key(img: Image.Image, tol: float = 90.0, soft: float = 60.0) -> Image.Image:
    """초록 배경 제거. despill 은 배경 경계(0 < alpha < 255)에만 건다 — 캐릭터 안쪽의 초록 옷·소품은 건드리지 않는다."""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    greenness = g - np.maximum(r, b)
    dist = np.sqrt((r - CHROMA_RGB[0]) ** 2 + (g - CHROMA_RGB[1]) ** 2 + (b - CHROMA_RGB[2]) ** 2)
    alpha = np.clip((dist - tol) / soft, 0.0, 1.0)
    alpha = np.where(greenness > 60, np.minimum(alpha, 1.0 - np.clip((greenness - 60) / 80, 0, 1)), alpha)
    edge = (alpha > 0.0) & (alpha < 1.0)
    g_fixed = np.where(edge & (greenness > 0), np.maximum(r, b), g)
    out = np.dstack([r, g_fixed, b, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


# ---------------------------------------------------------------------------
# EmojiCutout 이식 — backend/.../coupleemoji/service/EmojiCutout.java 와 같은 상수·같은 순서.
# 서버를 고치면 여기도 고친다(이 실험이 "서버 경로와 같은 조건"이라는 전제가 여기에 걸려 있다).
# ---------------------------------------------------------------------------
INK_BELOW = 236
INK_SPREAD = 24
CLOSE = 25
BORDER = 15
MIN_OUTSIDE = 0.12
MAX_OUTSIDE = 0.88


def _odd(n: float) -> int:
    v = max(3, int(round(n)))
    return v if v % 2 == 1 else v + 1


def _pass(m: np.ndarray, size: int, axis: int, all_: bool) -> np.ndarray:
    """축 방향 [t-r, t+r] 창. 팽창=하나라도 참, 침식=판 안에 든 칸이 전부 참(판 밖은 참으로 친다)."""
    r = size // 2
    a = np.moveaxis(m.astype(np.int32), axis, -1)
    n = a.shape[-1]
    prefix = np.concatenate([np.zeros(a.shape[:-1] + (1,), np.int32), np.cumsum(a, axis=-1)], axis=-1)
    t = np.arange(n)
    lo, hi = np.maximum(0, t - r), np.minimum(n - 1, t + r)
    count = prefix[..., hi + 1] - prefix[..., lo]
    out = count == (hi - lo + 1) if all_ else count > 0
    return np.moveaxis(out, -1, axis)


def _dilate(m, size):
    return _pass(_pass(m, size, 1, False), size, 0, False)


def _erode(m, size):
    return _pass(_pass(m, size, 1, True), size, 0, True)


def _flood_outside(mask: np.ndarray) -> np.ndarray:
    """위·왼쪽·오른쪽 변에서 재료가 아닌 칸을 따라 들어온 곳(4-연결). 아래 변은 막는다."""
    labels, _ = ndimage.label(~mask)  # 기본 구조 = 4-연결, 서버 BFS 와 같다
    edge = np.concatenate([labels[0, :], labels[:, 0], labels[:, -1]])
    seeds = np.unique(edge[edge > 0])
    return np.isin(labels, seeds)


def _box_blur(v: np.ndarray, r: int) -> np.ndarray:
    def one(a, axis):
        n = a.shape[axis]
        a = np.moveaxis(a, axis, -1)
        prefix = np.concatenate([np.zeros(a.shape[:-1] + (1,), np.int64), np.cumsum(a, axis=-1)], axis=-1)
        t = np.arange(n)
        lo, hi = np.maximum(0, t - r), np.minimum(n - 1, t + r)
        out = (prefix[..., hi + 1] - prefix[..., lo]) // (hi - lo + 1)
        return np.moveaxis(out, -1, axis)
    return one(one(v.astype(np.int64), 1), 0)


def emoji_cutout(img: Image.Image):
    """흰 배경 RGB → 투명 PNG(흰 스티커 테두리 포함). 결과가 수상하면 None(서버는 원본을 그대로 쓴다)."""
    rgb = np.asarray(img.convert("RGB")).astype(np.int32)
    h, w = rgb.shape[:2]
    if w < 64 or h < 64:
        return None
    k = w / 1024.0
    lo, hi = rgb.min(axis=2), rgb.max(axis=2)
    ink = (lo < INK_BELOW) | (hi - lo > INK_SPREAD)

    close = _odd(CLOSE * k)
    closed = _erode(_dilate(ink, close), close)
    outside = _flood_outside(closed)
    frac = outside.mean()
    if frac < MIN_OUTSIDE or frac > MAX_OUTSIDE:
        return None

    sticker = _dilate(~outside, _odd(BORDER * k * 2))
    alpha = np.where(sticker, 255, 0)
    blur = max(1, int(round(1.2 * k)))
    alpha = _box_blur(_box_blur(alpha, blur), blur)
    out = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def alpha_bbox(img: Image.Image, thresh: int = 16):
    a = np.asarray(img.getchannel("A"))
    ys, xs = np.where(a > thresh)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def align_to_reference(frame: Image.Image, ref_box) -> Image.Image:
    """bbox 하단 중앙을 원본에 맞춰 이동만 한다(크기 변경 없음). 프레임 간 위치 떨림 완화용."""
    box = alpha_bbox(frame)
    if box is None or ref_box is None:
        return frame
    ref_cx, ref_bottom = (ref_box[0] + ref_box[2]) / 2, ref_box[3]
    cx, bottom = (box[0] + box[2]) / 2, box[3]
    dx, dy = int(round(ref_cx - cx)), int(round(ref_bottom - bottom))
    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    canvas.paste(frame, (dx, dy), frame)
    return canvas


def contact_sheet(frames, labels, cell: int = 256) -> Image.Image:
    pad, label_h = 8, 22
    w = len(frames) * (cell + pad) + pad
    h = cell + label_h + pad * 2
    sheet = Image.new("RGBA", (w, h), (235, 235, 235, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (f, lab) in enumerate(zip(frames, labels)):
        x = pad + i * (cell + pad)
        checker = Image.new("RGBA", (cell, cell), (255, 255, 255, 255))
        cd = ImageDraw.Draw(checker)
        for yy in range(0, cell, 16):
            for xx in range(0, cell, 16):
                if (xx // 16 + yy // 16) % 2:
                    cd.rectangle([xx, yy, xx + 15, yy + 15], fill=(220, 220, 220, 255))
        thumb = f.resize((cell, cell), Image.LANCZOS)
        checker.alpha_composite(thumb)
        sheet.paste(checker, (x, pad))
        draw.text((x + 4, pad + cell + 4), lab, fill=(30, 30, 30, 255))
    return sheet


def save_webp(frames, path: Path, fps: float, quality: int) -> int:
    duration = int(round(1000 / fps))
    frames[0].save(
        path, format="WEBP", save_all=True, append_images=frames[1:],
        duration=duration, loop=0, lossless=False, quality=quality, method=6,
        allow_mixed=False,
    )
    return path.stat().st_size


# ---------------------------------------------------------------------------
# Gemini 호출
# ---------------------------------------------------------------------------
class Generator:
    def __init__(self, model: str, timeout_s: int, image_size, temperature: float,
                 max_attempts: int, dry_run: bool):
        self.model = model
        self.max_attempts = max_attempts
        self.dry_run = dry_run
        self.image_size = image_size
        self.temperature = temperature
        self.client = None
        self.types = None
        if not dry_run:
            # 서버와 같은 이름 — 이미지 생성은 결제 키(GEMINI_IMAGE_API_KEY), 없으면 일반 키
            api_key = os.environ.get("GEMINI_IMAGE_API_KEY") or os.environ.get("GEMINI_API_KEY")
            if not api_key:
                sys.exit("GEMINI_IMAGE_API_KEY(또는 GEMINI_API_KEY) 환경변수를 설정하세요.")
            from google import genai
            from google.genai import types
            self.types = types
            self.client = genai.Client(api_key=api_key,
                                       http_options=types.HttpOptions(timeout=timeout_s * 1000))

    def _config(self):
        t = self.types
        kwargs = {"response_modalities": ["IMAGE"], "temperature": self.temperature}
        # aspect_ratio 는 넣지 않는다 — GeminiClient.generateImageInBackground 주석 참고
        if self.image_size:
            kwargs["image_config"] = t.ImageConfig(image_size=self.image_size)
        return t.GenerateContentConfig(**kwargs)

    def generate(self, ref_png: bytes, prompt: str, frame_idx: int, ref_img: Image.Image):
        """반환: (PIL.Image | None, meta dict). 실패 시 지수 backoff 재시도."""
        meta = {"attempts": 0, "elapsed_s": 0.0, "errors": [], "usage": None}
        if self.dry_run:
            meta["attempts"] = 1
            angle = [0, 8, -8, 4, -4][frame_idx % 5]
            fake = ref_img.convert("RGBA").rotate(angle, resample=Image.BICUBIC,
                                                  center=(ref_img.width / 2, ref_img.height * 0.9),
                                                  fillcolor=(255, 255, 255, 255))
            return flatten_on(fake, WHITE_RGB), meta

        t = self.types
        contents = [t.Part.from_bytes(data=ref_png, mime_type="image/png"), prompt]
        start = time.monotonic()
        for attempt in range(1, self.max_attempts + 1):
            meta["attempts"] = attempt
            try:
                resp = self.client.models.generate_content(model=self.model, contents=contents,
                                                           config=self._config())
                if resp.usage_metadata is not None:
                    um = resp.usage_metadata
                    meta["usage"] = {
                        "prompt_tokens": um.prompt_token_count,
                        "output_tokens": um.candidates_token_count,
                        "total_tokens": um.total_token_count,
                    }
                img = None
                for cand in (resp.candidates or []):
                    if cand.content is None:
                        continue
                    for part in (cand.content.parts or []):
                        if part.inline_data is not None and part.inline_data.data:
                            img = Image.open(io.BytesIO(part.inline_data.data))
                            img.load()
                            break
                    if img is not None:
                        break
                if img is None:
                    reason = None
                    if resp.candidates:
                        reason = str(resp.candidates[0].finish_reason)
                    raise RuntimeError(f"이미지 없음 (finish_reason={reason})")
                meta["elapsed_s"] = round(time.monotonic() - start, 2)
                meta["raw_size"] = list(img.size)
                return img, meta
            except Exception as e:  # 네트워크/429/5xx/안전필터/빈 응답 모두 재시도 대상
                meta["errors"].append(f"#{attempt}: {type(e).__name__}: {str(e)[:300]}")
                if attempt < self.max_attempts:
                    time.sleep(min(2 ** attempt, 20))
        meta["elapsed_s"] = round(time.monotonic() - start, 2)
        return None, meta


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def process_one(src: Path, args, gen: Generator, out_root: Path) -> dict:
    name = src.stem
    out_dir = out_root / f"{name}_{args.motion}"
    out_dir.mkdir(parents=True, exist_ok=True)

    original = Image.open(src)
    original.load()
    original = to_square(original, args.size)
    if not has_transparency(original):
        print(f"[warn] {src.name}: 투명 배경이 아닙니다 — couple-emoji-cut/ 의 따낸 PNG 를 넣어야 서버 경로와 같습니다")

    bg_mode = args.bg
    # 참조는 생성 배경과 같은 단색 위에 올려서 전달한다. cutout 은 서버처럼 흰 배경에서 생성한다.
    ref_rgb = CHROMA_RGB if bg_mode == "chroma" else WHITE_RGB
    buf = io.BytesIO()
    flatten_on(original, ref_rgb).save(buf, format="PNG")
    ref_png = buf.getvalue()

    poses = args.poses if args.motion == "custom" else MOTION_PRESETS[args.motion]
    poses = poses[: args.frames] if args.frames else poses

    frame0 = original
    ref_box = alpha_bbox(frame0)
    frames, labels, frame_meta = [frame0], ["0 original"], []
    frame0.save(out_dir / "frame_00.png")

    for i, pose in enumerate(poses, start=1):
        prompt = PROMPT_TEMPLATE.format(pose=pose, background=BG_TEXT["chroma" if bg_mode == "chroma" else "white"])
        print(f"  frame {i}/{len(poses)}: {pose}")
        raw, meta = gen.generate(ref_png, prompt, i, original)
        meta.update({"frame": i, "pose": pose})
        frame_meta.append(meta)
        if raw is None:
            print(f"  [fail] frame {i}: {meta['errors'][-1] if meta['errors'] else 'unknown'}")
            continue
        raw.convert("RGBA").save(out_dir / f"frame_{i:02d}_raw.png")

        f = to_square(raw, args.size, fill=ref_rgb + (255,))
        if bg_mode == "chroma":
            f = chroma_key(f)
        elif bg_mode == "cutout":
            cut = emoji_cutout(f)
            meta["cutout_ok"] = cut is not None
            if cut is None:
                print(f"  [warn] frame {i}: EmojiCutout 실패(서버라면 흰 배경 원본을 씀) — 흰 배경 그대로 둔다")
            else:
                f = cut
        if not args.no_align:
            f = align_to_reference(f, ref_box)
        f.save(out_dir / f"frame_{i:02d}.png")
        frames.append(f)
        labels.append(f"{i} {pose[:24]}")

    report = {
        "input": str(src),
        "motion": args.motion,
        "model": args.model,
        "image_size_param": args.image_size,
        "temperature": args.temperature,
        "aspect_ratio": None,
        "bg_mode": bg_mode,
        "fps": args.fps,
        "pingpong": not args.no_pingpong,
        "frames_requested": len(poses),
        "frames_ok": len(frames) - 1,
        "api_calls": sum(m["attempts"] for m in frame_meta),
        "frames": frame_meta,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    # 과금은 성공한 이미지 기준으로 추정 (실패 호출의 과금 여부는 콘솔에서 확인 필요)
    report["est_cost_usd"] = round(report["frames_ok"] * args.price_per_image, 4)
    report["est_cost_krw"] = int(round(report["est_cost_usd"] * args.usd_krw))
    report["total_elapsed_s"] = round(sum(m["elapsed_s"] for m in frame_meta), 2)

    if len(frames) < 2:
        print(f"[skip] {src.name}: 성공한 프레임이 없어 애니메이션을 만들지 않습니다.")
        report["webp"] = None
    else:
        seq = frames + (frames[-2:0:-1] if not args.no_pingpong and len(frames) > 2 else [])
        webp_path = out_dir / f"{name}_{args.motion}.webp"
        size = save_webp(seq, webp_path, args.fps, args.quality)
        report["webp"] = str(webp_path)
        report["webp_bytes"] = size
        report["webp_frames"] = len(seq)
        if size > args.max_bytes:
            print(f"  [warn] {webp_path.name} {size/1024:.0f}KB > {args.max_bytes/1024:.0f}KB. --quality 를 낮추거나 --size 를 줄이세요.")
        contact_sheet(frames, labels).save(out_dir / "contact_sheet.png")

    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  → {out_dir}  (ok {report['frames_ok']}/{report['frames_requested']}, "
          f"≈${report['est_cost_usd']} / ₩{report['est_cost_krw']}, {report['total_elapsed_s']}s)")
    return report


def parse_args():
    p = argparse.ArgumentParser(description="우리 이모지 keyframe flipbook PoC")
    p.add_argument("--input", nargs="+", required=True, help="따낸 우리 이모지 PNG (여러 개 가능)")
    p.add_argument("--motion", default="wave", choices=list(MOTION_PRESETS) + ["custom"])
    p.add_argument("--poses", nargs="*", default=[], help="--motion custom 일 때 포즈 설명들")
    p.add_argument("--frames", type=int, default=0, help="생성할 keyframe 수 (0=프리셋 전체)")
    p.add_argument("--model", default=os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"),
                   help="서버 GeminiProperties.imageModel 과 같게")
    p.add_argument("--image-size", default=os.environ.get("GEMINI_IMAGE_SIZE", "512px"),
                   help="서버 GeminiProperties.imageSize 와 같게. 빼면 1K 라 장당 1.5배")
    p.add_argument("--temperature", type=float, default=0.4, help="서버 고정값 0.4")
    p.add_argument("--bg", default="cutout", choices=["cutout", "chroma", "white"],
                   help="cutout: 흰 배경 생성 + EmojiCutout(서버와 같음) / chroma: 초록 키잉 / white: 따내지 않음")
    p.add_argument("--size", type=int, default=512, help="출력 한 변 px")
    p.add_argument("--fps", type=float, default=6.0)
    p.add_argument("--quality", type=int, default=80, help="WebP 품질 0-100")
    p.add_argument("--max-bytes", type=int, default=500 * 1024, help="경고 기준 파일 크기")
    p.add_argument("--no-pingpong", action="store_true", help="0→N 후 역재생 없이 반복")
    p.add_argument("--no-align", action="store_true", help="프레임 위치 정렬 끄기")
    p.add_argument("--timeout", type=int, default=120, help="API 호출 타임아웃(초)")
    p.add_argument("--max-attempts", type=int, default=3)
    p.add_argument("--price-per-image", type=float, default=0.045, help="비용 추정용 USD/장(512px 기준)")
    p.add_argument("--usd-krw", type=float, default=1400.0, help="비용 추정용 환율")
    p.add_argument("--out", default="out/anim-poc")
    p.add_argument("--dry-run", action="store_true", help="API 호출 없이 회전 이미지로 조립 테스트")
    args = p.parse_args()
    if args.motion == "custom" and not args.poses:
        p.error("--motion custom 은 --poses 가 필요합니다.")
    if args.fps <= 0:
        p.error("--fps 는 0보다 커야 합니다.")
    return args


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # 윈도 콘솔 cp949 에서 ≈·₩ 출력이 죽는다
    args = parse_args()
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    gen = Generator(args.model, args.timeout, args.image_size, args.temperature,
                    args.max_attempts, args.dry_run)

    reports = []
    for path in args.input:
        src = Path(path)
        if not src.is_file():
            print(f"[skip] 파일 없음: {src}")
            continue
        print(f"[{src.name}] motion={args.motion}")
        try:
            reports.append(process_one(src, args, gen, out_root))
        except Exception as e:
            print(f"[error] {src.name}: {type(e).__name__}: {e}")

    if reports:
        ok = sum(r["frames_ok"] for r in reports)
        req = sum(r["frames_requested"] for r in reports)
        cost = sum(r["est_cost_usd"] for r in reports)
        summary = {"stickers": len(reports), "frames_ok": ok, "frames_requested": req,
                   "est_cost_usd": round(cost, 4), "est_cost_krw": int(round(cost * args.usd_krw))}
        (out_root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n요약: 스티커 {len(reports)}개, 프레임 {ok}/{req}, ≈${summary['est_cost_usd']} / ₩{summary['est_cost_krw']}")


if __name__ == "__main__":
    main()
