# Android 16KB 페이지 크기 — Play 콘솔 반려와 해결 (2026-09-09)

> 버전코드 24 를 프로덕션 트랙에 올리자 Play 콘솔이 **"앱이 16KB 메모리 페이지 크기를
> 지원하지 않습니다"** 오류로 출시를 막았다. 원인은 우리가 직접 만드는 네이티브 모듈
> `korean-spell` 의 `.so` 두 개였다. 이 문서는 원인 판별 방법과 고친 내용, 앞으로 같은
> 오류를 다시 만나지 않기 위한 검사 방법을 남긴다.

## 1. 무엇이 걸리나

Android 15 부터 16KB 메모리 페이지 기기가 나오고, Play 는 **64비트 ABI(arm64-v8a, x86_64)의
모든 네이티브 라이브러리**가 16KB 페이지를 지원해야 신규·업데이트 출시를 허용한다.
판정은 ELF 프로그램 헤더의 `PT_LOAD` 세그먼트 `p_align` 이 전부 **16384 이상**인지다.
링커가 `-Wl,-z,max-page-size=16384` 로 만든 바이너리만 통과한다.

- NDK **r28 부터 기본값**이 16KB 정렬이다.
- NDK r27 은 CMake 인자 `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` 을 줘야 한다.
- NDK 26 이하는 링커 플래그를 직접 넣어야 한다.

Expo SDK 56 / RN 0.85 의 EAS 이미지는 **NDK 27.1** 을 쓴다. RN `ReactAndroid` 와
`expo-modules-core` 는 각자 CMake 호출에 위 인자를 넘기지만, **그건 그 모듈의 빌드에만
걸린다.** 우리처럼 `externalNativeBuild` 를 따로 가진 로컬 모듈에는 전파되지 않는다.

## 2. 어느 .so 인지 찾는 법

의심되는 바이너리를 하나씩 검사했다. 도구는 `readelf` 가 없어도 되는 Node 스크립트
`frontend/modules/korean-spell/scripts/check-elf-align.mjs` (이번에 만들었다).

```bash
# 저장소 안 미리 빌드된 .so
node scripts/check-elf-align.mjs android/src/main/jniLibs/*/libkiwi.so

# Maven 에서 오는 AAR — 내려받아 풀고 jni/ 아래를 검사
curl -sSLO https://repo1.maven.org/maven2/io/getstream/stream-video-webrtc-android/145.9.0/stream-video-webrtc-android-145.9.0.aar
unzip -q stream-video-webrtc-android-145.9.0.aar -d webrtc
node scripts/check-elf-align.mjs webrtc/jni/arm64-v8a/*.so webrtc/jni/x86_64/*.so
```

결과 (2026-09-09, 64비트 ABI 기준):

| 라이브러리 | 출처 | 정렬 |
| --- | --- | --- |
| `libkiwi.so` (arm64-v8a, x86_64) | 우리 손 빌드, 2026-09-03 | **4096 — 원인** |
| `libkoreanspell.so` | 앱 빌드 시 NDK 27.1 + 우리 CMake | **플래그 없음 — 원인** |
| `libjingle_peerconnection_so.so` | `io.getstream:stream-video-webrtc-android:145.9.0` | 16384 |
| `libyuv_android.so` | `io.github.crow-misia.libyuv:libyuv-android:0.36.0` | 16384 |
| `libsentry.so`, `libsentry-android.so` | `io.sentry:sentry-native-ndk:0.12.3` | 16384 |
| RN·Hermes·reanimated·worklets·nitro·expo 모듈 | 앱 빌드 시 NDK 27.1, 각자 플래그 있음 | 16384 |

WebRTC 와 libyuv 의 **32비트**(armeabi-v7a, x86)는 4096 이지만 Play 는 64비트만 본다.

AAB 자체를 검사하고 싶으면 EAS 대시보드에서 `.aab` 를 받아 `unzip` 후 `base/lib/arm64-v8a/*.so`
전부에 같은 스크립트를 돌리면 된다 — **스토어에 올리기 전에 이걸 한 번 돌리는 게 가장 확실하다.**

## 3. 고친 것

1. `frontend/modules/korean-spell/android/build.gradle` — cmake `arguments
   "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"`. NDK 27 에서 `libkoreanspell.so` 를 16KB 로 링크한다.
2. `frontend/modules/korean-spell/android/CMakeLists.txt` — `target_link_options(koreanspell
   PRIVATE "-Wl,-z,max-page-size=16384")`. NDK 버전이나 호출 경로와 무관하게 걸리는 이중 안전장치.
3. `libkiwi.so` 두 ABI **재빌드** — NDK r28c, 같은 두 플래그. 절차는
   `frontend/modules/korean-spell/scripts/build-kiwi-android.sh` 에 스크립트로 박았다
   (Kiwi 소스 fetch → 서브모듈 5개 → CMake → strip → 정렬 검사). 이전에는 손 빌드라
   재현 절차가 문서에만 있었고, 정렬 플래그가 빠진 채 커밋됐다.

   **소스 기준점은 태그가 아니라 main 의 커밋 `f06a54d`(2026-08-21)다.** 처음 재빌드를
   `v0.23.2` 태그로 했더니 링크·정렬은 다 통과했는데 `llvm-nm` 으로 보니 `kiwi_space` ·
   `kiwi_glue` · `kiwi_free_string` 이 없었다 — 이 C API 는 미출시 main 에만 있다(분석 문서
   §1 에 이미 적혀 있던 사실). 태그 빌드를 그대로 올렸다면 스토어 심사는 통과하고 실기기에서
   `UnsatisfiedLinkError` 로 띄어쓰기 기능만 조용히 사라졌을 것이다. 스크립트가 SHA 를
   고정하고, 정렬 검사와 함께 **심볼 검사도 마지막에 한다.**

Kiwi 빌드 옵션(mimalloc 끄기, cpuinfo 켜기, x86_64 는 AVX-VNNI 제외 등)의 근거는
`SPELLCHECK_KIWI_SPACING_ANALYSIS_2026-09-03.md` §2·§6 에 있고, 스크립트 주석에도 요약했다.

## 4. 앞으로

- **네이티브 의존성을 추가·업그레이드하면** 64비트 `.so` 를 §2 방법으로 검사한다. 특히
  미리 빌드된 `.so` 를 저장소에 커밋하는 경우(`jniLibs/`)가 위험하다 — 앱 빌드 플래그가
  전혀 영향을 주지 못한다.
- `libkiwi.so` 를 다시 만들 일이 있으면(Kiwi 버전 업 등) 반드시 스크립트로 만든다.
  스크립트 마지막 단계가 정렬 검사라 4KB 산출물은 종료 코드 1 로 막힌다.
- 로컬 PC 에는 NDK·CMake 가 상시 설치돼 있지 않다. 이번엔 NDK r28c(Windows zip)·CMake·
  Ninja 를 임시 폴더에 받아 썼고 저장소엔 남기지 않았다. 스크립트가 `ANDROID_NDK` 만 요구한다.
