/**
 * 기록 내보내기가 기기에 남기는 폴더 — 위치와 지우기만 따로 둔다.
 *
 * <p>로그아웃이 이 폴더를 지워야 하는데, `recordExport` 를 그대로 끌어오면 ZIP 작성기·문서 생성기까지
 * 앱 시작 경로(authStore)에 실린다. 그래서 지우는 데 필요한 것만 여기 있다.
 */
import { Directory, Paths } from 'expo-file-system';

/** 문서 폴더 아래 — 캐시는 OS 가 말없이 지워 이어받기가 처음부터가 된다(recordExport 머리 주석). */
export const exportRoot = () => new Directory(Paths.document, 'dubly-export');

/**
 * 남은 임시 파일·ZIP 을 모두 지운다.
 *
 * <p>로그아웃 때도 부른다 — 폴더는 계정과 무관한 기기 공용 위치라, 남겨 두면 같은 기기로 로그인한
 * 다음 계정에게 이전 계정의 ZIP(사진·채팅 포함)이 "만들어 둔 파일"로 보였다(docs/my-current-state.md §7-4).
 */
export function discardExportFiles(): void {
  try {
    const dir = exportRoot();
    if (dir.exists) dir.delete();
  } catch {
    // 지우지 못해도 다음 시작 때 덮어쓰고, 다른 계정의 상태는 pendingExport 가 걸러낸다
  }
}
