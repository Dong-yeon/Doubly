# 장애 공지·점검 배너·강제 업데이트 (2026-09-30)

`docs/BETWEEN_GAP_CHECK_2026-09-30.md` 우선순위 1번 "장애 공지"의 구현과 운영 절차.
비트윈은 2025-09 데이터 삭제 사고 때 공지가 앱 안에서 눈에 띄지 않아 비판받았다.

## 1. 설계 결정

| 결정 | 이유 |
| --- | --- |
| 공지 소스는 **`landing/status.json`(dubly.co.kr, Netlify)** — 백엔드 아님 | 공지가 필요한 순간은 대개 백엔드(Railway)가 죽은 순간이다. 백엔드가 주는 공지는 정작 그때 도달하지 않는다. 백엔드 변경은 **없다** |
| 의심스러우면 없는 것으로 | 손으로 고치는 파일이라 언젠가 깨진다. 깨진 공지는 안 뜨면 그만이지만, 깨진 값이 강제 업데이트를 켜면 전원이 잠긴다. 형식이 어긋난 항목은 통째로 버린다 |
| 공지와 최소 버전은 **따로** 판정 | 공지 쪽 오타가 강제 업데이트를 막거나, 그 반대가 되지 않게 |
| 앱 기동을 막지 않는다 | 4초 타임아웃, await 하지 않음, 실패는 전부 삼킨다 |
| 네트워크 실패 시 직전 상태 유지, 응답이 왔는데 쓸 게 없으면(404·깨짐·빈 값) 내림 | 잠깐 끊긴 사이 점검 공지가 사라졌다 나타나는 건 안 띄우는 것보다 나쁘다 |
| 최소 버전 비교 대상은 **네이티브 빌드 버전**(`expo-application`) | 최소 버전을 올리는 건 "OTA 로 못 고치는 문제"일 때다. expoConfig.version(업데이트 매니페스트 값)이 아니다 |
| 웹은 강제 업데이트 **제외**, 공지·점검 문구는 **동작** | 웹은 새로고침하면 늘 최신. `utils/appVersion.web.ts` 가 null 을 돌려 판정 자체를 안 한다. 웹은 다른 오리진이라 `landing/_headers` 에 CORS 를 열었다 |

### EAS Update 로 충분한가 — 예 (실측)

`expo-application` 은 package.json 에 없었지만 expo-notifications·expo-auth-session 의 의존성으로
**1.0.4 빌드(85868c57) lockfile 에 56.0.3 으로 이미 있고 autolink 된다.** package.json 에 명시한
뒤에도 fingerprint 가 그대로임을 확인했다 — android `008f556825734332704921db98ec816321a64406`,
ios `c9ede6bd19476acb9dbccadd3f8df5181ebf3855`(추가 전후 동일). 아이콘 서브셋(새 아이콘 5개)은
런타임 `useFonts` 로 읽는 에셋이라 fingerprint 입력이 아니다(app.json 의 expo-font 는 Pretendard 만).
→ **1.0.4 에는 OTA 로 배달된다.** 1.0.3 이하는 fingerprint 가 달라 이 코드가 가지 않는다(공지도 안 보인다).

## 2. 스키마 (`schemaVersion: 1`)

```jsonc
{
  "schemaVersion": 1,                          // 1 이 아니면 앱은 파일 전체를 무시한다
  "updatedAt": "2026-10-01T01:00:00+09:00",    // 필수(공지가 있으면). "닫기" 기억 키 — 공지를 새로 쓰면 반드시 바꾼다
  "notice": {                                  // null 이면 공지 없음
    "level": "maintenance",                    // info | warning | maintenance
    "title": "서비스 점검 안내",                  // 선택, 40자. 없으면 공지 / 서비스 안내 / 서비스 점검 중
    "message": "02:00~04:00 DB 점검으로 ...",    // 필수, 300자에서 자름
    "startsAt": "2026-10-01T02:00:00+09:00",   // 선택. 반드시 오프셋(+09:00 또는 Z) 포함 — 없으면 공지 폐기
    "endsAt":   "2026-10-01T04:00:00+09:00",   // 선택. startsAt 보다 뒤여야 함. [startsAt, endsAt)
    "linkUrl": "https://dubly.co.kr/support"   // 선택, https 만
  },
  "minAppVersion": { "android": "1.0.4", "ios": "1.0.4" },  // 선택, null = 강제 안 함. "숫자.숫자.숫자" 만
  "updateMessage": null                        // 선택. 강제 업데이트 화면 문구
}
```

