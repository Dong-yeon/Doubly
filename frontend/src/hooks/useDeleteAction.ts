/**
 * 삭제 흐름 in-flight 가드 — 롱프레스 → Alert → API 패턴 전부에 반복되던
 * "삭제 중인지 알 수 없고, 느린 네트워크에서 재차 눌러 중복 DELETE 가능" 문제를
 * 한 곳에서 막는다 (QA_CHECKLIST.md 전역 반복 패턴 7).
 *
 * 사용:
 * <pre>
 *   const { deletingId, runDelete } = useDeleteAction<number>();
 *   ...
 *   Alert.alert('삭제', '...', [
 *     { text: '취소', style: 'cancel' },
 *     { text: '삭제', style: 'destructive', onPress: () => runDelete(item.id, () => api.remove(item.id)) },
 *   ]);
 *   ...
 *   <TouchableOpacity
 *     style={[styles.row, deletingId === item.id && styles.rowDeleting]}
 *     disabled={deletingId === item.id}
 *     onLongPress={() => onDelete(item)}
 *   >
 * </pre>
 */
import { useCallback, useState } from 'react';
import { getErrorMessage } from '../utils/error';
import { toast } from '../store/toastStore';

export function useDeleteAction<Id = number>() {
  const [deletingId, setDeletingId] = useState<Id | null>(null);

  /**
   * id 를 삭제 중으로 표시하고 action 을 실행한다. 이미 삭제가 진행 중이면
   * (같은 id 든 다른 id 든) 무시해 연타로 인한 중복 요청을 막는다.
   * action 이 실패하면 기본 에러 토스트를 띄운다 — 화면마다 다른 안내가
   * 필요하면 action 내부에서 직접 catch 해서 처리하고 다시 던지지 않으면 된다.
   */
  const runDelete = useCallback(async (id: Id, action: () => Promise<void>, errorMessage?: string) => {
    if (deletingId != null) return;
    setDeletingId(id);
    try {
      await action();
    } catch (e) {
      toast.error(getErrorMessage(e, errorMessage ?? '삭제하지 못했어요.'));
    } finally {
      setDeletingId(null);
    }
  }, [deletingId]);

  return { deletingId, runDelete };
}
