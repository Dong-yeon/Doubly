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

add_library(koreanspell SHARED
  "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/jni.cpp"
  "${SHARED_CPP_DIR}/KoreanSpellCore.cpp"
  ${HUNSPELL_SOURCES}
)

target_include_directories(koreanspell PRIVATE "${SHARED_CPP_DIR}")
target_compile_definitions(koreanspell PRIVATE HUNSPELL_STATIC)

# 벤더링한 원본이라 우리가 고칠 수 없는 경고가 섞여 있다 — 빌드 로그를 우리 코드의
# 경고만 보이게 유지하려고 여기서만 눌러둔다.
target_compile_options(koreanspell PRIVATE -Wno-deprecated-declarations)

target_link_libraries(koreanspell log)
