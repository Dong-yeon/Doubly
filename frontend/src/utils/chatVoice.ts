/** VOICE_MESSAGE content 파싱 — 형식은 "{audioUrl}|{durationSec}"(MessageType.java 주석 참고) */
export interface ParsedVoiceMessage {
  url: string;
  durationSec: number;
}

export function parseVoiceContent(content: string | null | undefined): ParsedVoiceMessage | null {
  if (!content) return null;
  const idx = content.lastIndexOf('|');
  if (idx === -1) return null;
  const url = content.slice(0, idx);
  const durationSec = Number(content.slice(idx + 1));
  if (!url || Number.isNaN(durationSec)) return null;
  return { url, durationSec };
}

/** 초 → "0:07" 형식 — VoiceClipsScreen.formatSeconds 와 같은 규칙(밀리초 대신 초 단위) */
export function formatVoiceDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `0:${String(s).padStart(2, '0')}`;
}
