-- Free 티어 전환 — 운영 PostgreSQL 에 psql 로 직접 실행한다.
-- 실행 시점: PLAN_FREE_TRIAL=false 배포와 **같은 시점**.
--
-- ⚠️ Flyway 마이그레이션으로 만들지 않는다. 마이그레이션은 다음 배포 때(무관한 수정이라도)
--    자동 실행되므로, "지금 존재하는 사용자"가 의도한 전환 시점이 아니라 엉뚱한 배포 시점의
--    스냅샷이 돼 버린다. docs/FREE_TIER_AND_ADS.md 의 경고와 같은 이유다.
--
-- ⚠️ 원본 문서(FREE_TIER_AND_ADS.md)는 "가입자 전원에게 영구 PRO"를 전제로 쓰였다.
--    2026-09-17 에 바뀌었다 — 아래 두 계정 외에는 전부 테스트 계정이라 부여 대상이 2행뿐이다.
--    docs/PRO_UPSELL_AND_ADS_2026-09-17.md 참고.
--
-- 판정 조건은 SubscriptionRepository.findEffective 와 정확히 같다:
--   status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())
-- 그래서 코드 배포 없이 이 INSERT 만으로 PRO 가 열린다.

\set founder_a '\'ehddus5712@gmail.com\''
\set founder_b '\'tndls1520@naver.com\''

-- ════════════════════════════════════════════════════════════════════════════
-- ① 실행 전 확인 — 숫자를 눈으로 보고 나서 ② 로 넘어간다
-- ════════════════════════════════════════════════════════════════════════════

\echo '== 전체 사용자 수'
SELECT count(*) AS total_users FROM users;

\echo '== 남길 계정 (정확히 2행이어야 한다. 아니면 여기서 멈춘다)'
SELECT id, email, name, created_at
  FROM users
 WHERE email IN (:founder_a, :founder_b)
 ORDER BY id;

\echo '== 나머지 = 테스트 계정 (이 스크립트는 지우지 않는다 - 아래 사이드 이펙트 3 참고)'
SELECT count(*) AS test_accounts
  FROM users
 WHERE email NOT IN (:founder_a, :founder_b);

\echo '== 이미 유효한 구독이 있는 사용자 (있으면 아래 INSERT 가 건너뛴다)'
SELECT u.id, u.email, s.store, s.product_id, s.expires_at
  FROM users u
  JOIN subscriptions s ON s.user_id = u.id
 WHERE s.status = 'ACTIVE'
   AND (s.expires_at IS NULL OR s.expires_at > now());

-- ════════════════════════════════════════════════════════════════════════════
-- ② 부여 — 두 계정에만 만료 없는 PRO
-- ════════════════════════════════════════════════════════════════════════════
-- product_id 를 'manual.founder' 로 고정해 이 배치가 넣은 행임을 나중에 식별한다
-- (④ 롤백이 이 값에만 의존한다). purchase_token 은 NOT NULL UNIQUE 라 id 로 유일하게 만든다.

BEGIN;

INSERT INTO subscriptions
       (user_id, plan,  status,   store,    product_id,       purchase_token,
        started_at, expires_at, auto_renew)
SELECT  u.id,    'PRO', 'ACTIVE', 'MANUAL', 'manual.founder', 'manual-founder-' || u.id,
        now(),      NULL,       false
  FROM users u
 WHERE u.email IN (:founder_a, :founder_b)
   -- 이미 유효한 구독이 있으면 건드리지 않는다(실제 결제를 수동 부여로 덮지 않기 위해)
   AND NOT EXISTS (
       SELECT 1 FROM subscriptions s
        WHERE s.user_id = u.id
          AND s.status = 'ACTIVE'
          AND (s.expires_at IS NULL OR s.expires_at > now()));

-- 여기서 INSERT 0 2 가 아니면 COMMIT 하지 말고 ROLLBACK 한다.
-- 0 이면 ① 의 "이미 유효한 구독" 목록을 다시 본다. 3 이상이면 이메일이 중복된 것이다.

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ③ 검증 — 2행, 둘 다 expires_at 이 비어 있어야 한다
-- ════════════════════════════════════════════════════════════════════════════

\echo '== 부여 결과'
SELECT u.email, s.plan, s.status, s.store, s.product_id, s.expires_at, s.auto_renew
  FROM subscriptions s
  JOIN users u ON u.id = s.user_id
 WHERE s.product_id = 'manual.founder'
 ORDER BY u.id;

-- ════════════════════════════════════════════════════════════════════════════
-- ④ 롤백 — 이 배치가 넣은 행만 지운다
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   SELECT count(*) FROM subscriptions WHERE product_id = 'manual.founder';  -- 2 여야 한다
--   DELETE FROM subscriptions WHERE product_id = 'manual.founder';
-- COMMIT;
--
-- 구독 행만 지우면 원래 상태로 돌아간다 — 다른 테이블을 건드리지 않는다.

-- ════════════════════════════════════════════════════════════════════════════
-- 사이드 이펙트 — 실행 전에 읽을 것
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. 부여받은 계정으로는 결제 흐름을 테스트할 수 없다. 플랜 화면의 버튼이 "이미 PRO예요"로
--    잠긴다(PlanScreen.alreadySubscribed = isPro && !freeTrial).
--    -> 라이선스 테스터로 실제 결제 경로를 확인하려면 이 스크립트보다 먼저 하거나,
--       전용 테스트 계정으로 한다. 이미 돌렸다면 ④ 로 잠시 되돌리면 된다.
--
-- 2. 커플로 연결돼 있으면 한 명만 부여해도 둘 다 PRO 가 된다(PlanResolver 가 관계 단위로
--    가장 높은 등급을 쓴다). 두 계정이 서로 커플이라면 사실상 1건으로 충분하지만,
--    연결이 끊길 경우를 대비해 둘 다 넣는다.
--
-- 3. 테스트 계정은 이 스크립트가 지우지 않는다. users 를 SQL 로 직접 지우면 FK 로 막힌다 —
--    삭제 순서는 UserDataPurger/RelationRecordPurger 가 들고 있고, 이미지는 커밋 이후
--    Cloudinary 에서 따로 지워야 한다. 앱의 회원 탈퇴 흐름이 유일하게 안전한 경로다.
--    다만 남겨두면 event_logs 의 실사용 분포가 오염된다
--    (docs/PRO_UPSELL_AND_ADS_2026-09-17.md §3) — 한도를 확정하기 전에 정리한다.
--
-- 4. 이 스크립트는 멱등하지 않다. 두 번 돌리면 ② 의 NOT EXISTS 가 막아 0행이 들어간다
--    (에러가 아니라 조용히 아무 일도 안 일어난다). 의도한 동작이다.
