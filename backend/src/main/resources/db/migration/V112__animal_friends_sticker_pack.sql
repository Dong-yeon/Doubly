-- 서버 배포 스티커 팩 "동물 친구들" (2026-10-01, docs/SERVER_STICKER_PACKS_2026-10-01.md)
--
-- 그림 목록은 classpath:stickers/catalog.json(RemoteStickerCatalog), 여기는 팩의 제목·가격·잠금만.
-- 무료(price 0, PRO 아님) — 사용자 결정: LottieFiles 팩은 모두 무료로 제공한다.
--
-- H2/PostgreSQL 양립: 평범한 INSERT 뿐이다(CLAUDE.md 4절).

INSERT INTO sticker_packs (id, title, category, is_pro_only, price)
VALUES ('ANIM_ANIMALS', '동물 친구들', 'ANIMATED', FALSE, 0);
