-- 우리 이모지 배경 따내기 (2026-09-30) — docs/COUPLE_EMOJI_CUTOUT_2026-09-30.md
--
-- 생성 이미지는 흰 배경 JPEG 라 채팅이 흰 원판에 얹어 그렸다. 서버가 배경을 따낸 투명 PNG 를 별도 폴더
-- (couple-emoji-cut)에 올리고, 앱은 그 폴더 URL 이면 원판 없이 그린다.
--
-- null  = 아직 안 해 봄(기존 이모지 — 백필 대상)
-- true  = 따낸 PNG 로 바꿨다
-- false = 따내기가 수상해서(거의 다 지워짐 등) 원본을 그대로 둔다 — 다시 시도하지 않는다
ALTER TABLE couple_emojis ADD COLUMN bg_removed BOOLEAN;
