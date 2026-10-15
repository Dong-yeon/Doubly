"""결과 이미지를 R2 에 올린다 — 앱 업로드와 같은 버킷·같은 공개 주소(media.dubly.co.kr).

키는 {루트폴더}/spot-diff/{업로드 시각(초)}-{무작위}.jpg 다. 서버 삭제기(CloudinaryImageDeleter → R2Storage.delete)가
"루트 폴더 아래의 우리 파일"로 알아보고 지울 수 있는 모양이다(R2Urls.isOwnOriginal).
"""
import os
import secrets
import time

import boto3
from botocore.config import Config


def env(name: str, default: str = "") -> str:
    """환경 변수 — 앞뒤 공백·줄바꿈을 걷어 낸다. 운영 R2 키 값 끝에 줄바꿈이 붙어 있어 서명 헤더가 깨진 적이 있다
    (2026-10-15, botocore "Invalid header value"). 서버(R2Properties)는 이미 다듬어 쓰고 있었다."""
    return (os.environ.get(name) or "").strip() or default


def require(name: str) -> str:
    value = env(name)
    if not value:
        raise KeyError(name)
    return value


class R2Uploader:
    def __init__(self):
        account = require("R2_ACCOUNT_ID")
        self.bucket = require("R2_BUCKET")
        # 비어 있는 값도 기본값으로 — Railway 에서 다른 서비스 변수를 참조했는데 그쪽에 값이 없으면 빈 문자열이 들어온다
        self.public_base = env("R2_PUBLIC_BASE_URL", "https://media.dubly.co.kr").rstrip("/")
        self.root = env("CLOUDINARY_FOLDER", "fitto")  # 서버의 루트 폴더(cloudinary.folder)와 같아야 지울 수 있다
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
            aws_access_key_id=require("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=require("R2_SECRET_ACCESS_KEY"),
            region_name="auto",
            config=Config(retries={"max_attempts": 3}, connect_timeout=5, read_timeout=30),
        )

    def put_jpeg(self, data: bytes) -> str:
        key = f"{self.root}/spot-diff/{int(time.time())}-{secrets.token_hex(12)}.jpg"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType="image/jpeg",
                               CacheControl="public, max-age=31536000, immutable")
        return f"{self.public_base}/{key}"

    def delete(self, url: str):
        prefix = self.public_base + "/"
        if url and url.startswith(prefix):
            self.client.delete_object(Bucket=self.bucket, Key=url[len(prefix):])
