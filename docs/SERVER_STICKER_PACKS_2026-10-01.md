# 서버 배포 스티커 팩 (2026-10-01)

## 왜

이모티콘을 번들에 넣을수록 앱이 무거워진다. 번들 Noto 110종만으로 이미 7.8MB 이고, 같은 날 넣은 Noto 50종이 3.8MB 를 더 얹을 참이었다.
사용자 결정: **"앱에 넣지 않고 서버에서 받는 팩 방식으로 먼저 고친다."**
카카오톡·비트윈·LINE 과 같은 방식이다. 팩은 서버에 두고, 패널을 열면 썸네일만, 말풍선에 처음 그릴 때 애니메이션을 받아 기기에 보관한다.

**결과**
- 앱 번들 증가 0
- 첫 서버 팩은 두 개다.
  - Noto 50종: `ANIM_ALL` 팩에 이어 붙는다. 아직 OTA 전이라 번들에서 빼서 옮겼다.
  - LottieFiles "친구들" 10종: 새 팩 `ANIM_FRIENDS`.
- 팩을 더하는 데 **앱 배포가 필요 없다** — 백엔드 배포로 나간다.

## 구조

```
backend/src/main/resources/
  stickers/catalog.json          ← 어느 코드가 어느 팩의 무슨 그림인가 (add_pack.py 가 만든다)
  sticker-assets/<code>.<해시8>.json / .png
```

### 서버

- `RemoteStickerCatalog`: 기동 때 catalog.json 을 읽는다. 버전은 내용 해시 12자다.
- `GET /api/v1/stickers/catalog`: `{version, packs:[{id, items:[{code,label,url,thumbUrl}]}]}`.
  - 경로에는 오리진이 없다. 앱이 API 오리진을 붙인다.
- `/sticker-assets/**`: **인증 없이**, `Cache-Control: max-age=1년, public, immutable` 로 내린다(`StickerAssetConfig`, SecurityConfig permitAll).
  - 파일 이름에 내용 해시가 있으므로, 그림을 고치면 이름이 바뀐다.
- `ChatService`:
  - 전송 판정: 번들 enum 다음에 카탈로그의 팩을 본다(`stickerPackOf`). 여기를 빠뜨리면 유료 팩을 서버에 올렸을 때 조용히 공짜로 샌다.
  - 알림·인용 미리보기: 카탈로그 라벨로 "[이모티콘] 안녕 곰" 을 만든다.
- 팩의 제목·가격·잠금은 그대로 `sticker_packs` 다. `ANIM_FRIENDS` 는 **V111** 로 시드했다(무료).

### 앱

- `store/remoteStickerStore`:
  - 로그인되면 저장본(AsyncStorage)을 먼저 펼치고 서버에 묻는다.
  - 같은 실행 안에서는 10분, 강제로 물어도 30초 간격이다.
  - 저장본이 있어서 오프라인으로 켜도 지난 말풍선이 그려진다.
- `utils/remoteStickerFiles`:
  - 애니메이션 JSON 을 **문서 폴더**(`remote-stickers/`)에 한 번 받아 두고, 메모리에도 파싱본을 둔다.
  - 캐시 폴더가 아닌 이유: 시스템이 비우면 지난 말풍선이 다시 썸네일로 돌아간다.
- `components/RemoteAnimatedSticker`:
  - 받는 동안은 썸네일을 보여 준다(크기가 같아 출렁이지 않는다).
  - 다 받으면 번들 이모티콘과 같은 규칙으로 재생한다(한 번 재생, 누르면 다시).
  - 웹은 썸네일만 그린다(번들 이모티콘과 같은 이유).
- 붙인 자리:
  - 채팅 말풍선
  - 이모티콘 패널: 같은 팩 id 면 번들 뒤에 잇고, 새 팩이면 새 칸
  - 추천 막대: 라벨 검색과 썸네일
  - 방 목록 미리보기
- **모르는 코드 처리** (상대가 새 팩을 먼저 보낸 경우)
  - 카탈로그를 한 번도 못 받았을 때: 코드처럼 생긴 값(`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$`)은 빈 자리만 잡고 카탈로그를 다시 묻는다. 코드 글자가 화면에 스치지 않는다.
  - 카탈로그가 있는데도 모를 때: 지금까지처럼 글자로 둔다(내린 캐릭터의 옛 코드 등).

## 팩을 더하는 법

1. 그림을 준비한다 — Lottie JSON 과 썸네일 PNG(72~144px). 라이선스 근거는 `scripts/sticker-packs/<PACK>.sources.*` 에 남긴다.
2. spec.tsv(`code<TAB>label<TAB>json<TAB>png`)를 만들고 아래 스크립트를 돌린다. 같은 팩을 다시 넣으면 통째로 갈아끼우고, 안 쓰는 해시 파일은 지운다.
   ```bash
   python scripts/sticker-packs/add_pack.py <PACK_ID> spec.tsv
   ```
