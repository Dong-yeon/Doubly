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
      val dir = File(context.filesDir, "$DICT_DIR/$DICT_VERSION").apply { mkdirs() }
      removeOtherVersions(dir)
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

    /*
     * 아래는 띄어쓰기 교정(Kiwi) — 위 사전 검사와는 완전히 별개다. 모델도 다르고
     * 쓰는 화면도 다르다.
     *
     * <b>채팅에는 쓰지 않는다.</b> 커플 채팅에서는 "오늘 시간돼?" 처럼 붙여 쓰는 게
     * 말투라 띄어쓰기를 지적하면 그 자체가 오탐이 된다. 리뷰·일기처럼 문장을 쓰는
     * 화면에서만 부른다.
     */
    AsyncFunction("loadSpacing") {
      try {
        if (!KiwiNative.nativeLoad(context.assets, KIWI_ASSET_DIR, KIWI_BUILD_OPTIONS)) {
          throw SpacingLoadException(KiwiNative.nativeLastError())
        }
        true
      } catch (e: UnsatisfiedLinkError) {
        // 64비트 ABI 에만 Kiwi 를 넣었다 — 32비트 기기는 여기로 온다
        throw SpacingLoadException("이 기기에서는 띄어쓰기 교정을 쓸 수 없어요")
      }
    }

    Function("isSpacingLoaded") {
      try {
        KiwiNative.nativeIsLoaded()
      } catch (e: UnsatisfiedLinkError) {
        false
      }
    }

    /** 교정 자체는 문장당 1ms 내외다 — 비용은 전부 loadSpacing 에 있다 */
    AsyncFunction("correctSpacing") { text: String ->
      try {
        KiwiNative.nativeCorrect(text)
      } catch (e: UnsatisfiedLinkError) {
        text
      }
    }

    /** 모델이 240MB 를 쓴다 — 글 쓰는 화면을 벗어나면 반드시 내린다 */
    AsyncFunction("unloadSpacing") {
      try {
        KiwiNative.nativeUnload()
      } catch (e: UnsatisfiedLinkError) {
        // 애초에 안 올라갔으니 내릴 것도 없다
      }
    }
  }

  /**
   * asset 을 내부 저장소로 꺼낸다. 이미 꺼내둔 게 있으면 건너뛴다 — 앱을 열 때마다
   * 14MB 를 다시 쓰지 않기 위해서다.
   *
   * <p>"이미 꺼냈는지"를 크기 비교로 판단하지 않는다. asset 의 원본 크기를 알려면
   * `openFd` 가 필요한데, APK 안에서 압축된 asset 은 파일 디스크립터로 열 수 없어
   * `FileNotFoundException: ... it is probably compressed` 로 죽는다(실기기 확인).
   * `.aff`/`.dic` 은 텍스트라 aapt 가 반드시 압축한다. 대신 사전 버전을 디렉토리
   * 이름에 박아 구분하고, 아래처럼 임시 파일에 다 쓴 뒤 이름을 바꾼다 — rename 이
   * 원자적이라 <b>파일이 있다는 것 자체가 완전히 꺼내졌다는 뜻</b>이 된다.
   */
  private fun extractAsset(name: String, dir: File): File {
    val target = File(dir, name)
    if (target.exists()) return target

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

  /** 사전을 새 버전으로 올리면 옛 버전 폴더가 14MB 를 그대로 붙들고 있다 — 지운다 */
  private fun removeOtherVersions(current: File) {
    val root = File(context.filesDir, DICT_DIR)
    root.listFiles()?.forEach { child ->
      if (child.isDirectory && child.name != current.name) child.deleteRecursively()
    }
  }

  private companion object {
    const val DICT_DIR = "korean-spell"
    /** 꺼내둔 사전이 지금 앱의 사전인지 가리는 값 — dict/ 를 갈면 여기도 올린다 */
    const val DICT_VERSION = "0.7.94"
    const val AFF_NAME = "ko.aff"
    const val DIC_NAME = "ko.dic"

    /** Kiwi 모델이 들어있는 asset 경로 (build.gradle 의 assets.srcDirs 참고) */
    const val KIWI_ASSET_DIR = "kiwi"

    /*
     * KIWI_BUILD_INTEGRATE_ALLOMORPH(1) + LOAD_DEFAULT_DICT(2) + LOAD_TYPO_DICT(4).
     * 기본값 15 는 multi.dict 까지 읽는데, 그걸 빼면 로딩이 절반으로 줄고 메모리가
     * 155MB 덜 드는데 띄어쓰기 품질은 같았다(실기기 측정, docs 참고).
     */
    const val KIWI_BUILD_OPTIONS = 7
  }
}

internal class DictionaryLoadException(reason: String) :
  CodedException("한국어 사전을 불러오지 못했습니다: $reason")

internal class SpacingLoadException(reason: String) :
  CodedException("띄어쓰기 모델을 불러오지 못했습니다: $reason")
