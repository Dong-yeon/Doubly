"""원본 사진 받기 — 우리 저장소 주소만 받는다.

후보 URL 은 DB 에서 오지만, 식단·운동·방문 사진 URL 은 저장할 때 따로 검사하지 않는다(CloudinaryImageDeleter 주석).
worker 는 Railway 사설망 안에서 돌기 때문에 아무 주소나 받으면 내부 서비스(DB 등)를 두드리는 통로가 된다 —
https 이고 허용된 호스트일 때만 받는다.
"""
import os
from urllib.parse import urlparse

import requests
from PIL import Image

from . import config

# 압축 폭탄 — 이보다 큰 그림은 열지 않는다(원본은 폰 사진이라 50MP 를 넘지 않는다)
Image.MAX_IMAGE_PIXELS = 50_000_000

DEFAULT_HOSTS = "res.cloudinary.com,media.dubly.co.kr"


def allowed_hosts():
    return {h.strip().lower() for h in os.environ.get("SPOT_ALLOWED_HOSTS", DEFAULT_HOSTS).split(",") if h.strip()}


def check_url(url: str):
    u = urlparse(url)
    if u.scheme != "https" or (u.hostname or "").lower() not in allowed_hosts():
        raise ValueError(f"허용되지 않은 주소: {u.scheme}://{u.hostname}")


def _get(url: str, limit: int, headers=None) -> bytes:
    check_url(url)
    with requests.get(url, headers=headers or {}, stream=True, timeout=config.HTTP_TIMEOUT,
                      allow_redirects=False) as r:
        if r.status_code not in (200, 206):
            raise ValueError(f"HTTP {r.status_code}")
        buf = bytearray()
        for chunk in r.iter_content(64 * 1024):
            buf.extend(chunk)
            if len(buf) >= limit:
                break
        return bytes(buf[:limit])


def head_bytes(url: str) -> bytes:
    """앞부분만 — Range 를 무시하는 서버면 받다가 끊는다."""
    return _get(url, config.HEADER_BYTES, {"Range": f"bytes=0-{config.HEADER_BYTES - 1}"})


def full_bytes(url: str) -> bytes:
    data = _get(url, config.MAX_DOWNLOAD_BYTES + 1)
    if len(data) > config.MAX_DOWNLOAD_BYTES:
        raise ValueError("사진이 너무 커요")
    return data
