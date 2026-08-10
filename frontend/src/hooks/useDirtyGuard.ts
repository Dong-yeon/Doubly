/**
 * 작성 중 이탈 가드 — 헤더 뒤로가기·하드웨어 백·스와이프백·모달 스와이프 닫기를
 * 한 곳에서 막는다 (react-navigation usePreventRemove).
 *
 * <p>왜 필요한가: 폼 화면은 어느 경로로 나가든 입력이 통째로 사라진다. 화면마다
 * 버튼에만 확인을 붙이면 제스처·하드웨어 백 경로가 빠진다 — 실제로 운동 세션이
 * 하단 "종료" 버튼에만 확인이 있어 뒤로가기로 나가면 세트가 전부 유실됐다.
 *
 * <p>저장 성공 뒤에는 확인 없이 나가야 하므로, 반환된 allowLeave() 를 goBack
 * 직전에 호출한다 — 이후의 이탈은 확인 없이 통과한다.
 *
 * 사용:
 * <pre>
 *   const allowLeave = useDirtyGuard(dirty);
 *   ...
 *   await save(...);
 *   allowLeave();
 *   navigation.goBack();
 * </pre>
 */
import { useCallback, useRef } from 'react';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { Alert } from '../utils/alert';

interface DirtyGuardOptions {
  title?: string;
  message?: string;
  /** 머무르기 버튼 라벨 (기본: 계속 쓰기) */
  stayText?: string;
  /** 나가기 버튼 라벨 (기본: 나가기) */
  leaveText?: string;
}

export function useDirtyGuard(dirty: boolean, options?: DirtyGuardOptions): () => void {
  const navigation = useNavigation();
  const bypassRef = useRef(false);

  usePreventRemove(dirty, ({ data }) => {
    // 저장 완료 등 의도된 이탈 — 확인 없이 원래 액션을 그대로 실행
    if (bypassRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      options?.title ?? '작성 중인 내용이 있어요',
      options?.message ?? '지금 나가면 입력한 내용이 사라져요.',
      [
        { text: options?.stayText ?? '계속 쓰기', style: 'cancel' },
        {
          text: options?.leaveText ?? '나가기',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

  return useCallback(() => {
    bypassRef.current = true;
  }, []);
}
