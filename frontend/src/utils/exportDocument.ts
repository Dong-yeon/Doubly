/**
 * 기록 내보내기 ZIP 안의 사람이 읽는 문서 — index.html · chat.txt · README.txt (플랫폼 무관).
 *
 * <p>data/*.json 은 서버가 준 행 그대로(기계용)이고, 이 파일은 그걸 <b>압축만 풀면 열리는</b>
 * 모양으로 바꾼다. 앱이 없어져도, 인터넷이 없어도 읽혀야 하므로 index.html 은 외부 스크립트·
 * 스타일 없이 한 파일이고 사진은 ZIP 안의 상대 경로를 가리킨다.
 *
 * <p>행은 스키마 그대로라 섹션마다 화면을 따로 짜지 않는다 — 제목·날짜·작성자로 쓸 컬럼을
 * 후보 목록에서 고르고 나머지 값은 한 줄로 붙인다. 새 컬럼이 생겨도 저절로 나온다.
 */
import type { MessageType } from '../types';
import { messagePreview } from './messagePreview';

type Row = Record<string, unknown>;

/** 섹션 키 → 사람이 읽는 이름. 순서가 곧 index.html 의 순서다. */
export const SECTION_LABELS: Record<string, string> = {
  couple: '우리 둘',
  members: '사람',
  feed_posts: '우리 기록',
  feed_post_photos: '우리 기록 사진',
  feed_comments: '우리 기록 댓글',
  trips: '여행',
  trip_items: '여행 일정',
  trip_expenses: '여행 지출',
  trip_checklist_items: '여행 준비물',
  places: '럽슐랭 장소',
  place_visits: '럽슐랭 방문 기록',
  place_ratings: '럽슐랭 평가',
  contents: '콘텐츠',
  content_logs: '콘텐츠 감상 기록',
  content_ratings: '콘텐츠 평가',
  chat_messages: '채팅',
  daily_answers: '오늘의 질문 답변',
  couple_events: '기념일·일정',
  mood_statuses: '무드',
  couple_challenges: '챌린지',
  couple_emojis: '우리 이모지',
  workout_boosters: '운동 응원 음성',
  profile: '내 정보',
  meals: '식단',
  meal_items: '식단 음식',
  workouts: '운동',
  workout_sets: '운동 종목',
  workout_set_entries: '운동 세트',
  body_metrics: '신체 기록',
  voice_clips: '음성 클립',
  water_logs: '물 마시기',
  fasting_sessions: '단식',
  journal_entries: '나만의 하루 기록',
};

export function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key;
}

const TITLE_KEYS = ['title', 'name', 'content', 'body', 'answer', 'message', 'phrase', 'emotion', 'stake', 'emoji', 'exercise_name'];
const DATE_KEYS = [
  'event_date', 'journal_date', 'visited_at', 'watched_at', 'meal_date', 'workout_date', 'measured_date', 'log_date',
  'question_date', 'start_date', 'started_at', 'connected_at', 'created_at',
];
const AUTHOR_KEYS = ['author_id', 'sender_id', 'user_id', 'created_by', 'subject_user_id'];
/** 본문에 다시 늘어놓지 않는 컬럼 — 식별자·내부 표식 */
const HIDDEN = /(^id$|_id$|_url$|^url$|_at$|_by$|^deleted|^client_|^order_no$)/;

function esc(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function first(row: Row, keys: string[]): [string, unknown] | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && v !== '') return [k, v];
  }
  return null;
}

/** "2026-10-01T12:30:00" → "2026-10-01 12:30" — 서버 값이 이미 KST 벽시계라 변환하지 않는다. */
function shortDate(v: unknown): string {
  const s = String(v);
  return s.length >= 16 && s[10] === 'T' ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s.slice(0, 16);
}

export interface ExportDocInput {
  /** 섹션 키 → 행 목록(채팅은 빼도 된다 — chat.txt 로 따로 간다) */
  sections: Record<string, Row[]>;
  /** 사용자 id → 이름 */
  names: Record<number, string>;
  /** "섹션:행id" → ZIP 안 파일 경로들(받은 것만) */
  media: Record<string, { path: string; kind: 'IMAGE' | 'AUDIO' }[]>;
  exportedAt: Date;
  /** 받지 못한 파일 수 — README 와 index 머리에 적는다 */
  failedCount: number;
  /** 웹처럼 사진을 담지 않은 내보내기 */
  withoutMedia?: boolean;
}

export function mediaKey(section: string, rowId: unknown): string {
  return `${section}:${String(rowId)}`;
}

