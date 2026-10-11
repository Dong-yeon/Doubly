# 이모티콘 — 유료 에셋 구매 검토와 서버 카탈로그 이행 계획

2026-09-17. 두 가지 질문에서 나왔다. ① 이모티콘을 유료 에셋을 사서 만들면 어떤가
② 이모티콘을 추가할 때마다 앱을 새로 배포하는 구조가 비효율적이지 않은가.

커밋에는 `expo-image` 도입만 남는다. **왜 스톡을 사지 않기로 했는지와, 서버 카탈로그로
언제 옮겨야 하는지는 코드에 안 남으므로** 여기 적는다.

## 1. 결론

| 질문 | 결론 |
|---|---|
| 일반 스톡(Envato Elements · Adobe Stock · Freepik) 구매 | **하지 않는다.** 라이선스 위반 |
| 외주 구매 | 하려면 **저작재산권 전부 양도(buyout)** 계약으로만 |
| 서버 카탈로그 이행 | **지금은 아니다.** 강제 시점은 §4 |
| `expo-image` 선행 도입 | **지금 한다.** 네이티브 변경이라 빌드가 필요해서다 |

## 2. 스톡을 사면 안 되는 이유

`animatedStickers.ts` 30종 중 **24종이 `premium: true`** 다. 이모티콘은 이미 PRO 상품의
일부다. 그러면 산 에셋은 UI 장식이 아니라 **판매물 그 자체**가 되고, 스톡 라이선스가
정확히 이 지점을 막는다.

- **Envato Elements**: 다운로드한 아이템을 단독으로든 묶어서든, 수정을 해도, 무료든
  유료든 재배포 금지 — <https://help.elements.envato.com/hc/en-us/articles/360000621803>
- **Adobe Stock 표준**: 재판매·재배포 목적 제품에 사용 금지. 파생 상품 판매는 Extended
  License 별도 — <https://stock.adobe.com/license-terms>

이모티콘은 **수신자 폰으로 이미지가 건너간다.** 화면에 그려 보여주는 것과 달리 파일이
전달되므로 "재배포"로 읽힐 여지가 더 크다.

지금 쓰는 것들은 이 문제가 없다.

| 묶음 | 출처 | PRO | 근거 |
|---|---|---|---|
| 더비 · 블리 | 사용자 손그림 → 이미지 모델 | 무료 | 자체 IP |
| 움직이는 이모티콘 30종 | Noto Animated Emoji | 24종 | CC BY 4.0 — 상업 이용 허용, 표시 의무 이행(`openSourceLicenses.ts:50`) |
| 곰돌이 | "참조 그림에서 변주" (`stickerImages.ts:50`) | 무료 | ⚠️ **참조 원본 미확인 — 남은 리스크** |

외주로 산다면 계약서에 세 줄이 필요하다. ① 저작재산권 전부 양도(2차적저작물작성권 포함
— 빠지면 변형·애니메이션화 불가) ② 앱 내 유료 판매 및 사용자 간 전송 허용 명시
③ 작가가 동일·유사 캐릭터를 타 클라이언트에 재판매하지 않는 독점 조항.

그래도 **권하지 않는다.** 더비·블리는 손그림에서 나와 앱 아이콘까지 됐다. 커플 앱에서
"우리만의 캐릭터"는 기능이 아니라 정서고, 그게 PRO 전환의 동력이다. 산 캐릭터는 다른
앱에도 있다.

## 3. "추가할 때마다 재빌드" 는 사실이 아니다

이미지·화면 변경은 EAS Update 범위다(`CLAUDE.md` §6). 이모티콘 PNG 추가는 JS 번들과
에셋만 바뀌므로 `npm run update:production` 한 줄로 나간다 — 심사도, 재설치도 없다.
다만 **앱을 배포해야 이모티콘이 늘어난다**는 구조 자체는 그대로다.

### 카톡·비트윈 방식 (관찰되는 동작에서 역산)

| 구성 | 역할 | 관찰 근거 |
|---|---|---|
| 카탈로그 API | 팩·아이템·CDN URL·리비전을 서버가 내려준다 | 앱 업데이트 없이 신규 이모티콘이 뜬다 |
| CDN 에셋 | 이미지는 앱에 없다. 팩을 처음 열 때 받는다 | 첫 사용 시 로딩이 한 번 걸린다 |
| 온디바이스 캐시 | 받은 팩을 앱 샌드박스에 저장 | 재설치하면 "이모티콘 다시 받기"를 한다 |
| 서버 권한 | 보유·구독을 서버가 판정 | 구독 해지하면 보내기가 막힌다 |

핵심은 **메시지에 이미지가 아니라 ID만 실린다**는 것이다. 수신자가 자기 카탈로그로
ID를 그림으로 바꾼다. 팩이 늘어도 메시지 스키마가 안 바뀌고 클라이언트 버전이 달라도
깨지지 않는다.

