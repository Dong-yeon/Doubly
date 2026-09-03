/**
 * Kiwi 띄어쓰기 교정 — Kotlin ↔ C API 다리.
 *
 * <p>Hunspell 쪽(jni.cpp)과 달리 <b>모델을 파일로 꺼내지 않는다.</b> Kiwi 는
 * {@code kiwi_builder_init_stream} 으로 "파일명을 주면 읽기/이동/닫기를 제공하는
 * 스트림"을 받을 수 있어서, APK 안의 asset 을 그대로 먹일 수 있다. 모델이 83MB 라
 * 꺼내 쓰면 APK 83MB + 내부저장소 83MB 로 사용자 저장소를 두 배로 잡아먹는다.
 *
 * <p>asset 은 반드시 <b>압축되지 않은</b> 상태여야 한다(build.gradle 의 noCompress).
 * 압축된 asset 은 seek 할 때마다 앞에서부터 다시 풀어서 로딩이 몇 배로 느려진다.
 */
#include <jni.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <android/log.h>

#include <mutex>
#include <string>

#include "kiwi/capi.h"

namespace {

constexpr const char* kTag = "KoreanSpell";

std::mutex gMutex;
kiwi_h gKiwi = nullptr;
std::string gError;

/**
 * 스트림 팩토리는 user_data 를 못 받는다(파일명만 받는 함수 포인터다) —
 * AssetManager 를 전역에 둘 수밖에 없다. 인스턴스가 하나뿐이라 문제되지 않는다.
 */
AAssetManager* gAssets = nullptr;
std::string gAssetDir;

size_t assetRead(void* userData, char* buffer, size_t length) {
  int read = AAsset_read(static_cast<AAsset*>(userData), buffer, length);
  return read < 0 ? 0 : static_cast<size_t>(read);
}

long long assetSeek(void* userData, long long offset, int whence) {
  return AAsset_seek64(static_cast<AAsset*>(userData), offset, whence);
}

void assetClose(void* userData) {
  AAsset_close(static_cast<AAsset*>(userData));
}

/** Kiwi 가 모델 파일을 하나 요청할 때마다 불린다 */
kiwi_stream_object_t assetStreamFactory(const char* filename) {
  kiwi_stream_object_t stream{};
  if (gAssets == nullptr) return stream;

  const std::string path = gAssetDir + "/" + filename;
  AAsset* asset = AAssetManager_open(gAssets, path.c_str(), AASSET_MODE_RANDOM);
  if (asset == nullptr) {
    // 없는 파일을 물어보는 건 정상이다 — Kiwi 는 선택적 모델 파일도 시도해본다.
    return stream;
  }
  stream.read = assetRead;
  stream.seek = assetSeek;
  stream.close = assetClose;
  stream.user_data = asset;
  return stream;
}

std::string toStdString(JNIEnv* env, jstring value) {
  if (value == nullptr) return {};
  const char* utf = env->GetStringUTFChars(value, nullptr);
  std::string result(utf != nullptr ? utf : "");
  if (utf != nullptr) env->ReleaseStringUTFChars(value, utf);
  return result;
}

}  // namespace

extern "C" {

/**
 * 모델을 읽어 준비한다.
 *
 * @param options kiwi_init 의 생성 옵션. 7(= 기본에서 multi.dict 제외)이면 로딩이
 *                절반으로 줄고 메모리가 155MB 덜 드는데 띄어쓰기 품질은 같다
 *                (실기기 측정, docs 참고).
 */
JNIEXPORT jboolean JNICALL
Java_expo_modules_koreanspell_KiwiNative_nativeLoad(
    JNIEnv* env, jobject, jobject assetManager, jstring assetDir, jint options) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (gKiwi != nullptr) return JNI_TRUE;

  gAssets = AAssetManager_fromJava(env, assetManager);
  if (gAssets == nullptr) {
    gError = "AssetManager 를 얻지 못했습니다";
    return JNI_FALSE;
  }
  gAssetDir = toStdString(env, assetDir);

  // 스트림용 진입점은 builder 뿐이다(kiwi_init 은 파일 경로만 받는다).
  // 사용자 사전을 넣을 자리도 여기다 — kiwi_builder_add_word 를 build 전에 부르면 된다.
  kiwi_builder_h builder = kiwi_builder_init_stream(assetStreamFactory, -1, options, 0);
  if (builder == nullptr) {
    const char* err = kiwi_error();
    gError = err != nullptr ? err : "모델을 읽지 못했습니다";
    __android_log_print(ANDROID_LOG_ERROR, kTag, "kiwi builder failed: %s", gError.c_str());
    return JNI_FALSE;
  }

  gKiwi = kiwi_builder_build(builder, nullptr, 0.f);
  kiwi_builder_close(builder);

  if (gKiwi == nullptr) {
    const char* err = kiwi_error();
    gError = err != nullptr ? err : "알 수 없는 오류";
    __android_log_print(ANDROID_LOG_ERROR, kTag, "kiwi build failed: %s", gError.c_str());
    return JNI_FALSE;
  }
  gError.clear();
  return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_koreanspell_KiwiNative_nativeIsLoaded(JNIEnv*, jobject) {
  std::lock_guard<std::mutex> lock(gMutex);
  return gKiwi != nullptr ? JNI_TRUE : JNI_FALSE;
}

/**
 * 띄어쓰기를 고친 문장. 준비 전이면 원문을 그대로 돌려준다
 * — 준비가 안 됐다고 사용자 글이 사라지면 안 된다.
 *
 * <p>{@code reset_whitespace=1} 로 부른다. 0 이면 기존 공백을 그대로 두는데,
 * 그러면 잘못 띄어 쓴 것("만 족스러웠고")을 못 고친다(실기기 확인).
 */
JNIEXPORT jstring JNICALL
Java_expo_modules_koreanspell_KiwiNative_nativeCorrect(JNIEnv* env, jobject, jstring text) {
  const std::string input = toStdString(env, text);
  std::lock_guard<std::mutex> lock(gMutex);
  if (gKiwi == nullptr) return env->NewStringUTF(input.c_str());

  const char* corrected = kiwi_space(gKiwi, input.c_str(), 1);
  if (corrected == nullptr) return env->NewStringUTF(input.c_str());

  jstring result = env->NewStringUTF(corrected);
  kiwi_free_string(corrected);
  return result;
}

JNIEXPORT void JNICALL
Java_expo_modules_koreanspell_KiwiNative_nativeUnload(JNIEnv*, jobject) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (gKiwi != nullptr) {
    kiwi_close(gKiwi);
    gKiwi = nullptr;
  }
  gAssets = nullptr;
}

JNIEXPORT jstring JNICALL
Java_expo_modules_koreanspell_KiwiNative_nativeLastError(JNIEnv* env, jobject) {
  std::lock_guard<std::mutex> lock(gMutex);
  return env->NewStringUTF(gError.c_str());
}

}  // extern "C"
