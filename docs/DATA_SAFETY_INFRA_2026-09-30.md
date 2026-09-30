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
