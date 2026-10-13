/**
 * 연습 판 진도 — 튜토리얼을 끝냈는지를 기기에 남긴다(docs/game-practice-tutorial_2026-10-13.md §2).
 * 끝내기 전엔 연습 화면이 튜토리얼부터, 끝낸 뒤엔 AI 대전부터 열린다. 서버에는 올리지 않는다 — 연습은 기기 안의 일이다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PracticeGameKey = 'QUARTO' | 'OMOK' | 'WALL_RACE';

const KEY = (game: PracticeGameKey) => `doubly.practice.${game}.tutorialDone`;

export async function isTutorialDone(game: PracticeGameKey): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY(game))) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone(game: PracticeGameKey): void {
  AsyncStorage.setItem(KEY(game), '1').catch(() => undefined);
}
