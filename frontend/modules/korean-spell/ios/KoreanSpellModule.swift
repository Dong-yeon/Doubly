import ExpoModulesCore

/**
 * Hunspell 사전 검사를 JS 로 노출한다(안드로이드 쪽과 같은 인터페이스).
 *
 * 안드로이드는 APK 안의 asset 을 경로로 열 수 없어 파일로 꺼내야 하지만,
 * iOS 는 번들 안이 이미 실제 경로라 그대로 넘기면 된다.
 */
public class KoreanSpellModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KoreanSpell")

    AsyncFunction("load") { () -> Bool in
      guard let aff = Bundle.main.path(forResource: "ko", ofType: "aff"),
            let dic = Bundle.main.path(forResource: "ko", ofType: "dic") else {
        throw DictionaryLoadException("사전 파일이 번들에 없습니다")
      }
      if !KoreanSpellBridge.load(withAff: aff, dic: dic) {
        throw DictionaryLoadException(KoreanSpellBridge.lastError())
      }
      return true
    }

    Function("isLoaded") { () -> Bool in
      KoreanSpellBridge.isLoaded()
    }

    Function("spellMany") { (words: [String]) -> [Bool] in
      KoreanSpellBridge.spellMany(words).map { $0.boolValue }
    }

    AsyncFunction("suggest") { (word: String) -> [String] in
      KoreanSpellBridge.suggest(word)
    }

    AsyncFunction("unload") {
      KoreanSpellBridge.unload()
    }
  }
}

internal final class DictionaryLoadException: GenericException<String> {
  override var reason: String {
    "한국어 사전을 불러오지 못했습니다: \(param)"
  }
}
