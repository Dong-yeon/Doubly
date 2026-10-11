/**
 * 초대 링크 → Play 설치 → 첫 실행에서 코드를 이어받는다(Android, docs/first-experience-audit.md #2 2단계).
 *
 * <p>앱이 없는 상대가 초대 링크를 누르면 소개 사이트(`/i/CODE`)에서 Play 로 간다. 그 Play 링크가
 * `referrer=invite%3DCODE` 를 싣고, Play 는 설치 후 이 값을 Install Referrer API 로 돌려준다. 그래서
 * 상대는 설치 → 가입만 하면 연결 화면에 코드가 채워져 있다(링크를 다시 누르거나 붙여넣을 필요가 없다).
 * 받은 코드는 초대 링크와 똑같이 맡겨 둔다(utils/pendingInvite) — 로그인 뒤 RootNavigator 가 꺼낸다.
 *
 * <p><b>설치당 한 번만</b> 읽는다. 리퍼러는 설치 내내 같은 값을 돌려주므로, 매번 읽으면 연결을 끊고
 * 다시 들어올 때마다 옛 코드가 되살아난다. 또 이 기능이 들어간 버전으로 <b>업데이트</b>한 기존 사용자는
 * 처음 깔 때의 리퍼러를 받는데, 그건 이미 쓴(혹은 만료된) 코드다 — 설치한 지 하루(코드 유효기간)가
 * 지났으면 보지 않는다. iOS 에는 동등한 장치가 없어 "코드 복사 → 붙여넣기"가 그대로 길이다.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { inviteCodeFromReferrer, savePendingInvite } from './pendingInvite';

const CHECKED_KEY = 'doubly.installReferrerChecked';
/** 초대코드 유효기간과 같다 — 이보다 오래전에 깔린 앱의 리퍼러 코드는 이미 쓸 수 없다 */
const MAX_INSTALL_AGE_MS = 24 * 60 * 60 * 1000;

export async function claimInviteFromInstallReferrer(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (await AsyncStorage.getItem(CHECKED_KEY)) return;
    // 먼저 표시한다 — 아래가 실패해도(Play 서비스 없음 등) 실행마다 다시 묻지 않는다
    await AsyncStorage.setItem(CHECKED_KEY, '1');
    const installedAt = await Application.getInstallationTimeAsync();
    if (Date.now() - installedAt.getTime() > MAX_INSTALL_AGE_MS) return;
    const code = inviteCodeFromReferrer(await Application.getInstallReferrerAsync());
    if (code) await savePendingInvite(code);
  } catch {
    // 리퍼러를 못 읽어도 초대는 링크·붙여넣기로 된다 — 조용히 넘어간다
  }
}
