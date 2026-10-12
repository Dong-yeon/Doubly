# 사진 저장소 Cloudinary → Cloudflare R2 전환 계획 (2026-10-12)

배경: docs/photo-storage-cost_2026-10-12.md — 무료 한도는 월 25크레딧이고 주범은 "보기 전송량". R2 는 전송 무료, 저장 10GB 무료.

## Cloudinary 에 묶여 있는 곳 (코드 조사)

백엔드 37개·앱 20개 파일이 Cloudinary 를 안다. 실제로 갈아끼울 지점은 이렇게 모인다:

| 지점 | 지금 | R2 에서 |
|---|---|---|
| 업로드 서명 `UploadController`·`CloudinarySigner` | SHA-1 서명 → 앱이 Cloudinary 로 직접 POST | 서버가 **presigned PUT** 발급 → 앱이 R2 로 직접 PUT(서버를 지나지 않는 구조 유지) |
| 앱 업로드 `utils/imageUpload.ts`·`voiceUpload.ts`·`chatVoiceUpload.ts` | multipart POST, 음성은 `/video/upload` | presigned URL 로 PUT |
| "우리 파일인가" 판정 `CloudinaryUrls` | `res.cloudinary.com/{cloud}/{image|video}/upload/...` 정규식 | R2 공개 주소 형태 추가 — **전환 기간엔 둘 다 인정** |
| 삭제 `CloudinaryImageDeleter`·고아 정리·`UploadDiscardPolicy`·`StoredMediaReferences` | public_id 로 destroy | 객체 키로 DeleteObject |
| 서버가 읽기 `CloudinaryImageFetcher`(AI 분석) | `w_1024` 변환 붙여 받기 | 앱이 이미 1024px 로 줄여 올리므로 원본 그대로 |
| 서버가 올리기 `CloudinaryImageUploader`(우리 이모지 생성·컷아웃) | 서버 → Cloudinary | 서버 → R2 PutObject |
| 썸네일 `utils/imageUrl.ts` | URL 에 변환 끼움 | R2 는 변환 없음 → 원본(이미 작다). Cloudinary 주소는 계속 변환 |
| 개인정보처리방침 `constants/legal.ts`·`landing/privacy.html` | "Cloudinary : 이미지 저장" | **Cloudflare(미국) 추가** + 버전 올림(PolicyVersionSyncTest) — 문구는 사용자 확인 |

## 전환 원칙

- **서버가 정한다** — 서명 응답에 `provider`(cloudinary|r2)를 실어, 업데이트를 안 받은 앱은 계속 Cloudinary 로, 새 앱은 R2 로. 되돌리기도 서버 설정 한 줄.
- **옛 주소는 그대로 동작** — DB 의 Cloudinary 절대 주소는 바꾸지 않아도 계속 보인다. 판정·삭제는 두 저장소를 다 안다.
- 앱 변경은 JS 뿐(fetch PUT) → OTA. 새 네이티브 모듈 없음.

## 순서

0. **(사용자) 계정 준비** — 아래 "필요한 것".
1. **보험 먼저**: Cloudinary 원본 전부를 R2 로 복사하는 일회성 스크립트(Admin API 목록 → 다운로드 → PutObject). 약 1GB, 무료 범위. 앱·서버 변경과 무관하게 바로 할 수 있다.
2. **서버**: 저장소 추상화(`MediaStorage` — 업로드 발급·우리 파일 판정·삭제·읽기) + R2 구현 + 판정/삭제가 두 저장소를 모두 인정. 테스트.
3. **앱**: presigned PUT 경로. 서버가 r2 를 내려줄 때만 탄다.
4. **방침 갱신** 후 서버 설정으로 새 업로드를 R2 로 전환 → 며칠 지켜본다(업로드 실패율·서버 로그).
5. (급하지 않음) 옛 사진 주소를 R2 로 옮겨 쓰고 Cloudinary 정리.

## 필요한 것 (사용자 — 계정·결제수단·DNS 는 대신할 수 없다)

1. Cloudflare 가입 → R2 활성화(무료 범위라도 결제수단 등록을 요구한다).
2. 버킷 하나(예: `dubly-media`), 위치 자동.
3. R2 API 토큰(그 버킷 Object Read & Write) → Access Key ID / Secret.
   **채팅에 붙이지 말고 Railway `Doubly-Back` 변수로 넣기**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
4. 공개 주소 방식 — 결정 필요(아래).

## 결정: 사진을 어느 주소로 보여 줄까

