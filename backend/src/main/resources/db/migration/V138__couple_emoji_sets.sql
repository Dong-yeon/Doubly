-- 우리 이모지 세트 — "누가 무엇으로 만들었나, 다시 그리기가 몇 번 남았나" (2026-10-13)
--
-- 왜: 상품이 "1회 = 12장 + 다시 그리기 3번"이 됐다(docs/EMOJI_12_REGEN_2026-10-13.md). 다시 그리기는
-- 그 세트 안에서만 쓰는 잔량이라 사람(feature_credits)이 아니라 세트에 붙어야 한다. 지금까지 세트는
-- couple_emojis.batch_id 문자열뿐이라 세트 단위 값을 둘 곳이 없었다.
--
-- regen_used 는 조건부 UPDATE(… WHERE regen_used < regen_total) 한 줄로 올린다 — 읽고 더해서 쓰면
-- 동시 요청에 한 번이 두 번 쓰인다(feature_credits 에서 실제로 난 lost update, 같은 문서 §1-3).
--
-- 기존 세트는 LEGACY · 다시 그리기 0번으로 채운다 — 예전 규칙(한 번에 6장)으로 만든 세트에 새 권리를
-- 소급하지 않는다. GROUP BY 만 쓰므로 H2·PostgreSQL 공통이다.
--
-- couple_emojis.replaces_id: 다시 그린 장이 어느 장을 대신했나. 옛 장은 지우지 않고 숨긴다 — 이미 보낸
-- 채팅 메시지가 옛 URL 을 복사해 들고 있어서(ChatService) 옛 그림은 대화에 그대로 남아야 한다.
-- FK 를 걸지 않는다: 관계 삭제가 couple_emojis 를 한 번에 지우는데, 자기 참조 FK 는 삭제 순서를 만든다.
--
-- 삭제 경로: RelationRecordPurger 가 couple_emojis 와 함께 지운다(탈퇴도 그 경로를 지난다).
-- 롤백:
--   drop table couple_emoji_sets;
--   alter table couple_emojis drop column replaces_id;
-- (H2 호환 구문만 사용 — 테스트가 동일 마이그레이션을 적용한다)

CREATE TABLE couple_emoji_sets (
    batch_id       VARCHAR(36)  PRIMARY KEY,                       -- couple_emojis.batch_id 와 같은 값
    relation_id    BIGINT       NOT NULL REFERENCES relations (id),
    created_by     BIGINT       NOT NULL REFERENCES users (id),
    charge_source  VARCHAR(20)  NOT NULL,                          -- QUOTA | CREDIT | NONE | LEGACY
    regen_total    INT          NOT NULL DEFAULT 0,
    regen_used     INT          NOT NULL DEFAULT 0,
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_couple_emoji_sets_relation ON couple_emoji_sets (relation_id);

ALTER TABLE couple_emojis ADD COLUMN replaces_id BIGINT;

INSERT INTO couple_emoji_sets (batch_id, relation_id, created_by, charge_source, regen_total, regen_used, created_at)
SELECT batch_id, MIN(relation_id), MIN(created_by), 'LEGACY', 0, 0, MIN(created_at)
  FROM couple_emojis
 GROUP BY batch_id;
