-- 움직이는 이모티콘 8팩 → 4팩 (2026-09-22)
--
-- <b>왜 합치나</b>: 110종을 8칸으로 쪼개니 한 팩이 7~18장이었다. 그러면 고르는 것보다
-- <b>팩을 넘기는 데 손이 더 간다</b> — 찾는 그림이 어느 칸에 있었는지도 기억되지 않는다.
-- 팩은 원래 "상품 단위"로 만든 것인데(V96) 움직이는 이모티콘은 전부 무료라, 여기서 팩은
-- 사실상 <b>분류 탭</b>일 뿐이고 탭이 8개면 분류가 아니라 미로다.
--
-- 같은 날 격자를 6칸 → 7칸으로 줄이고 패널 상한을 240 → 300 으로 올려 한 번에 18장에서
-- 28장이 보이게 했다. 팩 하나가 30장쯤 되어도 스크롤 한 번이면 끝난다.
--
-- <b>합치는 기준</b>
--   ANIM_CELEBRATE(14) → ANIM_FUN     : 웃음과 축하는 같은 결이다
--   ANIM_UPSET(16)     → ANIM_CHEER   : 속상할 때와 힘내라는 말은 같은 순간에 오간다
--   ANIM_ANIMAL(9) · ANIM_FOOD(10) · ANIM_WEATHER(7) → ANIM_DAILY : 셋 다 한 자릿수였다
-- 결과: 사랑 18 · 웃음·축하 32 · 위로·응원 34 · 일상 26 = 110 (한 장도 빠지지 않는다)
--
-- <b>지난 말풍선은 그대로다.</b> content 에 저장되는 것은 스티커 코드(ANIM_PARTY_POPPER)지
-- 팩 id 가 아니다. 팩은 "쓸 수 있나"를 물을 때만 조회되고, 넷 다 무료라 답도 그대로다.
--
-- <b>지우는 팩에 구매 행이 없다.</b> 낱개 구매는 price > 0 인 팩만 가능한데
-- (StickerPack.isPurchasable) 여기 다섯은 전부 0 원이다. 그래도 FK 가 걸려 있으므로
-- 만에 하나를 대비해 지우기 전에 참조를 먼저 거둔다 — 순서가 곧 안전장치다.
--
-- H2/PostgreSQL 양립: 평범한 UPDATE·INSERT·DELETE 뿐이다(CLAUDE.md 4절).

-- ① 남는 팩의 이름을 새 범위에 맞춘다
UPDATE sticker_packs SET title = '웃음·축하' WHERE id = 'ANIM_FUN';
UPDATE sticker_packs SET title = '위로·응원' WHERE id = 'ANIM_CHEER';

-- ② 일상 팩 신설 — 동물·먹을 것·날씨를 받는다
INSERT INTO sticker_packs (id, title, category, is_pro_only, price)
VALUES ('ANIM_DAILY', '일상', 'ANIMATED', FALSE, 0);

-- ③ 혹시 남아 있을 참조를 먼저 거둔다(위 주석 — 정상 경로로는 생길 수 없는 행이다)
DELETE FROM user_sticker_purchases
 WHERE sticker_pack_id IN ('ANIM_CELEBRATE', 'ANIM_UPSET', 'ANIM_ANIMAL', 'ANIM_FOOD', 'ANIM_WEATHER');

-- ④ 흡수된 팩 행을 지운다
DELETE FROM sticker_packs
 WHERE id IN ('ANIM_CELEBRATE', 'ANIM_UPSET', 'ANIM_ANIMAL', 'ANIM_FOOD', 'ANIM_WEATHER');
