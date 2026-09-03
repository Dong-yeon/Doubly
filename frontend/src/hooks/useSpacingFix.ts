/**
 * 띄어쓰기 정리 훅 — 모델 수명과 되돌리기를 함께 관리한다.
 *
 * <p>모델이 3~4초 로딩에 240MB 를 쓴다. 그래서 <b>화면에 들어올 때 미리 올리고
 * 나갈 때 반드시 내린다</b> — 안 내리면 채팅으로 돌아간 뒤에도 240MB 를 붙들고 있다.
 * 미리 올려두는 덕분에 사용자가 버튼을 누를 땐 이미 준비돼 있는 경우가 대부분이다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { correctSpacing, loadSpacing, unloadSpacing } from '../utils/koreanSpacing';

interface Result {
  /** 준비 중이거나 교정 중 */
  busy: boolean;
  /** 방금 고쳐서 되돌릴 수 있는 상태 */
  canUndo: boolean;
  /** 눌렀을 때 — 고친 문장을 돌려준다(바뀐 게 없으면 null) */
  fix: (text: string) => Promise<string | null>;
  /** 고치기 직전 문장 (없으면 null) */
  undo: () => string | null;
  /** 사용자가 글을 더 고쳤을 때 되돌리기를 거둔다 */
  clearUndo: () => void;
}

export function useSpacingFix(): Result {
  const [busy, setBusy] = useState(false);
  const beforeRef = useRef<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  /*
   * 화면에 있는 동안만 모델을 물고 있는다. useFocusEffect 라 탭 이동·뒤로가기에도
   * 정리되고, 화면을 벗어나면 240MB 가 바로 돌아온다.
   */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadSpacing().then(() => {
        if (!alive) void unloadSpacing();
      });
      return () => {
        alive = false;
        void unloadSpacing();
      };
    }, []),
  );

  const fix = useCallback(async (text: string) => {
    setBusy(true);
    try {
      // 화면 진입 때 이미 시작했지만, 아직 안 끝났으면 여기서 기다린다
      const ready = await loadSpacing();
      if (!ready) return null;

      const corrected = await correctSpacing(text);
      if (corrected === text) return null;

      beforeRef.current = text;
      setCanUndo(true);
      return corrected;
    } finally {
      setBusy(false);
    }
  }, []);

  const undo = useCallback(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    setCanUndo(false);
    return before;
  }, []);

  const clearUndo = useCallback(() => {
    beforeRef.current = null;
    setCanUndo(false);
  }, []);

  useEffect(() => () => {
    beforeRef.current = null;
  }, []);

  return { busy, canUndo, fix, undo, clearUndo };
}
