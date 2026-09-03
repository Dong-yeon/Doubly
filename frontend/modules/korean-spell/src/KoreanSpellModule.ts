import { NativeModule, requireNativeModule } from 'expo';

declare class KoreanSpellModule extends NativeModule<{}> {
  /** 사전을 준비한다. 1.5초쯤 걸리므로 화면을 막지 않는 자리에서 부른다 */
  load(): Promise<boolean>;
  /** 사전이 준비됐는가 */
  isLoaded(): boolean;
  /** 어절 여러 개를 한 번에 검사한다 — true 면 사전에 있는 말 */
  spellMany(words: string[]): boolean[];
  /** 고침 후보. 틀린 어절에만 부른다(단어당 5ms 쯤) */
  suggest(word: string): Promise<string[]>;
  /** 사전을 내리고 메모리를 돌려준다 */
  unload(): Promise<void>;
}

export default requireNativeModule<KoreanSpellModule>('KoreanSpell');
