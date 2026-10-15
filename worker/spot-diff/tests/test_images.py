import io

import numpy as np
from PIL import Image

from conftest import make_scene, to_jpeg
from spot_worker import images


def _exif_with_gps(orientation=1):
    exif = Image.Exif()
    exif[0x0112] = orientation          # Orientation
    exif[0x010F] = "TestCam"            # Make
    gps = exif.get_ifd(0x8825)          # GPSInfo
    gps[1] = "N"
    gps[2] = (37.0, 33.0, 59.0)
    gps[3] = "E"
    gps[4] = (126.0, 58.0, 41.0)
    return exif


def test_결과_JPEG_에는_EXIF_가_하나도_남지_않는다():
    src = to_jpeg(make_scene(2, 400, 300), exif=_exif_with_gps())
    with Image.open(io.BytesIO(src)) as im:     # 입력에는 GPS 가 있다(전제 확인)
        assert im.getexif().get_ifd(0x8825)

    out = images.encode_jpeg(images.load_oriented(src))
    with Image.open(io.BytesIO(out)) as im:
        assert len(im.getexif()) == 0
        assert "exif" not in im.info
        assert "icc_profile" not in im.info
    assert b"Exif\x00\x00" not in out
    assert b"TestCam" not in out


def test_EXIF_방향을_적용한다():
    # 가로 400×300 사진 + "90° 돌려서 보라"(6) → 세로 300×400 으로 나와야 한다
    src = to_jpeg(make_scene(3, 400, 300), exif=_exif_with_gps(orientation=6))
    assert images.header_size(src) == (300, 400)
    img = images.load_oriented(src)
    assert img.shape[:2] == (400, 300)


def test_헤더_앞부분만으로_크기를_읽는다():
    src = to_jpeg(make_scene(4, 1200, 1000))
    assert images.header_size(src[:4096]) == (1200, 1000)
    assert images.header_size(b"not an image") is None


def test_긴_변을_1600_으로_줄이고_작으면_키우지_않는다():
    big = np.zeros((2000, 3000, 3), np.uint8)
    assert images.fit_long_side(big).shape[:2] == (1067, 1600)
    small = np.zeros((900, 1200, 3), np.uint8)
    assert images.fit_long_side(small).shape[:2] == (900, 1200)
