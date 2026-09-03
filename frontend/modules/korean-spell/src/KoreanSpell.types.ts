/** 사전 검사 결과 — 어절 하나에 대한 판정 */
export interface DictionaryVerdict {
  /** 검사한 어절 */
  word: string;
  /** 사전에 있는 말인가 */
  known: boolean;
}
