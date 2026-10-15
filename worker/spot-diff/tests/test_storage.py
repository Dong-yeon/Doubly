import pytest

from spot_worker import storage


def test_환경_변수의_앞뒤_줄바꿈과_공백을_걷어_낸다(monkeypatch):
    """운영 R2 키 끝에 줄바꿈이 붙어 서명 헤더가 깨졌다(2026-10-15) — 서버 R2Properties 처럼 다듬는다"""
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "abc123\n")
    monkeypatch.setenv("R2_BUCKET", "  bucket \r\n")
    assert storage.require("R2_ACCESS_KEY_ID") == "abc123"
    assert storage.require("R2_BUCKET") == "bucket"


def test_비었거나_공백뿐이면_기본값_또는_KeyError(monkeypatch):
    monkeypatch.setenv("CLOUDINARY_FOLDER", "  \n")
    monkeypatch.delenv("R2_PUBLIC_BASE_URL", raising=False)
    assert storage.env("CLOUDINARY_FOLDER", "fitto") == "fitto"
    assert storage.env("R2_PUBLIC_BASE_URL", "https://media.dubly.co.kr") == "https://media.dubly.co.kr"
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "\n")
    with pytest.raises(KeyError):
        storage.require("R2_SECRET_ACCESS_KEY")


def test_업로더가_줄바꿈_붙은_키로도_만들어진다(monkeypatch):
    for k, v in {"R2_ACCOUNT_ID": "acc\n", "R2_BUCKET": "b\n", "R2_ACCESS_KEY_ID": "id\n",
                 "R2_SECRET_ACCESS_KEY": "secret\n", "CLOUDINARY_FOLDER": "fitto\n"}.items():
        monkeypatch.setenv(k, v)
    u = storage.R2Uploader()
    assert u.bucket == "b" and u.root == "fitto"
    creds = u.client._request_signer._credentials
    assert creds.access_key == "id" and creds.secret_key == "secret"
    assert u.client.meta.endpoint_url == "https://acc.r2.cloudflarestorage.com"
