# 데이터 안전성 · 인프라(Railway→AWS) 분석 — 2026-09-30

## 배경
경쟁앱 비트윈이 2025-09-13 서버 점검 중 무료 이용자의 앨범·프로필 사진을 대량 삭제했다
(원인: AWS 스토리지에서 채팅/앨범 데이터 구분 코드값 오지정). "추억이 사라지지 않는 앱"을
차별점으로 삼을 수 있는지, 그리고 Railway → AWS 이전이 필요한지 코드 기준으로 확인했다.

## 결론
**AWS 전면 이전은 보류한다.** 사진은 이미 Railway 밖(Cloudinary)에 있고, 데이터 유실 위험의
핵심은 호스팅이 아니라 (1) 탈퇴 시 즉시 영구 삭제 경로, (2) 외부 백업 부재, (3) 이미지 즉시 destroy 다.

## 현황
| 항목 | 현재 | 근거 |
|---|---|---|
| 사진·음성 저장 | Cloudinary (앱 → Cloudinary 직접 업로드, 서버는 서명만 발급). Railway 볼륨 미사용 | `common/upload/UploadController`, `frontend/src/utils/imageUpload.ts` |
| 이미지 삭제 | 커밋 후 Cloudinary `image/destroy` 즉시 호출 — 되돌릴 수 없음. 실패는 로그만 | `CloudinaryImageDeleter` |
| 연결 끊기 | 기록 보존(숨김) + 복원 가능 | `RelationService.hasRestorableRecords` |
| 지난 기록 완전 삭제 | 활성 관계에는 불가, 행 잠금 후 삭제 | `RelationService.purgeRecords` |
| **회원 탈퇴** | **활성 커플 관계 포함, 공동 기록 전체 + 이미지 즉시 영구 삭제. 유예기간 없음, 상대 사전 알림 없음** | `AuthService.withdraw` → `UserDataPurger.purgeFor` (내 모든 relation 에 `RelationRecordPurger.purge`) |
| 삭제 쿼리 스코프 | 전부 `:rid`/`:uid` 바인딩. WHERE 누락형 대량 삭제는 Purger 두 파일에서 발견 못 함 | `RelationRecordPurger`, `UserDataPurger` |
| DB 백업 | 저장소에 백업 스크립트·복원 절차 없음. **Railway 자동 백업 없음(2026-09-30 콘솔 확인)** — 백업 생성·PITR 은 Pro 플랜 전용이고 "No backup schedule", 존재하는 건 플랫폼이 보안 패치 전에 만든 1회분(약 1달 전, 119MB)뿐 | `scripts/`, `docs/RAILWAY.md`, Railway 콘솔 |
| Railway 종속성 | 낮음 — `DATABASE_URL` 파싱 + Dockerfile. ECS/App Runner 로 그대로 이전 가능 | `DataSourceConfig`, 루트 `Dockerfile` |
| 스토리지 용량 | Cloudinary 무료 ≈25GB 가 실질적 확장 절벽 (README 사진 보관 정책) | `README.md` |

## 리스크 (우선순위)
1. **한 명의 탈퇴 = 상대의 추억 전체 증발.** 확인창은 2단계이고 문구로 고지하지만, 상대는 모른 채
   피드·여행·채팅·사진을 잃는다. 비트윈 사고와 결과가 같은 경로가 사용자 탭 한 번으로 열려 있다.
2. **DB 백업이 사실상 없음.** Railway 자동 백업이 꺼져 있고(Pro 전용), 남은 건 약 1달 전 1회분뿐이다. 설령 켜더라도 Railway 백업은 같은 project/environment 에서만 복원되고 볼륨 wipe 시
   백업도 함께 삭제된다(Railway Docs). 운영 실수·계정 사고에 같이 무너진다.
3. **이미지 즉시 destroy.** 코드 버그로 잘못된 URL 목록이 넘어가면 복구 수단이 없다
   (Cloudinary 계정 backup 설정 여부 **미확인**).
4. 용량 절벽(25GB) — 사용자 증가 시 Railway 비용보다 먼저 온다.

## 권장 조치
1. **탈퇴 유예기간** (예: 14~30일 soft withdraw) — 기간 내 로그인 시 복구. 상대에게 푸시로
   알리고, 공동 기록 내보내기(또는 상대 쪽 보존) 선택지를 준다. 공동 콘텐츠 보존 범위는
   개인정보 삭제 요구와 충돌할 수 있어 **법률 검토 필요**.
2. **DB 외부 백업**: `pg_dump` 를 스케줄(GitHub Actions cron 등)로 돌려 Railway 밖(S3/R2)에 저장,
   보존 30일+, 분기 1회 복원 리허설.
3. **지연 이미지 삭제**: `deleteAllAfterCommit` 이 즉시 destroy 대신 삭제 대기 테이블에 적재 →
   스위퍼가 N일(예: 30일) 후 destroy. 탈퇴 유예기간과 자연스럽게 맞물린다.
   (테이블 추가 시 4절 Purger 규칙 · Flyway 번호 규칙 준수)
4. **스토리지 이전 계획**: R2/S3(versioning + 삭제 보호)로 이전 시점을 용량 기준으로 정한다.
5. **AWS 이전 재검토 조건**: Railway 비용 > ECS/RDS 비용, 서울 리전 latency 문제 실측, "국내 저장" 마케팅 필요.