3. **새 팩이면** `sticker_packs` 시드 마이그레이션을 추가한다. 그러지 않으면 `RemoteStickerCatalogTest` 가 막는다.
4. LottieFiles 그림이면 `openSourceLicenses.ts` 에 작가를 더한다. 이 고지는 앱 번들이라 다음 OTA 때 반영된다.
5. 백엔드 테스트 → main 병합·푸시 → Railway 배포. 앱은 다음 카탈로그 조회 때 받는다.

**코드 규칙**: 번들 코드(`ANIM_*` enum·`EGG_*`/`DUO_*`)와 겹치면 안 된다. 겹치면 번들이 먼저 잡혀서 서버 항목이 영영 안 쓰인다 — 테스트가 막는다. 새 팩은 팩 고유 접두를 쓴다(`FRIEND_*`).

## 친구들 팩 손질 (LottieFiles 10종)

- 흰 배경 2개(안아주기·손 흔드는 곰): 흰 단색 레이어를 지웠다.
- 여백 7개: lottie-web 으로 25프레임의 그림 범위를 재고, 원본 레이어를 프리컴프 하나로 감싸 정사각 캔버스로 옮겼다.
  - 커플 곰: 캔버스 차지율 15 → 49%
  - 안녕 곰: 20 → 74%
- 라이선스: Lottie Simple License.
  - 상업 이용·수정 허용, 저작자 표시는 권장.
  - **배포물에 같은 조건을 실어야 해서** 앱 오픈소스 고지에 전문과 작가를 넣었다.
  - 근거: `scripts/sticker-packs/ANIM_FRIENDS.sources.json`
- 그림체가 작가 5명으로 흩어져 있다(2026-09-30 실험실 비교의 지적). 사용자가 "귀여워서 좋다"고 해서 그대로 넣었다.

## 검증

- **백엔드**: 스티커·채팅 관련 59건 통과. 그중 `RemoteStickerCatalogTest` 7건은 아래를 확인한다.
  - 파일 존재와 해시 일치
  - 번들 코드와 겹치지 않음
  - 팩 시드가 있고 무료
  - 정적 파일이 인증 없이 immutable 로 내려감
  - 카탈로그 API
  - 서버 팩 스티커 전송 뒤 미리보기 "[이모티콘] 안녕 곰"
- **프론트**: `typecheck`, `verify:sticker-codes` 457, `verify:nested-buttons`, `build:web` 통과. 바꾼 파일의 lint 는 기준선 대비 새 문제 0.
- **로컬 전체 스택**(도커 Postgres + bootRun + 웹, 로컬 시험 계정)
  - 받은 서버 스티커(친구들·Noto 추가분)가 말풍선에 그려졌다.
  - 패널이 160칸 + "친구들" 탭으로 떴다.
  - 친구들 스티커를 보내면 서버에 `FRIEND_KISS_SHEEP` 로 저장됐다.
- **운영 배포 확인**(c83f29de, Railway): `/sticker-assets/...` 가 `200`, `Cache-Control: max-age=31536000, public, immutable` 로 내려왔다.
- **네이티브(안드로이드 태블릿, 운영 서버)**: 커밋하지 않는 임시 개발 화면에 서버 코드 9개를 그렸다(메시지 전송 없음).
  - 카탈로그 60종을 받았다.
  - 9장이 모두 그려졌다.
  - `files/remote-stickers/` 에 해시 이름 JSON 9개가 저장됐다.
  - 누르면 그 자리만 다시 움직였다(화소 차이로 확인).
  - 임시 화면은 지웠다.
  - 다른 세션의 Metro 가 8081 을 쓰고 있어서 8082 로 따로 띄워 확인했다.
- **미확인**:
  - iOS
  - 실제 채팅 말풍선·패널의 네이티브 동작 — 웹에서는 확인했다. 컴포넌트는 같다.
  - 첫 실행 오프라인

## 남은 것 / 다음

- **번들 110종을 서버로 옮길지** — 옮기면 번들이 −7.8MB 다.
  - 대가 1: 첫 패널을 열 때 썸네일 110장을 받는다.
  - 대가 2: 오프라인 첫 실행에 지난 말풍선이 썸네일·빈칸으로 보인다.
  - 옛 앱 버전은 번들을 그대로 가지므로 호환 문제는 없다. 서버 방식이 실사용에서 문제없는지 본 뒤 정한다.
- Fluent 같은 무거운 팩(20종 7.3MB)도 이제 같은 경로로 실을 수 있다. 다만 형식이 WebP 이미지라 `RemoteAnimatedSticker` 에 이미지 경로를 더해야 한다(지금은 Lottie 만).
- 옛 해시 파일은 기기에 남는다(장당 수십 KB). 쌓이면 청소를 붙인다.
- CDN: 지금은 Railway 백엔드가 직접 내린다. 트래픽이 늘면 카탈로그의 경로만 CDN 으로 바꾸면 된다(앱 수정 없음).
