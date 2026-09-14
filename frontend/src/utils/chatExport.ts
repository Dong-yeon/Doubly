/**
 * 대화 내보내기 — 네이티브 구현(임시 파일 + 공유 시트).
 *
 * <p><b>왜 파일을 나눴나</b>: `expo-file-system` 의 `File`/`Paths` 와 `expo-sharing` 은
 * 네이티브 모듈이라, 최상단 import 만으로 웹 번들에 실린다. `iap.web.ts` 주석이 적은 그대로
 * 런타임 분기로는 못 줄이고, 웹에서는 저장 방식 자체가 다르다(공유 시트가 아니라 Blob
 * 다운로드). 그래서 `chatExport.web.ts` 로 갈랐고, 텍스트 조립은 `chatTranscript.ts` 에
 * 한 벌만 둔다.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { transcriptFileName } from './chatTranscript';

export { buildChatTranscript } from './chatTranscript';

/** 내보내기가 가능한 기기인가. 네이티브는 공유 시트 유무에 달렸다. */
export async function canExportTranscript(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

/** 텍스트를 임시 파일로 저장하고 공유 시트를 연다. 가능 여부는 호출자가 미리 확인한다. */
export async function shareTranscript(text: string, relationId: number): Promise<void> {
  const file = new File(Paths.cache, transcriptFileName(relationId));
  file.create({ overwrite: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: '대화 내보내기' });
}
