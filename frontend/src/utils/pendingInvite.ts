/**
 * 초대 링크로 받은 커플 초대코드 — 로그인·가입을 거쳐도 잃지 않게 잠시 맡아 둔다.
 *
 * <p>초대 링크(`https://dubly.co.kr/i/CODE`, 앱에서 열기 = `doubly://couple/connect/CODE`)는 대개
 * <b>아직 로그인하지 않은</b> 상대가 누른다. 커플 연결 화면은 로그인 뒤에만 있는 Main 스택 안이라,
 * 링크를 그대로 내비게이션에 넘기면 갈 곳이 없어 버려진다(docs/first-experience-audit.md #2).
 * 그래서 초대 링크는 내비게이션에 넘기지 않고 여기 맡겨 두고, 로그인이 끝나면 RootNavigator 가
 * 꺼내 연결 화면을 열고 코드를 채운다. 앱을 껐다 켜도 남도록 저장소에 둔다(24시간 — 코드 유효기간과 같다).
 *
 * <p>코드는 비밀번호가 아니라 상대에게 보내라고 만든 값이라 보안 저장소가 아니라 AsyncStorage 에 둔다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'doubly.pendingInvite';
const TTL_MS = 24 * 60 * 60 * 1000;

/** 백엔드 RelationService 와 같은 알파벳 — 혼동 문자(I,O,0,1) 제외 32자, 6자리 */
const CODE = '[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}';
const INVITE_URL_PATTERNS = [
  // 소개 사이트의 초대 링크 — 1.0.7 부터 App Links·Universal Links 로 이 주소가 앱을 바로 연다
  new RegExp(`^https?://(?:www\\.)?dubly\\.co\\.kr/i/(${CODE})(?:[/?#].*)?$`, 'i'),
  // 소개 사이트의 "앱에서 열기"·웹 앱 주소 — 스킴이든 웹 경로든 couple/connect/CODE
  new RegExp(`(?:^doubly://|/)couple/connect/(${CODE})(?:[/?#].*)?$`, 'i'),
];

const CODE_ONLY = new RegExp(`^${CODE}$`, 'i');

/**
 * Play 설치 리퍼러(`invite=CODE`)에서 코드(대문자)를, 없으면 null.
 * 소개 사이트의 Play 링크가 `referrer=invite%3DCODE` 를 싣는다(landing/invite.html). 스토어·기기에 따라
 * 한 번 더 인코딩된 채로 오기도 해 한 번 풀어 본다. 자연 유입은 `utm_source=google-play&utm_medium=organic`.
 */
export function inviteCodeFromReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  let text = referrer;
  try {
    if (!text.includes('=') && text.includes('%')) text = decodeURIComponent(text);
  } catch {
    return null;
  }
  for (const pair of text.split('&')) {
    const [key, value] = pair.split('=');
    if (key === 'invite' && value && CODE_ONLY.test(value)) return value.toUpperCase();
  }
  return null;
}

/** 초대 링크면 코드(대문자)를, 아니면 null */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const pattern of INVITE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

type Listener = (code: string) => void;
const listeners = new Set<Listener>();

/** 맡겨 두고, 지금 기다리는 쪽(로그인된 RootNavigator)이 있으면 바로 알린다 */
export async function savePendingInvite(code: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ code, savedAt: Date.now() })).catch(() => undefined);
  listeners.forEach((fn) => {
    try {
      fn(code);
    } catch {
      // 무시 — 다음에 꺼낼 때 다시 처리된다
    }
  });
}

/** 맡겨 둔 코드를 꺼낸다(꺼내면 지운다). 없거나 24시간이 지났으면 null */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    const saved = JSON.parse(raw) as { code?: string; savedAt?: number };
    if (!saved.code || !saved.savedAt || Date.now() - saved.savedAt > TTL_MS) return null;
    return saved.code;
  } catch {
    return null;
  }
}

/** 새 초대 링크가 들어올 때 — 해제 함수를 돌려준다 */
export function onPendingInvite(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
