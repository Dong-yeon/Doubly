"""결과 이미지를 R2 에 올린다 — 앱 업로드와 같은 버킷·같은 공개 주소(media.dubly.co.kr).

키는 {루트폴더}/spot-diff/{업로드 시각(초)}-{무작위}.jpg 다. 서버 삭제기(CloudinaryImageDeleter → R2Storage.delete)가
"루트 폴더 아래의 우리 파일"로 알아보고 지울 수 있는 모양이다(R2Urls.isOwnOriginal).
"""
import os
import secrets
import time

import boto3
from botocore.config import Config


class R2Uploader:
    def __init__(self):
        account = os.environ["R2_ACCOUNT_ID"]
        self.bucket = os.environ["R2_BUCKET"]
        self.public_base = os.environ.get("R2_PUBLIC_BASE_URL", "https://media.dubly.co.kr").rstrip("/")
        self.root = os.environ.get("CLOUDINARY_FOLDER", "fitto")  # 서버의 루트 폴더(cloudinary.folder)와 같아야 지울 수 있다
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
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
