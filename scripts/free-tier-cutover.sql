-- Free 티어 전환 점검 — 운영 PostgreSQL 에 psql 로 실행한다.
--
-- ⚠️ 이 스크립트는 <b>DB 를 바꾸지 않는다.</b> 2026-09-17 에 "기존 사용자 영구 PRO 부여"를
--    없애기로 했기 때문이다(ehddus5712@gmail.com · tndls4520@naver.com 외에는 전부 테스트
--    계정이라 지켜줄 대상이 없다). 전환은 환경변수 하나다:
--
--        PLAN_FREE_TRIAL=false      # Railway 백엔드 Variables
--
--    그 순간부터 PlanResolver 가 구독과 <b>가입 후 N일 체험</b>(PLAN_TRIAL_DAYS, 기본 3)만
--    본다. 가입한 지 3일이 지난 계정은 즉시 FREE 가 된다 — 그게 의도한 결과다.
--
-- ⚠️ docs/FREE_TIER_AND_ADS.md 의 "전원 영구 PRO INSERT" 는 <b>더 이상 쓰지 않는다.</b>
--    되살려야 할 상황이 오면 아래 ④ 를 쓴다.
--
-- 아래 쿼리들은 전환 전후에 "누가 어떤 플랜이 되는지"를 눈으로 확인하기 위한 것이다.
-- 판정 조건은 SubscriptionRepository.findEffective 와 정확히 같다:
--   status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())

-- ════════════════════════════════════════════════════════════════════════════
-- ① 전환 전 — 지금 누가 있나
-- ════════════════════════════════════════════════════════════════════════════

\echo '== 전체 사용자 수'
SELECT count(*) AS total_users FROM users;

-- 계정이 얼마 없으므로 전부 찍어 눈으로 본다. 지울 테스트 계정을 여기서 고른다.
\echo '== 전체 계정 (상위 100)'
SELECT id, email, name, created_at FROM users ORDER BY id LIMIT 100;

-- 전환 직후 누가 체험으로 열려 있고 누가 바로 FREE 가 되는지.
-- interval 은 PLAN_TRIAL_DAYS 와 맞춘다(기본 3일).
\echo '== 전환 직후 예상 상태 (체험 3일 기준)'
SELECT u.id, u.email,
       u.created_at,
       u.created_at + interval '3 days'            AS trial_ends_at,
       (u.created_at + interval '3 days' > now())  AS still_in_trial
  FROM users u
 ORDER BY u.created_at DESC
 LIMIT 100;

\echo '== 유효한 구독이 있는 사용자 (있으면 전환 후에도 PRO 로 남는다)'
SELECT u.id, u.email, s.store, s.product_id, s.expires_at
  FROM users u
  JOIN subscriptions s ON s.user_id = u.id
 WHERE s.status = 'ACTIVE'
   AND (s.expires_at IS NULL OR s.expires_at > now());

-- ════════════════════════════════════════════════════════════════════════════
-- ② 전환 — DB 작업 없음
-- ════════════════════════════════════════════════════════════════════════════
-- Railway 백엔드 Variables 에서 PLAN_FREE_TRIAL=false 로 바꾸고 재배포한다.
-- 롤백도 같은 자리에서 true 로 되돌리면 끝이다 — 데이터가 안 바뀌므로 되돌림이 무손실이다.

-- ════════════════════════════════════════════════════════════════════════════
-- ③ 전환 후 검증
-- ════════════════════════════════════════════════════════════════════════════
-- 앱에서 확인하는 게 가장 확실하다:
--   - 가입한 지 3일 넘은 계정으로 로그인 -> MY > 플랜 이 "FREE" 로 보인다
--   - 새로 가입한 계정 -> "체험이 3일 남았어요" 가 보인다
--   - 잠긴 기능(영상통화 등)을 누르면 업그레이드 시트가 뜬다
--
-- 서버 쪽에서는 GET /api/v1/plan/me 의 plan / freeTrial / trialEndsAt 셋을 본다.

-- ════════════════════════════════════════════════════════════════════════════
-- ④ 되돌리기 — 특정 계정에만 수동으로 PRO 를 주어야 할 때 (CS 보상 등)
-- ════════════════════════════════════════════════════════════════════════════
-- 평상시에는 쓰지 않는다. product_id 를 'manual.grant' 로 고정해 이 경로로 들어온 행임을
-- 나중에 식별할 수 있게 한다. purchase_token 은 NOT NULL UNIQUE 라 id 로 유일하게 만든다.
--
-- BEGIN;
--   INSERT INTO subscriptions
--          (user_id, plan,  status,   store,    product_id,      purchase_token,
--           started_at, expires_at, auto_renew)
--   SELECT  u.id,    'PRO', 'ACTIVE', 'MANUAL', 'manual.grant',  'manual-grant-' || u.id,
--           now(),      NULL,       false
--     FROM users u
--    WHERE u.email IN ('바꿀것@example.com')
--      AND NOT EXISTS (
--          SELECT 1 FROM subscriptions s
--           WHERE s.user_id = u.id
--             AND s.status = 'ACTIVE'
--             AND (s.expires_at IS NULL OR s.expires_at > now()));
--   -- 기대한 행 수가 아니면 COMMIT 하지 말고 ROLLBACK 한다.
-- COMMIT;
--
-- 취소: DELETE FROM subscriptions WHERE product_id = 'manual.grant' AND user_id = <id>;

-- ════════════════════════════════════════════════════════════════════════════
-- 사이드 이펙트 — 전환 전에 읽을 것
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. 가입한 지 3일 넘은 계정은 전환 즉시 FREE 가 된다. 지금 남은 계정이 사실상 전부
--    테스트 계정이라 문제가 없지만, 실사용자가 생긴 뒤에 이 전환을 미루면 그때는
--    "기능을 뺏겼다"가 된다 — 사용자가 붙기 전에 끝내는 게 이 작업의 타이밍이다.
--
-- 2. 커플은 <b>나중에 가입한 사람</b>의 체험이 끝날 때까지 커플 기능이 함께 열려 있다
--    (PlanResolver.trialEndOf — 둘 중 높은 등급 규칙과 같은 방향). 한 명만 체험이
--    남아 있어도 공동 콘텐츠는 잠기지 않는다.
--
-- 3. 테스트 계정은 SQL 로 못 지운다. users 를 직접 지우면 FK 로 막힌다 — 삭제 순서는
--    UserDataPurger/RelationRecordPurger 가 들고 있고, 이미지는 커밋 이후 Cloudinary 에서
--    따로 지워야 한다. 앱의 회원 탈퇴 흐름이 유일하게 안전한 경로다.
--    남겨두면 event_logs 의 실사용 분포가 오염된다
--    (docs/PRO_UPSELL_AND_ADS_2026-09-17.md §3) — 한도를 확정하기 전에 정리한다.
--
-- 4. 결제 테스트를 먼저 끝내는 편이 낫다. 전환 후 PRO 가 된 계정은 플랜 화면 버튼이
--    "이미 PRO예요"로 잠긴다(PlanScreen.alreadySubscribed = isPro && !freeTrial).
