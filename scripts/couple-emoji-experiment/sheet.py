"""결과 폴더(들)를 한 장의 비교 격자로 — 행 = 실행(run), 열 = 감정. 판정·공유용."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

EMOTIONS = ["angry", "happy", "excited", "sad", "sleepy", "love"]
CELL, PAD, LABEL = 300, 8, 28

def main(out_path, run_dirs):
    rows = []
    for d in run_dirs:
        d = Path(d)
        rows.append((d.name, [d / f"{e}.png" for e in EMOTIONS]))
    w = PAD + len(EMOTIONS) * (CELL + PAD)
    h = PAD + len(rows) * (CELL + LABEL + PAD)
    sheet = Image.new("RGB", (w, h), "white")
    draw = ImageDraw.Draw(sheet)
    for r, (name, files) in enumerate(rows):
        y0 = PAD + r * (CELL + LABEL + PAD)
        draw.text((PAD, y0 + 6), name, fill="black")
        for c, f in enumerate(files):
            x0 = PAD + c * (CELL + PAD)
            if f.exists():
                im = Image.open(f).convert("RGB").resize((CELL, CELL))
                sheet.paste(im, (x0, y0 + LABEL))
            else:
                draw.rectangle([x0, y0 + LABEL, x0 + CELL, y0 + LABEL + CELL], outline="red")
                draw.text((x0 + 10, y0 + LABEL + 10), "missing", fill="red")
            if r == 0:
                draw.text((x0 + CELL - 60, y0 + 6), EMOTIONS[c], fill="gray")
    sheet.save(out_path)
    print("saved", out_path, sheet.size)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
