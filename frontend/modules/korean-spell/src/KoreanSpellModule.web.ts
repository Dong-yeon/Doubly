import { registerWebModule, NativeModule } from 'expo';

/**
 * 웹에는 네이티브 사전이 없다 — 아무것도 지적하지 않는 빈 구현을 둔다.
 * 웹에서도 정규식 엔진(1층)은 그대로 동작하므로 검사 기능 자체가 사라지진 않는다.
 */
class KoreanSpellModule extends NativeModule<{}> {
  async load(): Promise<boolean> {
    return false;
  }
  isLoaded(): boolean {
    return false;
  }
  spellMany(words: string[]): boolean[] {
    return words.map(() => true);
  }
  async suggest(): Promise<string[]> {
    return [];
  }
  async unload(): Promise<void> {}
}

export default registerWebModule(KoreanSpellModule, 'KoreanSpellModule');
