/**
 * 콜드 스타트 + 포그라운드 복귀 때 status.json 을 다시 읽는다(store/serviceStatusStore).
 *
 * <p>await 하지 않는다 — 공지를 읽느라 앱 기동이 한 순간이라도 늦어지면 안 된다.
 * 웹도 같은 경로다(react-native-web 의 AppState 는 visibilitychange 를 따른다).
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useServiceStatusStore } from '../store/serviceStatusStore';

export function useServiceStatusSync() {
  useEffect(() => {
    const refresh = useServiceStatusStore.getState().refresh;
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, []);
}
