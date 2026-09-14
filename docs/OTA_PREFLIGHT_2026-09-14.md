# OTA 사전 점검 — 지금은 업데이트가 아니라 빌드다 (2026-09-14)

> **한 줄**: 온보딩 갱신을 EAS Update 로 내보내려다 **중단**했다. 스토어 라이브 빌드와 현재 `main` 의
> fingerprint 가 달라, 올렸어도 **아무에게도 전달되지 않았을** 상태였다(9/11 사고와 같은 모양).
> 사용자 판단으로 **빌드는 보류** — 실기기 검증 뒤에 빌드+제출로 한 번에 내보낸다.

`docs/RELEASE_OTA_MISDELIVERY_2026-09-11.md` 가 정한 사전 점검이 **실제로 사고를 한 번 막았다.**
그 절차가 값을 한다는 기록과, 다음 배포 때 되풀이하지 않을 사실들을 남긴다.

## 1. 측정값

| | iOS | Android |
| --- | --- | --- |
| 스토어 라이브 빌드 | 빌드 24 (`11bdfab`, finished, 1.0.2) | vc32 (`11bdfab`, finished, 1.0.2) |
| 그 빌드의 fingerprint | `714bbf46…` | `f46afc02…` |
| 2026-09-14 `main` 의 fingerprint | `07d3cadf…` | `5d41739f…` |
| 일치 | ❌ | ❌ |

App Store 라이브는 1.0.2(2026-09-11 릴리스). fingerprint 자체는 **안정적**이었다 — iOS 를 두 번
돌려 같은 값이 나왔으므로 §8-5 의 "계산이 흔들리는" 문제는 아니다. 런타임이 진짜로 달라졌다.

## 2. 왜 달라졌나 — "네이티브 무변경" 판정이 틀렸던 이유

처음에 `package.json`·`app.json`·`modules/` 만 보고 "네이티브 무변경 → 업데이트로 충분"이라고
판단했다. **fingerprint 입력은 그보다 넓다.** `11bdfab..main` 에서 실제로 바뀐 fingerprint 입력:

| 파일 | 바꾼 커밋 | fingerprint 에 들어가는 이유 |
| --- | --- | --- |
| `frontend/assets/icon.png` | `e49a6b9` 비개구리 눈에 눈두덩이 | `expoConfigExternalFile` — app.json 이 가리키는 외부 파일 |
| `frontend/assets/fonts/MaterialCommunityIcons.ttf` | 아이콘 서브셋 재생성(게임·PC 작업이 글리프 추가) | 위와 같음 |
| `frontend/package.json` | `verify:chat-theme` 스크립트 추가 | 기본 sourceSkip 이 스크립트를 대부분 거르므로 영향은 작다 |

**앱 아이콘·스플래시·app.json 이 가리키는 폰트는 "이미지 변경"이 아니라 런타임을 바꾸는 변경이다.**
9/11 문서도 같은 말을 한다 — *"그 사이 변경에 네이티브(아이콘 등)가 섞여 있다"*.

> CLAUDE.md 6절의 "화면·로직·문구·**이미지** 변경은 업데이트로 충분합니다" 는 화면 안에서 쓰는
> 이미지에 한한 이야기다. `app.json` 이 가리키는 에셋(icon·splash·폰트)은 여기서 빠진다.

## 3. 다음 배포 때 할 것

아이콘이 바뀐 이상 OTA 로는 메울 수 없다. **빌드 + 제출**이 유일한 경로이고, 그 빌드가 출시된
다음부터 그 fingerprint 기준으로 OTA 가 다시 산다.

1. 실기기 검증 — 9/11 이후 쌓인 것 중 검증이 전무한 것들: 캐치마인드 캔버스(제스처), 럽슐랭 1~5번,
   PC 앱화 셸/레일, 게임 무르기·복기
2. `npm install` 로 lock 과 맞춘 뒤 fingerprint 두 번 돌려 같은 값 확인 (§8-5)
3. `npm run build:android` / `build:ios` → 제출 → **`finished` 확인**
4. 출시 확인 후, 그때부터의 JS 변경은 OTA 로 나간다

## 4. 곁가지 — 백엔드가 앱보다 앞서 있다

`main` 푸시로 Railway 가 배포돼, 지금은 **백엔드가 스토어 앱 바이너리보다 앞선 상태**다.
오늘 들어간 백엔드 변경(식품 DB 공급자 교체, 채팅 `clientMessageId` 중복 방지, V90~V93)이
**스토어의 구버전 앱과 호환되는지** 확인이 필요하다 — 구 앱이 보내지 않는 필드를 백엔드가
요구하면 그 자리에서 깨진다. 빌드를 미루기로 한 이상 이 점검은 미룰 수 없다.

## 5. 참고

- 절차 원본: `docs/RELEASE_OTA_MISDELIVERY_2026-09-11.md` §3
- fingerprint 안정화 경위: `docs/EAS_BUILD.md` §8-5
- 빌드 vs 업데이트 판단: `docs/EAS_BUILD.md` §8-1