| | A. `media.dubly.co.kr` (권장) | B. `*.workers.dev` |
|---|---|---|
| 방법 | dubly.co.kr 네임서버를 가비아 → Cloudflare(무료)로 옮기고 R2 커스텀 도메인 연결 | Cloudflare Worker 하나가 R2 를 읽어 내보냄 |
| 일 | 가비아에 있는 레코드(Netlify A/CNAME, Resend 메일 MX·SPF·DKIM·DMARC)를 Cloudflare 에 그대로 옮겨야 함 — 빠지면 사이트·메일이 끊긴다. 제가 레코드 목록을 만들고 옮긴 뒤 확인 | DNS 그대로 |
| 장점 | 주소가 우리 것 → 나중에 저장소를 또 바꿔도 DB 주소 유지. CDN 캐시 | 오늘 바로 가능 |
| 단점 | 네임서버 변경(전파 수 시간)·한 번의 신중한 작업 | 주소가 Cloudflare 하위 도메인에 묶임(나중에 도메인 바꾸면 DB 주소를 다시 써야), Workers 무료는 하루 10만 요청 |
| 비용 | 0원 | 0원 |

---

## 진행 (2026-10-12)

### 인프라 — 완료
- R2 버킷 `dubly-media`(Standard, 자동 위치), API 토큰(그 버킷 Object Read & Write) → Railway `R2_ACCOUNT_ID`·`R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_BUCKET`.
  키 끝에 줄바꿈이 붙어 들어갔다(길이 33/65) — 서버가 trim 한다.
- **결정: 공개 주소 A안 `media.dubly.co.kr`.** dubly.co.kr 네임서버를 가비아 → Cloudflare(`archer`/`nancy`)로 옮겼다.
  가비아 레코드 6개(@ A Netlify, www CNAME Netlify, send MX·TXT, resend._domainkey TXT, _dmarc TXT)를 그대로 옮기고 @·www 는 **DNS only**(Netlify 인증서).
  전환 뒤 사이트·/privacy·/invite·assetlinks.json·status.json 200, 메일 레코드 동일 확인. AI 학습 크롤러 Block.
- R2 커스텀 도메인 연결 → Universal SSL 발급(약 15분) 뒤 `https://media.dubly.co.kr/…` 200 확인.
- **결정: Cloudinary 옛 사진은 옮기지 않는다**(사용자). 새 업로드만 R2 로 가면 Cloudinary 는 저장 ~1GB + 옛 사진 보기만 남는다.

### 코드 — 1단계(일반 사진·식단 사진)
- 서버 `common/upload`: `R2Properties`(fitto.r2.*, 스위치 `R2_UPLOADS_ENABLED` 기본 false), `R2Signer`(SigV4 쿼리 서명 직접 구현 — SDK 는 256MB 힙에 무겁다, AWS 문서 예제로 테스트 고정),
  `R2Storage`(서명된 PUT 발급 10분·이미지 5종만·content-type 서명 / 서명된 DELETE), `R2Urls`(키 `{폴더}/{업로드초}-{무작위24hex}.{ext}` 판정).
- `/uploads/signature`·`/uploads/meal-signature`: 앱이 `accept=r2` 를 보내고 스위치가 켜졌을 때만 R2(옛 앱·웹은 Cloudinary). 응답에 `provider/uploadUrl/publicUrl/contentType` 추가(옛 필드 유지).
- R2 주소도 우리 파일로: 버리기(`UploadDiscardPolicy` — 이름의 업로드 시각으로 24시간), 삭제기, AI 다운로드(`CloudinaryImageFetcher` 호스트 허용, 변환 없음), 피드 저장 검증, 탈퇴 시 프로필 사진.
- 앱 `utils/imageUpload.ts`: 네이티브만 `accept=r2`, r2 응답이면 파일 바이트를 PUT 하고 publicUrl 저장. 썸네일 변환은 Cloudinary 주소에만 걸리므로 R2 는 원본(1024px).
- 검증: `R2StorageTest`(AWS 예제 서명·주소 판정·버리기), `R2LiveTest`(R2_LIVE=1 일 때 실제 PUT→공개 GET→DELETE; HTML 로 바꿔 PUT 하면 403) 통과.
- **아직 Cloudinary 에 남는 경로(2단계)**: 채팅·응원 음성, 우리 이모지 원본/생성물, 캐치마인드 그림, 하루 기록 사진(전용 폴더·서명), 메뉴판(앱에서 뺌).

### 켜는 순서 (남음)
1. 개인정보처리방침에 Cloudflare 추가 + 버전 1.4→1.5 — 서버 `PolicyVersion`·앱 `legal.ts`·`landing/privacy.html` 을 **함께**(버전을 올리면 다음 실행에 재동의 화면).
2. 앱 OTA(accept=r2 를 보내는 번들).
3. Railway `R2_UPLOADS_ENABLED=true` → 새 사진이 R2 로. 되돌리기는 false.
4. 며칠 뒤 확인: R2 객체 수·Cloudinary 크레딧 추이, 업로드 실패 로그.
