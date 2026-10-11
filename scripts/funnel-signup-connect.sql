-- 가입 → 커플 연결 퍼널 — 운영 PostgreSQL 에 psql 로 실행한다 (읽기만 한다).
--
-- 왜: 결제 퍼널(docs/BILLING_STATUS_2026-09-25.md §7)의 앞단이다. 커플 앱은 "연결 전 이탈"이 가장 큰
-- 구멍인데, 이벤트(SIGNUP·COUPLE_CONNECTED)는 V57 부터 쌓이면서 아무도 세지 않았다. 기준일은
-- 전부 KST 로 옮긴다 — created_at 은 UTC 이고 이 앱의 하루는 KST 다(CLAUDE.md 4절).
--
-- 판정 근거:
--   SIGNUP            : AuthService.register / 구글 첫 로그인 (detail = EMAIL | GOOGLE)
--   COUPLE_CONNECTED  : RelationService.connectCouple (relation_id 있음)
--   relations         : status PENDING = 코드만 만들고 상대가 안 들어옴 / ACTIVE = 연결됨 / ENDED

-- ① 가입 코호트별 연결 전환 — 최근 8주, 주 단위. 가입 당일·3일·7일 안에 연결된 비율
WITH signup AS (
    SELECT user_id,
           min(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') AS signed_at,
           min(detail) AS via
      FROM event_logs
     WHERE event_type = 'SIGNUP'
       AND created_at >= now() - interval '8 weeks'
     GROUP BY user_id
), connected AS (
    SELECT user_id,
           min(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul') AS connected_at
      FROM event_logs
     WHERE event_type = 'COUPLE_CONNECTED'
     GROUP BY user_id
)
SELECT date_trunc('week', s.signed_at)::date                                     AS week,
       count(*)                                                                  AS signups,
       count(c.user_id)                                                          AS connected,
       round(100.0 * count(c.user_id) / nullif(count(*), 0), 1)                  AS pct,
       count(*) FILTER (WHERE c.connected_at <  s.signed_at + interval '1 day')  AS within_1d,
       count(*) FILTER (WHERE c.connected_at <  s.signed_at + interval '3 days') AS within_3d,
       count(*) FILTER (WHERE c.connected_at <  s.signed_at + interval '7 days') AS within_7d
  FROM signup s
  LEFT JOIN connected c ON c.user_id = s.user_id
 GROUP BY 1 ORDER BY 1;

-- ② 연결까지 걸린 시간 분포 — 중앙값·p75. "초대코드 24시간" 이 맞는 길이인지 여기서 본다
WITH t AS (
    SELECT s.user_id,
           extract(epoch FROM (min(c.created_at) - min(s.created_at))) / 3600 AS hours
      FROM event_logs s
      JOIN event_logs c ON c.user_id = s.user_id AND c.event_type = 'COUPLE_CONNECTED'
     WHERE s.event_type = 'SIGNUP'
     GROUP BY s.user_id
)
SELECT count(*)                                                    AS connected_users,
       round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY hours)::numeric, 1) AS median_h,
       round(percentile_cont(0.75) WITHIN GROUP (ORDER BY hours)::numeric, 1) AS p75_h,
       count(*) FILTER (WHERE hours > 24)                          AS over_24h
  FROM t;

-- ③ 가입은 했는데 연결을 못 한 사람 — 어디까지 갔나
--    (a) 코드를 만든 적도 없음  (b) 코드만 만들고 만료  (c) 지금 코드가 살아 있음
WITH signup AS (
    SELECT DISTINCT user_id FROM event_logs WHERE event_type = 'SIGNUP'
), never AS (
    SELECT s.user_id FROM signup s
     WHERE NOT EXISTS (SELECT 1 FROM event_logs c WHERE c.user_id = s.user_id AND c.event_type = 'COUPLE_CONNECTED')
)
SELECT
    count(*)                                                                         AS not_connected,
    count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM relations r WHERE r.user_a_id = n.user_id AND r.relation_type = 'COUPLE')) AS no_code_ever,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM relations r WHERE r.user_a_id = n.user_id AND r.relation_type = 'COUPLE'
                                      AND r.status = 'PENDING' AND r.code_expires_at <  now()))   AS code_expired,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM relations r WHERE r.user_a_id = n.user_id AND r.relation_type = 'COUPLE'
                                      AND r.status = 'PENDING' AND r.code_expires_at >= now()))   AS code_alive
  FROM never n;

-- ④ 가입 경로별(EMAIL / GOOGLE) 연결 전환 — 구글 로그인을 켤지 판단할 때
SELECT s.detail AS via,
       count(DISTINCT s.user_id) AS signups,
       count(DISTINCT c.user_id) AS connected,
       round(100.0 * count(DISTINCT c.user_id) / nullif(count(DISTINCT s.user_id), 0), 1) AS pct
  FROM event_logs s
  LEFT JOIN event_logs c ON c.user_id = s.user_id AND c.event_type = 'COUPLE_CONNECTED'
 WHERE s.event_type = 'SIGNUP'
 GROUP BY 1 ORDER BY 2 DESC;

-- ⑤ 연결 못 한 사람이 그래도 뭘 했나 — 혼자 시작 행(운동·식단·장소)이 쓰이는지
SELECT e.event_type, e.detail, count(DISTINCT e.user_id) AS users
  FROM event_logs e
 WHERE e.event_type IN ('FEATURE_USED', 'HOME_VIEWED')
   AND NOT EXISTS (SELECT 1 FROM event_logs c WHERE c.user_id = e.user_id AND c.event_type = 'COUPLE_CONNECTED')
 GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20;

-- ⑥ 재회·이별 — ENDED 관계 수와 다시 연결된 비율 (커플 앱 특유의 이탈)
SELECT count(*) FILTER (WHERE status = 'ENDED')  AS ended,
       count(*) FILTER (WHERE status = 'ACTIVE') AS active,
       count(*) FILTER (WHERE status = 'PENDING' AND code_expires_at >= now()) AS pending_alive
  FROM relations WHERE relation_type = 'COUPLE';
