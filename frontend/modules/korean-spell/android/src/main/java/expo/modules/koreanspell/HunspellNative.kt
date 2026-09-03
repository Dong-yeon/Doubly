package expo.modules.koreanspell

/**
 * C++ 쪽 진입점. 함수 이름을 바꾸면 `android/src/main/cpp/jni.cpp` 의 심볼 이름도
 * 같이 바꿔야 한다 — 어긋나도 컴파일은 통과하고 실행할 때 UnsatisfiedLinkError 로만
 * 드러난다.
 */
internal object HunspellNative {
  init {
    System.loadLibrary("koreanspell")
  }

  external fun nativeLoad(affPath: String, dicPath: String): Boolean

  external fun nativeIsLoaded(): Boolean

  external fun nativeSpellMany(words: Array<String>): BooleanArray

  external fun nativeSuggest(word: String): Array<String>

  external fun nativeUnload()

  external fun nativeLastError(): String
}
