#!/usr/bin/env bash
#
# Kiwi(띄어쓰기 교정 엔진) 안드로이드 공유 라이브러리 빌드 — android/src/main/jniLibs/<ABI>/libkiwi.so
#
# 왜 직접 빌드하나: 공식 안드로이드 AAR 은 C API(kiwi_space 등)를 노출하지 않는다.
# 배경과 옵션 근거는 docs/SPELLCHECK_KIWI_SPACING_ANALYSIS_2026-09-03.md §2·§6.
#
# 16KB 페이지 크기(CRITICAL): Play 콘솔은 64비트 .so 전부가 16KB 페이지를 지원해야
# 프로덕션 출시를 허용한다. 미리 빌드해 커밋하는 이 파일은 앱 빌드의 CMake 플래그를
# 타지 않으므로, 여기서 링커 옵션으로 직접 보장하고 마지막에 검사까지 한다.
# (2026-09-09 버전코드 24 가 이 오류로 반려된 뒤 추가됨)
#
# 필요한 것
#   ANDROID_NDK   NDK 경로 (r27 이상. r28 부터는 16KB 정렬이 기본값이지만 플래그를 명시한다)
#   cmake, ninja  PATH 에 있거나 CMAKE / NINJA 환경변수로 지정
#   git           Kiwi 소스를 받을 때 (KIWI_SRC 를 주면 생략)
#
# 사용법 (frontend/modules/korean-spell 에서)
#   ANDROID_NDK=/path/to/ndk scripts/build-kiwi-android.sh            # arm64-v8a x86_64 둘 다
#   ANDROID_NDK=/path/to/ndk scripts/build-kiwi-android.sh arm64-v8a  # 하나만
#
# 선택 환경변수
#   KIWI_SRC      이미 받아둔 Kiwi 소스 트리 (없으면 $WORK/kiwi-src 에 clone)
#   WORK          빌드 트리 위치 (기본: 시스템 temp 아래 kiwi-android-build). 수 GB 를 쓴다.
#   JOBS          병렬 컴파일 수 (기본: 4 — Knlm.cpp 템플릿 인스턴스화가 무거워 코어 수만큼
#                 돌리면 16GB 에서도 OOM 이 난다)
set -euo pipefail

MODULE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JNILIBS="$MODULE_DIR/android/src/main/jniLibs"

# 소스 기준점은 태그가 아니라 main 의 커밋이다(CRITICAL). 우리가 쓰는 kiwi_space / kiwi_glue /
# kiwi_free_string 은 v0.23.2 태그에 없고 미출시 main 에만 있다(분석 문서 §1). 태그로 빌드하면
# 링크는 되지만 심볼이 빠져 실기기에서 UnsatisfiedLinkError 로 조용히 기능이 꺼진다 — 2026-09-09
# 재빌드 때 실제로 겪었다. 벤더링한 cpp/kiwi/capi.h 가 이 커밋의 것과 같아야 한다(올릴 때 같이 갱신).
KIWI_REF="${KIWI_REF:-f06a54db4748e4eb5b8ced127c281fc8fac73ea1}"   # main, 2026-08-21 (Macro.h 는 0.23.2)

