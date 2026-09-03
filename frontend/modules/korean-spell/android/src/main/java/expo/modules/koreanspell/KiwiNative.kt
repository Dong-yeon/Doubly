package expo.modules.koreanspell

import android.content.res.AssetManager

/**
 * Kiwi 띄어쓰기 교정의 C++ 진입점. 이름을 바꾸면 `android/src/main/cpp/kiwi_jni.cpp` 의
 * 심볼도 같이 바꿔야 한다 — 어긋나도 컴파일은 통과하고 실행할 때 드러난다.
 *
 * <p>Hunspell 과 같은 .so(libkoreanspell)에 들어 있다. 그래도 여기서 따로
 * loadLibrary 를 부른다 — HunspellNative 를 한 번도 안 건드린 채 띄어쓰기부터
 * 쓰는 경로가 실제로 있고(글 쓰는 화면은 맞춤법 검사를 안 쓴다), 그때 라이브러리가
 * 안 올라가 UnsatisfiedLinkError 로 죽었다. loadLibrary 는 여러 번 불러도 안전하다.
 */
internal object KiwiNative {
  init {
    System.loadLibrary("koreanspell")
  }

  external fun nativeLoad(assets: AssetManager, assetDir: String, options: Int): Boolean

  external fun nativeIsLoaded(): Boolean

  external fun nativeCorrect(text: String): String

  external fun nativeUnload()

  external fun nativeLastError(): String
}