앱이 하는 일:

- **콜드 스타트 + 포그라운드 복귀**마다 읽는다(30초 스로틀). `App.tsx` → `hooks/useServiceStatusSync`.
- **홈 상단 배너**(`components/ServiceStatusBanner`) — 기간 안이고, 사용자가 이 `updatedAt` 을 닫지
  않았으면. 1분마다 기간을 다시 판정하므로 `endsAt` 이 지나면 저절로 사라진다.
- **점검 중 API 오류 문구** — `level: maintenance` 이고 기간 안이면 `utils/error.ts` 의
  `getErrorMessage` 가 `status 0`(연결 실패·타임아웃)·`5xx` 를
  "서비스 점검 중이에요. 10월 1일 04:00까지 예정이에요." 로 바꾼다. **배너를 닫아도 적용된다.** 4xx 는 그대로.
- **강제 업데이트**(`components/ForceUpdateGate`) — 설치 빌드 < minAppVersion 이면 앱 전체를 덮는
  닫을 수 없는 화면(안드로이드 뒤로가기 무시) + 스토어 버튼. 로그인 전 화면에서도 걸린다.

## 3. 운영 절차

### 배포 경로

`landing/` 을 Netlify 사이트 `ornate-quokka-deff1f` 에 게시한다(`docs/LANDING_SITE.md`).
**이 사이트가 Git 연동인지 드래그&드롭인지는 저장소에서 확인되지 않았다** — 처음 한 번 확인해 여기 적을 것.

- Git 연동: `landing/status.json` 수정 → 커밋 → `main` 푸시. 반영까지 수십 초.
- 드래그&드롭: Netlify → Deploys → `landing/` 폴더째 끌어 놓기. **`_headers` 도 같이 올라가야 한다.**
- 급할 때(저장소 작업이 번거로울 때)는 드래그&드롭이 가장 빠르다. 올린 뒤 저장소에도 같은 내용을 커밋해 둔다
  (다음 배포가 공지를 되돌리지 않게).

**첫 배포 전 할 일**: 지금 `https://dubly.co.kr/status.json` 은 404 다(앱은 "공지 없음"으로 취급 — 문제없음).
평시 파일과 `_headers` 를 한 번 올리고 아래로 확인한다.

```bash
curl -sI https://dubly.co.kr/status.json
```

`200`, `cache-control: no-cache…`, `access-control-allow-origin: *` 이 보여야 한다.

### 올리기 전 검증 (필수)

```bash
node -e "JSON.parse(require('fs').readFileSync('landing/status.json','utf8'))" && echo ok
```

```bash
npm --prefix frontend run verify:service-status
```

두 번째는 해석 규칙 44건 + **저장소의 status.json 이 1.0.4 를 잠그지 않는지**를 본다. 강제 업데이트를
일부러 켤 때는 이 마지막 항목이 실패하는 게 정상이다 — 그땐 검증 스크립트의 기준 버전을 함께 올린다.

### 예시 1 — 점검 예고 → 점검 → 종료

예고(점검 전날, 배너만):

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-01T18:00:00+09:00",
  "notice": {
    "level": "info",
    "title": "점검 예정 안내",
    "message": "10월 2일(목) 02:00~04:00 서버 점검이 있어요. 이 시간에는 기록 저장과 채팅이 잠시 멈춰요.",
    "endsAt": "2026-10-02T02:00:00+09:00"
  },
  "minAppVersion": { "android": null, "ios": null }
}
```

점검(시작 전에 미리 올려 두면 `startsAt` 에 저절로 켜지고 `endsAt` 에 저절로 꺼진다):

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-02T01:30:00+09:00",
  "notice": {
    "level": "maintenance",
    "message": "서버 점검 중이에요. 기록은 안전하게 보관되어 있어요. 04:00 이후 다시 이용해주세요.",
    "startsAt": "2026-10-02T02:00:00+09:00",
    "endsAt": "2026-10-02T04:00:00+09:00"
  },
  "minAppVersion": { "android": null, "ios": null }
}
```

