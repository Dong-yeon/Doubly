/**
 * 오늘 물을 보여 주는 화면(홈 물컵·럽바디 물 줄)의 공통 수명 — 들어올 때 읽고, 떠날 때 안 보낸 탭을 바로 보낸다.
 * 앱이 뒤로 가면 보내고, 돌아오면 다시 읽는다(자정 넘김·상대가 마신 양). 값과 큐는 store/waterStore 하나다.
 */
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useWaterStore } from '../store/waterStore';

/**
 * @param load false 면 이 훅은 읽지 않고 보내기만 한다 — 홈은 커플 연결 전(물컵이 없다), 럽바디는 자기 새로고침
 *   묶음(refreshExtras)이 이미 읽는다. 떠날 때·뒤로 갈 때 보내기는 언제나 한다.
 */
export function useWaterSync({ load = true }: { load?: boolean } = {}) {
  const reload = useCallback(() => {
    if (!load) return;
    useWaterStore.getState().load().catch(() => undefined); // 못 읽으면 마지막 값을 그대로 둔다
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {
        void useWaterStore.getState().flush();
      };
    }, [reload]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') reload();
      else void useWaterStore.getState().flush();
    });
    return () => sub.remove();
  }, [reload]);

  return reload;
}