ABIS=("$@")
[ ${#ABIS[@]} -eq 0 ] && ABIS=(arm64-v8a x86_64)

: "${ANDROID_NDK:?ANDROID_NDK 를 지정하세요 (예: ~/Android/Sdk/ndk/28.2.13676358)}"
CMAKE="${CMAKE:-cmake}"
NINJA="${NINJA:-ninja}"
JOBS="${JOBS:-4}"
WORK="${WORK:-${TMPDIR:-${TEMP:-/tmp}}/kiwi-android-build}"
mkdir -p "$WORK"

# NDK 안의 llvm-strip — 호스트 OS 별 prebuilt 디렉토리 하나뿐이다.
STRIP="$(ls -d "$ANDROID_NDK"/toolchains/llvm/prebuilt/*/bin | head -1)/llvm-strip"

KIWI_SRC="${KIWI_SRC:-$WORK/kiwi-src}"
if [ ! -f "$KIWI_SRC/CMakeLists.txt" ]; then
  echo "== Kiwi $KIWI_REF 소스 받기 → $KIWI_SRC"
  # 모델(git-lfs, 수백 MB)은 필요 없다 — 앱은 kiwi-model/ 에 이미 갖고 있다.
  # 커밋 하나만 얕게 받는다(GitHub 은 SHA 직접 fetch 를 허용한다).
  mkdir -p "$KIWI_SRC"
  git -C "$KIWI_SRC" init -q
  git -C "$KIWI_SRC" remote add origin https://github.com/bab2min/Kiwi
  GIT_LFS_SKIP_SMUDGE=1 git -C "$KIWI_SRC" fetch -q --depth 1 origin "$KIWI_REF"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$KIWI_SRC" checkout -q FETCH_HEAD
  # 서브모듈 8개 중 빌드에 필요한 5개만 (mimalloc 은 끄고, tclap·googletest 는 CLI·테스트용).
  # core.longpaths: json 서브모듈의 벤치마크 리포트 파일명이 Windows MAX_PATH 를 넘어
  # 체크아웃이 실패한다(Git Bash 에서 재현됨).
  git -C "$KIWI_SRC" -c core.longpaths=true submodule update -q --init --depth 1 \
    third_party/cpp-btree third_party/eigen third_party/streamvbyte third_party/json third_party/cpuinfo
fi

# x86_64 는 arch 구현이 6종(sse2·sse4_1·avx2·avx_vnni·avx512bw·avx512vnni)이라 arm64 보다
# 훨씬 무겁고 이전 빌드가 두 번 OOM 으로 죽었다. 에뮬레이터 전용이라 가속이 필요 없으니
# avx_vnni 를 뺀다. Kiwi CMake 가 이 값을 일반 set() 으로 덮어써서 -D 로는 못 끄므로
# 캐시 변수 KIWI_AVX_VNNI 를 존중하도록 한 줄만 고친다(한 번만 — 이미 고쳤으면 건너뛴다).
if ! grep -q KIWI_AVX_VNNI "$KIWI_SRC/CMakeLists.txt"; then
  sed -i.bak -E 's/^(\s*)set \( AVX_VNNI_SUPPORTED ON \)/\1if(NOT DEFINED KIWI_AVX_VNNI)\n\1  set ( AVX_VNNI_SUPPORTED ON )\n\1else()\n\1  set ( AVX_VNNI_SUPPORTED ${KIWI_AVX_VNNI} )\n\1endif()/' "$KIWI_SRC/CMakeLists.txt"
fi

for ABI in "${ABIS[@]}"; do
  BUILD="$WORK/build-$ABI"
  echo "== [$ABI] configure → $BUILD"
  EXTRA=()
  [ "$ABI" = x86_64 ] && EXTRA+=(-DKIWI_AVX_VNNI=OFF)

  "$CMAKE" -S "$KIWI_SRC" -B "$BUILD" -G Ninja -DCMAKE_MAKE_PROGRAM="$NINJA" \
    -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI="$ABI" -DANDROID_PLATFORM=android-24 \
    -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON \
    -DCMAKE_BUILD_TYPE=Release \
    -DKIWI_USE_MIMALLOC=OFF -DKIWI_USE_CPUINFO=ON \
    -DKIWI_BUILD_CLI=OFF -DKIWI_BUILD_EVALUATOR=OFF \
    -DKIWI_BUILD_MODEL_BUILDER=OFF -DKIWI_BUILD_TEST=OFF \
    -DKIWI_BUILD_DYNAMIC=ON \
    -DCMAKE_SHARED_LINKER_FLAGS="-llog -Wl,-z,max-page-size=16384" \
    "${EXTRA[@]}"
  #   -llog: cpuinfo 가 __android_log_vprint 를 쓰는데 CMake 가 자동으로 걸어주지 않는다.
  #   max-page-size=16384: 16KB 페이지 정렬. ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES 와 이중이다.

  echo "== [$ABI] build (-j$JOBS)"
  "$CMAKE" --build "$BUILD" --target kiwi -j "$JOBS"

  OUT="$JNILIBS/$ABI/libkiwi.so"
  mkdir -p "$(dirname "$OUT")"
  "$STRIP" --strip-unneeded "$BUILD/libkiwi.so" -o "$OUT"
  echo "== [$ABI] → $OUT ($(du -h "$OUT" | cut -f1))"
done

echo "== 16KB 정렬 검사"
OUTS=()
for ABI in "${ABIS[@]}"; do OUTS+=("$JNILIBS/$ABI/libkiwi.so"); done
node "$MODULE_DIR/scripts/check-elf-align.mjs" "${OUTS[@]}"

# kiwi_jni.cpp 가 부르는 C API 가 실제로 내보내졌는지 — 태그(v0.23.2)로 빌드하면 여기서 걸린다.
# 빠진 심볼은 링크·정렬을 다 통과하고 실기기에서 UnsatisfiedLinkError 로만 드러나기 때문에
# 빌드 단계에서 잡아야 한다.
echo "== 심볼 검사"
NM="$(dirname "$STRIP")/llvm-nm"
REQUIRED=(kiwi_init kiwi_close kiwi_space kiwi_glue kiwi_free_string kiwi_builder_init_stream kiwi_builder_build kiwi_error)
for OUT in "${OUTS[@]}"; do
  EXPORTED="$("$NM" -D --defined-only "$OUT" | awk '$2 == "T" { print $3 }')"
  MISSING=()
  for SYM in "${REQUIRED[@]}"; do grep -qx "$SYM" <<<"$EXPORTED" || MISSING+=("$SYM"); done
  if [ ${#MISSING[@]} -gt 0 ]; then
    echo "BAD   심볼 없음: ${MISSING[*]}  $OUT" >&2
    exit 1
  fi
  echo "OK    kiwi_* $(grep -c '^kiwi_' <<<"$EXPORTED")개 내보냄  $OUT"
done