function renderRow(section: string, row: Row, input: ExportDocInput): string {
  const title = first(row, TITLE_KEYS);
  const date = first(row, DATE_KEYS);
  const author = first(row, AUTHOR_KEYS);
  const used = new Set([title?.[0], date?.[0], author?.[0]]);
  const details = Object.entries(row)
    .filter(([k, v]) => !used.has(k) && !HIDDEN.test(k) && v !== null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => `${esc(k)}: ${esc(v)}`)
    .join(' · ');
  const files = input.media[mediaKey(section, row.id)] ?? [];
  const photos = files
    .map((f) =>
      f.kind === 'IMAGE'
        ? `<a href="${esc(f.path)}"><img src="${esc(f.path)}" loading="lazy" alt=""></a>`
        : `<audio controls src="${esc(f.path)}"></audio>`,
    )
    .join('');
  const who = author ? input.names[Number(author[1])] : undefined;
  return `<li>
<div class="meta">${date ? esc(shortDate(date[1])) : ''}${who ? ` · ${esc(who)}` : ''}</div>
${title ? `<div class="title">${esc(title[1])}</div>` : ''}
${details ? `<div class="details">${details}</div>` : ''}
${photos ? `<div class="photos">${photos}</div>` : ''}
</li>`;
}

/** 압축을 풀면 바로 열리는 한 장짜리 목차. */
export function buildIndexHtml(input: ExportDocInput): string {
  const order = Object.keys(SECTION_LABELS).filter((k) => k !== 'chat_messages' && input.sections[k]?.length);
  const extra = Object.keys(input.sections).filter((k) => !(k in SECTION_LABELS) && input.sections[k].length);
  const keys = [...order, ...extra];
  const nav = keys.map((k) => `<a href="#${k}">${esc(sectionLabel(k))} ${input.sections[k].length}</a>`).join(' ');
  const body = keys
    .map(
      (k) => `<section id="${k}"><h2>${esc(sectionLabel(k))} <small>${input.sections[k].length}건</small></h2>
<ul>${input.sections[k].map((row) => renderRow(k, row, input)).join('\n')}</ul></section>`,
    )
    .join('\n');
  const notice = [
    input.withoutMedia ? '이 파일에는 사진·음성이 들어 있지 않아요. 사진까지 받으려면 휴대폰 앱에서 내보내 주세요.' : '',
    input.failedCount > 0 ? `받지 못한 파일이 ${input.failedCount}개 있어요. 목록은 README.txt 에 있어요.` : '',
  ]
    .filter(Boolean)
    .map((t) => `<p class="notice">${esc(t)}</p>`)
    .join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dubly 기록</title>
<style>
body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;max-width:860px;margin:0 auto;padding:16px;color:#222;line-height:1.5}
h1{font-size:22px}h2{font-size:18px;border-bottom:1px solid #eee;padding-bottom:4px;margin-top:32px}small{color:#888;font-weight:normal}
nav a{display:inline-block;margin:2px 6px 2px 0;font-size:13px;color:#555}
ul{list-style:none;padding:0}li{padding:10px 0;border-bottom:1px solid #f2f2f2}
.meta{font-size:12px;color:#888}.title{font-size:15px;white-space:pre-wrap}.details{font-size:12px;color:#666}
.photos img{width:160px;height:160px;object-fit:cover;border-radius:8px;margin:4px 4px 0 0}
.notice{background:#fff6e5;padding:8px 12px;border-radius:8px;font-size:13px}
</style></head><body>
<h1>Dubly 기록</h1>
<p class="meta">${esc(shortDate(localIso(input.exportedAt)))}에 내보냄 · 채팅은 chat.txt, 전체 데이터는 data 폴더(JSON)</p>
${notice}
<nav>${nav}</nav>
${body}
</body></html>`;
}

function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 채팅 — 카톡 내보내기처럼 한 줄씩. 사진·음성은 ZIP 안의 파일 경로를 덧붙인다. */
export function buildChatText(rows: Row[], names: Record<number, string>, input: Pick<ExportDocInput, 'media'>): string {
  return rows
    .map((m) => {
      const sender = names[Number(m.sender_id)] ?? '알 수 없음';
      const body = messagePreview(m.message_type as MessageType, (m.content as string | null) ?? null);
      const files = (input.media[mediaKey('chat_messages', m.id)] ?? []).map((f) => ` (${f.path})`).join('');
      return `[${shortDate(m.created_at)}] ${sender}: ${body}${files}`;
    })
    .join('\n');
}

export function buildReadme(input: { exportedAt: Date; counts: Record<string, number>; failed: string[]; withoutMedia?: boolean }): string {
  const lines = [
    'Dubly 기록 내보내기',
    `내보낸 시각: ${shortDate(localIso(input.exportedAt))}`,
    '',
    '- index.html : 압축을 푼 뒤 브라우저로 열면 기록을 한눈에 볼 수 있어요.',
    '- chat.txt   : 채팅 전체(오래된 순).',
    '- data/      : 기록 전체(JSON). 다른 프로그램으로 옮길 때 쓰세요.',
    input.withoutMedia ? '- 이 파일에는 사진·음성이 없어요(웹에서 내보냄). 휴대폰 앱에서 내보내면 함께 담겨요.' : '- photos/, audio/ : 올린 사진과 음성 그대로.',
    '',
    '사진은 올릴 때 긴 변 1024px 로 줄여 저장되므로, 처음 찍은 원본보다 작을 수 있어요.',
    '',
    '[담긴 기록]',
    ...Object.entries(input.counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `- ${sectionLabel(k)}: ${n}건`),
  ];
  if (input.failed.length > 0) {
    lines.push('', `[받지 못한 파일 ${input.failed.length}개]`, ...input.failed);
  }
  return lines.join('\n') + '\n';
}
