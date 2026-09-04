/**
 * 대화 내보내기 — 텍스트 조립 + 파일 저장 + 공유 시트.
 * docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 5순위 두 번째 항목.
 *
 * <p>발신자 이름표("나" vs 상대 이름)는 화면이 아는 정보(myId)라 여기서 조립한다 —
 * 백엔드 ChatExportResponse 는 원본 메시지만 내려준다(ChatExportResponse 주석 참고).
 * 사진/음성/스티커 등은 messagePreview 로 사람이 읽는 문구로 바꾼다 — 카톡 내보내기가
 * 이미지를 "사진"으로 적는 것과 같다(실제 파일을 함께 담지는 않는다).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ChatMessage } from '../types';
import { messagePreview } from './messagePreview';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function timestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 메시지 목록(오래된순) → 카톡 내보내기 스타일 텍스트 한 줄씩. */
export function buildChatTranscript(messages: ChatMessage[], myId: number | undefined, myLabel: string, partnerLabel: string): string {
  const lines = messages.map((m) => {
    const sender = m.senderId === myId ? myLabel : partnerLabel;
    const body = m.deleted ? '삭제된 메시지' : messagePreview(m.messageType, m.content);
    return `[${timestamp(m.createdAt)}] ${sender}: ${body}`;
  });
  return lines.join('\n');
}

/** 텍스트를 임시 파일로 저장하고 공유 시트를 연다. 공유 가능 여부는 호출자가 미리 확인한다. */
export async function shareTranscript(text: string, relationId: number): Promise<void> {
  const file = new File(Paths.cache, `doubly-chat-${relationId}-${Date.now()}.txt`);
  file.create({ overwrite: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: '대화 내보내기' });
}
