/**
 * Kotlin ↔ C++ 다리. 실제 로직은 전부 {@code cpp/KoreanSpellCore.cpp} 에 있고
 * 여기서는 문자열 변환만 한다.
 *
 * <p>심볼 이름은 {@code Java_<패키지>_<클래스>_<메서드>} 규칙을 따른다 —
 * Kotlin 쪽 {@code HunspellNative} object 와 이름이 어긋나면 런타임에
 * UnsatisfiedLinkError 로만 드러나므로 양쪽을 함께 고쳐야 한다.
 */
#include <jni.h>

#include <string>
#include <vector>

#include "KoreanSpellCore.h"

namespace {

std::string toStdString(JNIEnv* env, jstring value) {
  if (value == nullptr) return {};
  const char* utf = env->GetStringUTFChars(value, nullptr);
  std::string result(utf != nullptr ? utf : "");
  if (utf != nullptr) env->ReleaseStringUTFChars(value, utf);
  return result;
}

}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_expo_modules_koreanspell_HunspellNative_nativeLoad(JNIEnv* env, jobject, jstring aff, jstring dic) {
  return koreanspell::load(toStdString(env, aff), toStdString(env, dic)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_koreanspell_HunspellNative_nativeIsLoaded(JNIEnv*, jobject) {
  return koreanspell::isLoaded() ? JNI_TRUE : JNI_FALSE;
}

/**
 * 어절 여러 개를 한 번에 검사한다 — 문장 하나에 어절 수만큼 JNI 를 넘나들지 않도록.
 * 검사 자체는 단어당 0.005ms 라서 왕복 비용이 오히려 더 크다.
 */
JNIEXPORT jbooleanArray JNICALL
Java_expo_modules_koreanspell_HunspellNative_nativeSpellMany(JNIEnv* env, jobject, jobjectArray words) {
  const jsize count = words != nullptr ? env->GetArrayLength(words) : 0;
  jbooleanArray result = env->NewBooleanArray(count);
  if (result == nullptr) return nullptr;

  std::vector<jboolean> flags(static_cast<size_t>(count));
  for (jsize i = 0; i < count; i++) {
    auto word = reinterpret_cast<jstring>(env->GetObjectArrayElement(words, i));
    flags[static_cast<size_t>(i)] = koreanspell::spell(toStdString(env, word)) ? JNI_TRUE : JNI_FALSE;
    env->DeleteLocalRef(word);
  }
  env->SetBooleanArrayRegion(result, 0, count, flags.data());
  return result;
}

JNIEXPORT jobjectArray JNICALL
Java_expo_modules_koreanspell_HunspellNative_nativeSuggest(JNIEnv* env, jobject, jstring word) {
  const std::vector<std::string> suggestions = koreanspell::suggest(toStdString(env, word));
  jclass stringClass = env->FindClass("java/lang/String");
  jobjectArray result =
      env->NewObjectArray(static_cast<jsize>(suggestions.size()), stringClass, nullptr);
  if (result == nullptr) return nullptr;

  for (size_t i = 0; i < suggestions.size(); i++) {
    jstring item = env->NewStringUTF(suggestions[i].c_str());
    env->SetObjectArrayElement(result, static_cast<jsize>(i), item);
    env->DeleteLocalRef(item);
  }
  return result;
}

JNIEXPORT void JNICALL
Java_expo_modules_koreanspell_HunspellNative_nativeUnload(JNIEnv*, jobject) {
  koreanspell::unload();
}

JNIEXPORT jstring JNICALL
Java_expo_modules_koreanspell_HunspellNative_nativeLastError(JNIEnv* env, jobject) {
  return env->NewStringUTF(koreanspell::lastError().c_str());
}

}  // extern "C"
