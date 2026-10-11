/**
 * 대화 내보내기 — 웹 구현(Blob 다운로드).
 *
 * <p>네이티브는 캐시 파일 + 공유 시트지만, 브라우저에는 공유 시트가 없다. `navigator.share`
 * 는 파일 공유 지원이 데스크톱에서 들쭉날쭉해 쓰지 않고, 가장 확실한 경로인 `a[download]`
 * 로 바로 내려받는다 — PC 에서는 이게 오히려 자연스럽다(다운로드 폴더에 .txt 가 떨어진다).
 *
 * <p>`chatExport.ts` 가 끌어오는 `expo-file-system`·`expo-sharing` 이 웹 번들에서 아예 빠지는
 * 것도 이 파일의 목적이다. 자세한 이유는 `iap.web.ts` 주석 참고.
 */
import { transcriptFileName } from './chatTranscript';

/**
 * UTF-8 BOM. 윈도우 메모장·엑셀이 UTF-8 .txt 를 EUC-KR 로 읽어 한글이 깨지는 걸 막는다.
 * 문자 그대로 적으면 편집기에서 보이지 않아 실수로 지워지므로 코드포인트로 만든다.
 */
const BOM = String.fromCharCode(0xfeff);

export { buildChatTranscript } from './chatTranscript';

/** 웹은 Blob 다운로드라 항상 가능하다. */
export async function canExportTranscript(): Promise<boolean> {
  return true;
}

/** 텍스트를 .txt 파일로 내려받는다. */
export async function shareTranscript(text: string, relationId: number): Promise<void> {
  const blob = new Blob([BOM, text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = transcriptFileName(relationId);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 클릭 직후 해제하면 다운로드가 시작되기 전에 URL 이 죽는 브라우저가 있어 한 틱 미룬다.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
