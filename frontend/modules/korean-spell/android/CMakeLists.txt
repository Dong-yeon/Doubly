# Hunspell(벤더링된 C++ 원본)과 JNI 다리를 하나의 .so 로 묶는다.
#
# HUNSPELL_STATIC 을 켜야 hunvisapi.h 가 dllimport/visibility 속성을 붙이지 않는다 —
# 우리는 앱 안에 정적으로 넣어 쓰므로 내보낼 심볼이 JNI 진입점뿐이다.
cmake_minimum_required(VERSION 3.22)
project(koreanspell)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(SHARED_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../cpp")

file(GLOB HUNSPELL_SOURCES "${SHARED_CPP_DIR}/hunspell/*.cxx")

set(KOREANSPELL_SOURCES
  "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/jni.cpp"
  "${SHARED_CPP_DIR}/KoreanSpellCore.cpp"
  ${HUNSPELL_SOURCES}
)

# Kiwi(띄어쓰기 교정) — 소스를 벤더링하지 않고 미리 빌드한 .so 에 링크한다.
# 공식 안드로이드 AAR 은 C API 를 노출하지 않아 쓸 수 없어서 직접 빌드했다
# (빌드 옵션과 재현 방법은 docs/SPELLCHECK_KIWI_SPACING_ANALYSIS_2026-09-03.md).
#
# 64비트 두 ABI 만 준비돼 있다(공식 Kiwi 배포도 같다). 없는 ABI 에서는 Kiwi 를 빼고
# 빌드하고 Kotlin 쪽이 UnsatisfiedLinkError 를 받아 조용히 기능만 끈다 —
# 맞춤법 검사(Hunspell)는 모든 ABI 에서 그대로 동작한다.
set(KIWI_SO "${CMAKE_CURRENT_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libkiwi.so")
if(EXISTS "${KIWI_SO}")
  list(APPEND KOREANSPELL_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/kiwi_jni.cpp")
  # LGPL 2.1 이라 반드시 동적 링킹이어야 한다 — 정적으로 묶으면 재링크 요건을 못 지킨다.
  add_library(kiwi SHARED IMPORTED)
  set_target_properties(kiwi PROPERTIES IMPORTED_LOCATION "${KIWI_SO}")
  set(KIWI_LIB kiwi)
  message(STATUS "koreanspell: Kiwi 포함 (${ANDROID_ABI})")
else()
  set(KIWI_LIB "")
  message(STATUS "koreanspell: Kiwi 없음 — 띄어쓰기 교정 제외 (${ANDROID_ABI})")
endif()

add_library(koreanspell SHARED ${KOREANSPELL_SOURCES})

target_include_directories(koreanspell PRIVATE "${SHARED_CPP_DIR}")
target_compile_definitions(koreanspell PRIVATE HUNSPELL_STATIC)

# 벤더링한 원본이라 우리가 고칠 수 없는 경고가 섞여 있다 — 빌드 로그를 우리 코드의
# 경고만 보이게 유지하려고 여기서만 눌러둔다.
target_compile_options(koreanspell PRIVATE -Wno-deprecated-declarations)

# android(asset manager) 는 Kiwi 모델을 APK 에서 바로 읽기 위해 필요하다
target_link_libraries(koreanspell log android ${KIWI_LIB})
