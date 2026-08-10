-- 실시간 에너지 밸런스(기초대사량 계산)에 필요한 키(cm). 가입 시점엔 입력받지 않아 NULL 허용.
ALTER TABLE users ADD COLUMN height_cm INTEGER;
