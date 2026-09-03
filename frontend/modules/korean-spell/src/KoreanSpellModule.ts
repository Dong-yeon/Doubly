import { NativeModule, requireNativeModule } from 'expo';

declare class KoreanSpellModule extends NativeModule<{}> {
  // ── 사전 검사(Hunspell) — 채팅 맞춤법 파이프라인의 2층 ──
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

  // ── 띄어쓰기 교정(Kiwi) — 별개 모델. 채팅에는 쓰지 않는다 ──
  /**
   * 띄어쓰기 모델을 준비한다. 3초쯤 걸리고 240MB 를 쓴다 — 글 쓰는 화면에 들어올 때
   * 미리 부르고, 나갈 때 {@link unloadSpacing} 으로 반드시 내린다.
   *
   * <p>32비트 기기에는 모델이 없어 실패한다(맞춤법 검사는 그대로 동작한다).
   */
  loadSpacing(): Promise<boolean>;
  /** 띄어쓰기 모델이 준비됐는가 */
  isSpacingLoaded(): boolean;
  /** 띄어쓰기를 고친 문장. 준비 전이면 원문 그대로 (문장당 1ms 내외) */
  correctSpacing(text: string): Promise<string>;
  /** 띄어쓰기 모델을 내린다 — 240MB 를 돌려준다 */
  unloadSpacing(): Promise<void>;
}

export default requireNativeModule<KoreanSpellModule>('KoreanSpell');
