package expo.modules.koreanspell

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Hunspell 사전 검사를 JS 로 노출한다.
 *
 * <p>Hunspell 은 파일 경로만 받는데 APK 안의 asset 은 경로로 열 수 없다 — 그래서
 * 첫 실행 때 한 번 앱 내부 저장소로 꺼내둔다(약 14MB).
 */
class KoreanSpellModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext) { "React context 가 없습니다" }

  override fun definition() = ModuleDefinition {
    Name("KoreanSpell")

    /**
     * 사전을 준비한다. 실기기에서 1.5초쯤 걸리고 50MB 넘게 쓰므로 반드시 미리,
     * 그리고 화면을 막지 않는 자리에서 불러야 한다.
     */
    AsyncFunction("load") {
      val dir = File(context.filesDir, DICT_DIR).apply { mkdirs() }
      val aff = extractAsset(AFF_NAME, dir)
      val dic = extractAsset(DIC_NAME, dir)

      if (!HunspellNative.nativeLoad(aff.absolutePath, dic.absolutePath)) {
        throw DictionaryLoadException(HunspellNative.nativeLastError())
      }
      true
    }

    Function("isLoaded") {
      HunspellNative.nativeIsLoaded()
    }

    /** 어절 여러 개를 한 번에 — 문장 하나당 브리지를 한 번만 넘는다 */
    Function("spellMany") { words: List<String> ->
      HunspellNative.nativeSpellMany(words.toTypedArray()).toList()
    }

    /** 후보 계산은 단어당 5ms 쯤 걸린다 — 틀린 어절에만 부른다 */
    AsyncFunction("suggest") { word: String ->
      HunspellNative.nativeSuggest(word).toList()
    }

    /** 메모리를 돌려준다. 다시 쓰려면 load 를 다시 불러야 한다 */
    AsyncFunction("unload") {
      HunspellNative.nativeUnload()
    }
  }

  /**
   * asset 을 내부 저장소로 꺼낸다. 이미 같은 크기로 꺼내둔 게 있으면 건너뛴다 —
   * 앱을 열 때마다 14MB 를 다시 쓰지 않기 위해서다.
   */
  private fun extractAsset(name: String, dir: File): File {
    val target = File(dir, name)
    val expectedSize = context.assets.openFd(name).use { it.length }

    if (target.exists() && target.length() == expectedSize) return target

    // 복사 도중에 앱이 죽으면 잘린 파일이 남아 다음 실행 때 조용히 오작동한다 —
    // 임시 파일에 다 쓴 뒤에 이름을 바꾼다.
    val temp = File(dir, "$name.tmp")
    context.assets.open(name).use { input ->
      temp.outputStream().use { output -> input.copyTo(output) }
    }
    if (!temp.renameTo(target)) {
      temp.delete()
      throw DictionaryLoadException("사전 파일을 저장하지 못했습니다: $name")
    }
    return target
  }

  private companion object {
    const val DICT_DIR = "korean-spell"
    const val AFF_NAME = "ko.aff"
    const val DIC_NAME = "ko.dic"
  }
}

internal class DictionaryLoadException(reason: String) :
  CodedException("한국어 사전을 불러오지 못했습니다: $reason")
