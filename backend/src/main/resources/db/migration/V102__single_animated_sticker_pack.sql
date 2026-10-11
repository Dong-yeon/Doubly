-- 움직이는 이모티콘 4팩 → 1팩 (2026-09-22)
--
-- <b>같은 날 두 번째 합치기다.</b> V100 이 8팩을 4팩으로 줄였는데, 줄이고 나서 보니 남은
-- 경계도 자의적이었다 — 🔥가 "응원"인지 "일상"인지는 보내는 사람마다 다르고, 어느 팩에
-- 있었는지는 아무도 기억하지 않는다. 팩이 분류로 쓸모가 있으려면 "여기 없으면 저기"가
-- 성립해야 하는데 감정 그림에는 그런 경계가 없다.
--
-- 같은 날 격자 칸을 퍼센트에서 고정 크기(46dp)로 바꾸면서 한 줄에 들어가는 장수가 화면
-- 폭만큼 늘었다(폰 6~7, 태블릿 15). 110장을 통으로 두고 훑는 편이 팩을 넘기는 것보다 빠르다.
--
-- <b>왜 남는 팩 하나를 새 id 로 만드나</b>: ANIM_LOVE 를 재활용해 이름만 "움직이는
-- 이모티콘"으로 바꾸면 id 와 내용이 영영 어긋난다. 팩 id 는 코드가 상수로 참조하는 값이라
-- (StickerPacks.ANIM_ALL) 읽고 뜻이 통해야 한다.
--
-- <b>지난 말풍선은 그대로다.</b> content 에 저장되는 것은 스티커 코드(ANIM_HEART)지 팩 id 가
-- 아니다. 팩은 "쓸 수 있나"를 물을 때만 조회되고, 새 팩도 무료라 답이 그대로다.
--
-- 지우는 넷은 전부 0 원이라 낱개 구매 행이 있을 수 없지만(StickerPack.isPurchasable),
-- FK 가 걸려 있으므로 V100 과 같은 순서로 참조를 먼저 거둔다.
--
-- H2/PostgreSQL 양립: 평범한 INSERT·DELETE 뿐이다(CLAUDE.md 4절).

INSERT INTO sticker_packs (id, title, category, is_pro_only, price)
VALUES ('ANIM_ALL', '움직이는 이모티콘', 'ANIMATED', FALSE, 0);

DELETE FROM user_sticker_purchases
 WHERE sticker_pack_id IN ('ANIM_LOVE', 'ANIM_FUN', 'ANIM_CHEER', 'ANIM_DAILY');

DELETE FROM sticker_packs
 WHERE id IN ('ANIM_LOVE', 'ANIM_FUN', 'ANIM_CHEER', 'ANIM_DAILY');
