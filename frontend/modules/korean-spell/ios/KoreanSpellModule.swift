import ExpoModulesCore

public class KoreanSpellModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KoreanSpell")

    Function("hello") {
      return "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { (value: String) in
    }
  }
}
