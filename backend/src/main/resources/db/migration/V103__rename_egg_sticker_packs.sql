-- 캐릭터 팩 이름 정리 (2026-09-22)
--
--   삶은달걀   → 달걀이
--   맥반석♥달걀 → 구운이
--
-- <b>이름이지 설명이 아니다.</b> "삶은달걀"·"맥반석♥달걀"은 무엇으로 만들었는지를 적은
-- 말이라 팩 목록에서 길고, 둘을 나란히 두면 공통어("달걀")가 반복돼 구분이 늦다.
-- '달걀이'·'구운이'는 부르는 이름이라 짧고, 짝이라는 것도 어미(-이)에서 읽힌다.
--
-- <b>팩 id 는 그대로 둔다</b>(EGG_BOILED · EGG_DUO). id 는 코드가 상수로 참조하고
-- 스토어 상품 id 까지 여기서 파생되므로(StickerPack.productId → sticker_pack_egg_boilded
-- 가 아니라 sticker_pack_egg_boiled), 이름이 바뀔 때마다 따라 바꾸면 <b>이미 산 사람이
-- 못 쓰게 된다</b>. 화면에 보이는 것만 바꾸는 것이 이 마이그레이션의 전부다.
--
-- 앱 쪽 라벨(stickerImages.ts 의 STICKER_CHARACTERS[].label)도 같이 바꿨다 — 채팅
-- 패널의 스트립 이름표와 텍스트 코드가 그 값을 쓴다((달걀이_사랑해)).
--
-- H2/PostgreSQL 양립: 평범한 UPDATE 뿐이다(CLAUDE.md 4절).

UPDATE sticker_packs SET title = '달걀이' WHERE id = 'EGG_BOILED';
UPDATE sticker_packs SET title = '구운이' WHERE id = 'EGG_DUO';
