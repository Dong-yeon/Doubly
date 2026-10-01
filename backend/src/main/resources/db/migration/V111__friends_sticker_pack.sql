-- 서버 배포 스티커 팩 "친구들" (2026-10-01, docs/SERVER_STICKER_PACKS_2026-10-01.md)
--
-- 그림 목록은 DB 가 아니라 classpath:stickers/catalog.json 에 있다(RemoteStickerCatalog) — 파일과
-- 같은 커밋으로 움직여야 짝이 안 어긋나기 때문이다. 여기는 팩의 제목·가격·잠금만 둔다.
-- 무료(price 0, PRO 아님)라 StickerService 판정에서 바로 열린다.
--
-- H2/PostgreSQL 양립: 평범한 INSERT 뿐이다(CLAUDE.md 4절).

INSERT INTO sticker_packs (id, title, category, is_pro_only, price)
VALUES ('ANIM_FRIENDS', '친구들', 'ANIMATED', FALSE, 0);