> 예고와 점검은 `updatedAt` 이 다르므로, 예고를 닫은 사용자에게도 점검 공지는 다시 뜬다.
> 점검이 늘어나면 `endsAt` 을 늦추고 **`updatedAt` 도 바꾼다**(닫은 사람에게 다시 알리려면).

### 예시 2 — 예고 없는 장애

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-05T21:10:00+09:00",
  "notice": {
    "level": "warning",
    "title": "접속 장애 안내",
    "message": "지금 일부 기능이 동작하지 않아요. 원인을 확인하고 있고, 기록은 지워지지 않았어요.",
    "linkUrl": "https://dubly.co.kr/support"
  },
  "minAppVersion": { "android": null, "ios": null }
}
```

`endsAt` 없이 올리면 **내릴 때까지 계속 뜬다** — 복구 후 반드시 내린다. 서버가 완전히 죽어 API 가
전부 실패하는 상황이면 `level: maintenance` 로 올려야 오류 문구까지 "점검 중"으로 바뀐다.

### 예시 3 — 강제 업데이트

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-10T10:00:00+09:00",
  "notice": null,
  "minAppVersion": { "android": "1.0.5", "ios": "1.0.5" },
  "updateMessage": "통화 품질 문제를 고친 새 버전이 나왔어요. 스토어에서 업데이트해주세요."
}
```

> ⚠️ **올리기 전에 그 버전이 양쪽 스토어에 실제로 풀려 있는지 확인한다.** iOS 는 `eas submit` 이
> 업로드만 하고 심사·출시가 따로다. 스토어에 없는 버전을 요구하면
> 사용자는 업데이트할 수 없는 잠긴 앱을 보게 된다. 플랫폼별로 따로 올릴 수 있다(`"ios": null`).
> JS 로 고칠 수 있는 문제는 강제 업데이트가 아니라 **OTA** 로 푼다.

### 내리기

평시 파일로 되돌린다(파일을 지워도 404 → 공지 없음이지만, `_headers` 확인이 어려워지므로 평시 파일을 권장).

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-02T04:05:00+09:00",
  "notice": null,
  "minAppVersion": { "android": null, "ios": null },
  "updateMessage": null
}
```

## 4. 검증 결과 (2026-09-30)

- `npm run typecheck` 통과, `npm run build:web` 통과.
- `npm run lint` — 새 파일 오류 0. 전체 88 errors 는 main 과 같은 수(기존 부채).
- `npm run verify:service-status` 44/44 — 없음(빈 본문·404 HTML)·깨짐(잘린 JSON·배열·null)·빈 값
  (공백 message·level/updatedAt 누락)·기간 지남/시작 전/경계·오프셋 없는 날짜·새 스키마·링크 http·
  버전 형식 오류·웹(null) 판정 불가 케이스.
- **안 한 것**: 브라우저·실기기에서 배너 화면 확인. 배너는 로그인한 홈에만 있어 이번 세션에서 띄우지
  못했다. OTA 전에 dev build + Metro 에서 `SERVICE_STATUS_URL` 을 임시 파일로 돌려 한 번 볼 것
  (maintenance 배너 + 비행기 모드로 API 오류 문구, minAppVersion 9.9.9 로 잠금 화면).
- 네트워크 층(404·타임아웃·네트워크 실패 시 직전 상태 유지)은 코드 리뷰로만 확인.

## 5. 남은 것

- 첫 배포(평시 `status.json` + `_headers`)와 Netlify 배포 방식 확인 — §3.
- OTA 배포(`npm run update:production`) — 라이브 fingerprint 확인 후(`docs/RELEASE_OTA_MISDELIVERY_2026-09-11.md`).
- 공지 문구 템플릿을 장애 대응 런북에 연결.
