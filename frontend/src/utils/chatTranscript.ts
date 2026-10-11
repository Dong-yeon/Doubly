/**
 * 대화 내보내기 — 텍스트 조립(플랫폼 무관).
 * docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 5순위 두 번째 항목.
 *
 * <p>발신자 이름표("나" vs 상대 이름)는 화면이 아는 정보(myId)라 여기서 조립한다 —
 * 백엔드 ChatExportResponse 는 원본 메시지만 내려준다(ChatExportResponse 주석 참고).
 * 사진/음성/스티커 등은 messagePreview 로 사람이 읽는 문구로 바꾼다 — 카톡 내보내기가
 * 이미지를 "사진"으로 적는 것과 같다(실제 파일을 함께 담지는 않는다).
 *
 * <p><b>왜 chatExport 에서 떼어냈나</b>: 저장 경로가 네이티브(공유 시트)와 웹(Blob 다운로드)로
 * 갈라져 `chatExport.ts` / `chatExport.web.ts` 로 파일을 나눴다. 순수 함수까지 양쪽에 복사하면
 * 한쪽만 고치는 사고가 나므로 여기 한 벌만 둔다.
 */
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

/** 저장 파일명 — 네이티브 캐시 파일과 웹 다운로드가 같은 이름을 쓴다. */
export function transcriptFileName(relationId: number): string {
  return `doubly-chat-${relationId}-${Date.now()}.txt`;
}
