-- "친구들"(ANIM_FRIENDS) 팩을 "동물 친구들"(ANIM_ANIMALS)에 합친다 (2026-10-01, 사용자 결정)
--
-- 그림 10종은 catalog.json 에서 ANIM_ANIMALS 로 옮겼고 코드(FRIEND_*)는 그대로다 — 메시지 content 는
-- 코드만 들고 있어서 팩이 바뀌어도 지난 말풍선이 그대로 그려진다. 두 팩 모두 앱 배포 전이라 쓴 사람이 없다.
-- 무료 팩이라 구매 행이 있을 수 없지만, FK 가 걸려 있으므로 V102 와 같은 순서로 참조를 먼저 거둔다.
--
-- H2/PostgreSQL 양립: 평범한 DELETE 뿐이다(CLAUDE.md 4절).

DELETE FROM user_sticker_purchases
 WHERE sticker_pack_id IN ('ANIM_FRIENDS');

DELETE FROM sticker_packs
 WHERE id IN ('ANIM_FRIENDS');