### 우리는 절반이 이미 그렇다

`stickerImages.ts:4` — "content 에는 이 code 를 저장하고". **메시지 포맷은 이미 ID
기반**이다. 우리 이모지는 **이미 원격 URL 로 렌더**된다(`StickerPanel.tsx` 의
`{ type: 'uri' }` 경로). 어려운 절반은 끝나 있다.

컴파일타임에 묶인 것은 **에셋 해석 레이어 셋**뿐이다.

| 파일 | 묶인 이유 |
|---|---|
| `frontend/src/constants/stickerImages.ts` | `require()` 38개 — Metro 가 빌드 시점에 해석 |
| `backend/.../chat/domain/StickerImage.java` | Java enum — 코드 배포 필요 |
| `StickerImageSyncTest` | 위 둘을 정규식으로 대조 |

## 4. 이행 계획 (아직 착수하지 않음)

```
① Flyway: sticker_packs / sticker_items
   pack : code, label, thumb_url, premium, sort_order, revision
   item : pack_code, code, label, image_url, animation_url, premium
   ※ JSONB · ON CONFLICT 금지 (CLAUDE.md §4). 번호는 최신 origin/main 기준으로 센다

② GET /api/v1/stickers/catalog?revision=<n>
   revision 이 같으면 304 → 네트워크·파싱 0
   에셋 URL 은 Cloudinary 그대로 (fitto_unsigned 이미 사용 중 — 새 인프라 없음)

③ 클라이언트
   카탈로그를 AsyncStorage 에 저장, 앱 시작 시 revision 만 확인
   require() → CachedImage (expo-image, cachePolicy="memory-disk")
   더비·블리는 번들에 남긴다 → 오프라인·첫 실행에 채팅이 비지 않는다

④ ChatService.send
   AnimatedSticker.isPremiumContent (ChatService.java:306) → DB 조회 + 보유 판정
   없는 코드는 거절 (지금은 enum 이 그 역할을 겸한다)
```

구버전 클라이언트 호환은 안전하다 — 코드 기반이라 예전 앱이 보낸 `DUBI_HAPPY` 는 새
서버에서도 같은 코드로 조회된다.

### 강제되는 시점

1. **팩을 낱개로 팔기 시작할 때.** 사용자마다 보유 목록이 달라지면 서버 카탈로그가
   필수다. 지금은 PRO/FREE 두 갈래라 `premium` 플래그로 충분하다.
2. **앱 용량이 문제될 때.** 현재 스티커 에셋은 약 2MB(Lottie 1.7MB + 썸네일 176KB).
   수백 종이 되면 번들이 감당 못 한다.

그 전까지 이행 비용(Flyway + API + 캐시 계층 + 권한 판정 재작성 + 테스트 폐기·신설)이
현재 비용(`update:production` 한 번)을 넘는다. 결제가 실기기에서 아직 한 번도 돌지
않았다 — 그게 먼저다.

## 5. 지금 넣은 것 — `expo-image`

네이티브 모듈이라 **빌드가 필요하다.** 어차피 다음 빌드가 예정돼 있으니 지금 끼워 넣어
나중에 빌드 한 번을 아낀다. 이게 §4 ③의 선행 조건이다.

`frontend/src/components/CachedImage.tsx` — `cachePolicy="memory-disk"` 를 기본값으로
가진 얇은 래퍼. RN 의 `Image` 에는 영구 디스크 캐시가 없다(iOS `NSURLCache` 는 응답
헤더에 좌우되고 용량 압박에 먼저 버려지며, 안드로이드 Fresco 는 기본 디스크 캐시라
보장이 없다). 이모티콘처럼 계속 다시 그려지는 그림에는 그 층이 필요하다.

적용 범위는 **원격 이모티콘 세 자리**뿐이다 — `StickerPanel` 스트립 썸네일 · 격자 칸,
`ChatRoomScreen` 우리 이모지 말풍선. 아바타·채팅 사진은 그대로 RN `Image` 다. 한 번 보고
지나가는 그림이라 영구 캐시 이득이 작고, 바꾸면 변경 범위만 넓어진다.

`expo-image` 의 config plugin(`disableLibdav1d`)은 **넣지 않았다.** iOS AVIF 디코더를
빼면 바이너리가 줄지만, Cloudinary 가 `f_auto` 로 AVIF 를 내려주면 그림이 깨진다.

## 6. 미완 항목

| 항목 | 상태 |
|---|---|
| `CachedImage` 실기기 렌더 확인 | **미검증** — 다음 빌드 후 우리 이모지 표시·캐시 확인 |
| 곰돌이 세트 "참조 그림" 출처 확인 | 미착수. 스톡 구매보다 먼저 정리할 리스크 |
| 서버 카탈로그 이행 (§4) | 미착수. §4 의 강제 시점까지 보류 |
| 안드로이드·iOS 결제 실기기 테스트 | 미착수 — 이모티콘보다 우선 |