## 확인 결과 · 남은 확인 (콘솔)
- ~~Railway Postgres 볼륨 backup 스케줄 활성화 여부~~ → **없음** (2026-09-30). 이로써 권장 조치 2번이 3번보다 급해졌다.
- Cloudinary 계정 backup 설정 여부·플랜
- Cloudinary 콘솔 로그인은 구글 계정(비밀번호 미설정) → Cloudinary 자체 2FA 는 적용 대상 아님, **구글 2단계 인증 켜져 있음 확인(2026-09-30)**. 비밀번호는 일부러 만들지 않는다(로그인 경로를 늘리지 않기 위해). 콘솔 IP 제한은 유동 IP 라 쓰지 않는다.

## 추가 확인 — 이미지 접근 (2026-09-30)
- **운영자 열람**: 위탁 고지는 되어 있음(처리방침 5절 Cloudinary). 의무는 목적 외 열람 금지 + 콘솔 접근 최소화(2FA, 1인).
- **국외이전 고지 부족**: "일부 수탁사는 해외…" 한 줄뿐이고 Cloudinary 는 국가도 없음. 이전 국가·시기·방법·항목을 명시해야 함(법률 검토).
- **이미지 URL 이 공개**: 서명 업로드지만 delivery type 은 기본 `upload` (`CloudinarySigner` 는 folder·timestamp 만 서명) → URL 만 알면 비로그인 열람 가능. 대책은 `authenticated` 타입 + 서버가 권한 확인 후 만료형 서명 URL 발급 — 이미지 표시 경로 전반을 건드리므로 권장 조치 4번(R2/S3 이전)과 함께 설계.
- ~~콘솔 확인: unsigned preset `fitto_unsigned` 가 운영 계정에 남아 있지 않은지.~~ → **남아 있었음(Unsigned, 2026-07-03 생성) → 2026-09-30 삭제.** 앱은 서버 서명 업로드만 쓰므로 영향 없음 — 대체 경로(`uploadImage` 의 unsigned 폴백)는 서버가 UPLOAD_NOT_CONFIGURED 일 때만 탄다.
- 마케팅: "운영자도 못 본다"는 E2E 없이는 쓸 수 없다. "사라지지 않는 추억"(보존)은 가능.

## 우선순위 판단 (2026-09-30)
현재 실사용자 0명 → 급하지 않음. 위 조치는 **출시·사용자 유입 전 체크리스트**로 둔다.
사용자가 생기기 전에 최소한 ① 외부 DB 백업(2번) ② 탈퇴 유예(1번)는 들어가 있어야 한다 —
사용자가 생긴 뒤 추가하면 그 사이 사고는 복구할 수 없다.

## 구현 — 권장 조치 1번: 탈퇴 유예기간 (2026-09-30, V110)
- **요청** (`DELETE /auth/withdraw` → `AccountWithdrawalService.request`): `users.withdrawal_scheduled_at = now + 14일`
  만 기록. 리프레시 토큰 전부 폐기 + 푸시 토큰 삭제(떠난 사람에게 알림이 계속 가지 않게). 연결된(ACTIVE)
  관계의 상대 전원에게 PARTNER 푸시("○월 ○일에 함께한 기록이 삭제돼요"). 두 번 요청해도 예정일·알림은 그대로.
- **취소**: 유예기간 중 이메일/구글 로그인이 성공하면 자동 취소 → `TokenResponse.withdrawalCanceled=true`,
  앱이 "탈퇴 요청을 취소했어요" 안내, 상대에게 취소 푸시. 명시적 "복구" 버튼 대신 로그인 = 복구로 한 이유:
  리프레시 토큰이 이미 없으므로 돌아오는 길은 로그인뿐이고, 로그인 수단(이메일·구글)마다 분기를 만들 필요가 없다.
- **삭제**: `AccountWithdrawalSweeper` (매시 15분)가 예정 시각이 지난 계정을 계정별 트랜잭션으로
  기존 즉시 삭제 경로(`UserDataPurger` + 커밋 후 이미지 삭제) 그대로 지운다. 삭제 직전에 다시 읽어
  취소 여부를 확인하므로 로그인과의 경합·다중 인스턴스에서도 안전.
- **상대 화면**: `UserResponse.withdrawalScheduledDate`(KST) → 홈 상단 배너. 푸시를 꺼 둔 상대도 볼 수 있게.
- **고지**: 개인정보처리방침 1.4 (보유기간 문구 + 상대 고지), 약관 1.2 유지. 랜딩 privacy·support 동기화.
  ⚠️ 방침 버전이 올라가 기존 계정에는 재동의 게이트가 한 번 뜬다.
- 유예기간은 `fitto.withdrawal.grace-period`(기본 P14D).
- **남은 것**: 유예기간 중 상대의 "기록 내보내기"(지금은 직접 저장 안내뿐), 공동 기록 보존 범위의 법률 검토,
  유예 중 30분 이내 잔여 액세스 토큰(프론트는 즉시 폐기, 서버 필터는 확인 안 함).
- **Cloudinary 자동 백업 켬(2026-09-30)** — 무료 플랜에서도 가능, 저장 위치 Cloudinary, 기존 에셋도 일괄 백업. `CloudinaryImageDeleter` 의 즉시 destroy 를 되돌릴 수단이 생겨 권장 조치 3번(지연 삭제)의 급함이 줄었다. 백업은 사용량에 포함(용량 약 2배).
  ⚠️ 탈퇴·삭제된 사용자 사진도 백업에 남는다 → 처리방침 "유예기간 뒤 파기"와 어긋날 수 있음. 백업 보관 기간 또는 방침 문구를 **출시 전 법률 검토 때 함께** 정한다.

