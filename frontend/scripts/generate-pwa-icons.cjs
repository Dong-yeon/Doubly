/**
 * PWA 아이콘 생성 — assets/icon.png(1024) → public/icons/icon-{192,512}.png + maskable.
 *
 * <p>왜 필요한가: Expo 의 Metro 웹 export 는 manifest.json 을 만들어 주지 않는다
 * (구 webpack 시절 기능). manifest 를 손으로 두는 이상 아이콘도 우리가 준비해야 한다.
 * 브라우저 "앱 설치" 버튼이 뜨려면 192·512 가 필요하다.
 *
 * <p><b>빌드 단계에 넣지 않았다.</b> 아이콘은 거의 바뀌지 않는데 매 빌드마다 PNG 를
 * 다시 써서 워킹 트리가 더러워진다(icon-glyphmap.json 이 그러고 있다). 대신 산출물을
 * 커밋해 두고, <b>assets/icon.png 를 바꿀 때 이 스크립트를 다시 돌린다</b>:
 *
 *   node scripts/generate-pwa-icons.cjs
 *
 * <p>docs/PC_APP_ANALYSIS_2026-09-14.md 4절 1단계 "PWA manifest".
 */
const fs = require('fs');
const path = require('path');
const { generateImageAsync } = require('@expo/image-utils');

const SRC = path.resolve(__dirname, '../assets/icon.png');
const OUT_DIR = path.resolve(__dirname, '../public/icons');

/*
 * maskable 은 원본을 그대로 쓴다. 안드로이드 런처가 원형·스퀴클로 잘라내므로 원래는
 * 안전영역(가장자리 10%)을 비워 둔 별도 이미지가 맞지만, 우리 아이콘은 이미
 * android-icon-foreground 로 같은 여백을 갖고 있어 한 장으로 겸한다.
 */
const SIZES = [192, 512];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const { source } = await generateImageAsync(
      { projectRoot: path.resolve(__dirname, '..'), cacheType: 'pwa-icon' },
      { src: SRC, width: size, height: size, resizeMode: 'contain', backgroundColor: 'transparent' },
    );
    const out = path.join(OUT_DIR, `icon-${size}.png`);
    fs.writeFileSync(out, source);
    console.log(`✓ ${path.relative(process.cwd(), out)} (${size}x${size})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
