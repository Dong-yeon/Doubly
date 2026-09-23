/**
 * 설정 (SET-01).
 *
 * 그동안 백엔드에만 있고 화면이 없어 닿지 못하던 기능들을 모은 곳이다
 * — 비밀번호 변경, 알림 수신, 마케팅 동의 철회, 약관 열람.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Chip } from '../../components/Chip';
import { SettingsGroup, SettingsInset, SettingsRow } from '../../components/SettingsList';
import { useThemeStore } from '../../store/themeStore';
import type { ThemeMode } from '../../theme/themePreference';
import type { AccentVariant } from '../../theme/colors';
import { authApi } from '../../api/auth';
import {
  canAskPushPermission,
  isPushPermissionDenied,
  requestPushPermission,
} from '../../utils/push';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlanStore } from '../../store/planStore';
import { getErrorMessage } from '../../utils/error';
import { checkWithDictionary, preloadDictionary } from '../../utils/koreanDictionary';
import { copyText } from '../../utils/share';
import { toast } from '../../store/toastStore';
import { APP_VERSION, BUILD_LABEL, BUILD_STAMP } from '../../constants/config';
import { CONTACT_EMAIL, PRIVACY_VERSION, TERMS_VERSION } from '../../constants/legal';
import { fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Settings'>;

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

/* 앱 액센트 — 채팅 배경처럼 기기별 취향 설정 (colors.ts 의 AccentVariant 주석 참고) */
const ACCENT_OPTIONS: { value: AccentVariant; label: string }[] = [
  { value: 'green', label: '그린' },
  { value: 'mint', label: '민트' },
  { value: 'peach', label: '피치' },
];

export function SettingsScreen({ navigation }: Props) {
  const isPro = usePlanStore((s) => s.plan) === 'PRO';
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const spellCheckEnabled = useSettingsStore((s) => s.spellCheckEnabled);
  const setSpellCheckEnabled = useSettingsStore((s) => s.setSpellCheckEnabled);
  /*
   * 개발용 — 사전 검사(2·3층)가 실기기에서 실제로 도는지 확인한다. 규칙 검증은
   * npm run verify:spellcheck 가 기기 없이 하지만, 사전 자체의 판정과 로딩 시간은
   * 기기에서만 볼 수 있다. __DEV__ 로 가려 스토어 빌드에는 안 나간다.
   */
  const [dictTesting, setDictTesting] = useState(false);
  const onTestDictionary = async () => {
    setDictTesting(true);
    try {
      const t0 = Date.now();
      const ok = await preloadDictionary();
      const loadMs = Date.now() - t0;
      if (!ok) {
        Alert.alert('사전 로드 실패', '네이티브 사전을 준비하지 못했어요.');
        return;
      }
      // 잡아야 하는 것 / 애교체(오탐이면 안 됨) / 정상(오탐이면 안 됨)
      const samples = [
        '오랫만에 만나서 어의없어',
        '제작년에 갈께 했잖아',
        '뭐했어용 사랑행 배고파용',
        '오랜만이야 진짜 특이해',
      ];
      const lines: string[] = [];
      for (const s of samples) {
        const found = await checkWithDictionary(s);
        lines.push(
          found.length === 0
            ? `"${s}"\n  → 지적 없음`
            : `"${s}"\n  → ${found.map((f) => `${f.wrong}→${f.right}`).join(', ')}`,
        );
      }
      Alert.alert('사전 검사 결과', `로드 ${loadMs}ms\n\n${lines.join('\n\n')}`);
    } catch (e) {
      Alert.alert('사전 검사 실패', getErrorMessage(e, String(e)));
    } finally {
      setDictTesting(false);
    }
  };
  /* 테마 — 고르는 즉시 화면에 반영된다 (RootNavigator 가 트리를 다시 그린다) */
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);

  const [savingNotification, setSavingNotification] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [savingMealPhotoAnalysis, setSavingMealPhotoAnalysis] = useState(false);
  /** OS 권한이 거부된 상태 — 앱 안 설정으로는 되돌릴 수 없어 시스템 설정으로 보내야 한다 */
  const [permissionDenied, setPermissionDenied] = useState(false);
  /**
   * OS 권한을 아직 한 번도 안 물어본 상태(undetermined) — 거부와 달리 앱 안에서 바로 요청할 수 있다.
   * 첫 안내에서 "나중에"를 눌렀거나 iOS 에서 앱을 지웠다 다시 깐 경우가 여기 해당한다.
   * 이 상태를 정상처럼 보여주면 서버·APNs 가 멀쩡해도 알림이 오지 않는 이유를 사용자가 알 길이 없다.
   */
  const [permissionUnasked, setPermissionUnasked] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);

  const refreshPermissionState = () => {
    void isPushPermissionDenied().then(setPermissionDenied);
    void canAskPushPermission().then(setPermissionUnasked);
  };

  useEffect(refreshPermissionState, []);

  /** 권한창을 띄우고(허용되면 토큰 등록까지) 결과에 맞춰 안내 행을 갈아 끼운다. */
  const onRequestPermission = async () => {
    setRequestingPermission(true);
    try {
      const granted = await requestPushPermission();
      if (granted) toast.success('이제 알림을 받을 수 있어요.');
    } finally {
      setRequestingPermission(false);
      refreshPermissionState();
    }
  };

  // 서버가 값을 안 내려주는 구버전 응답에서도 안전하게 동작하도록 기본값을 둔다
  const notificationsEnabled = user?.notificationsEnabled ?? true;
  const marketingConsent = user?.marketingConsent ?? false;

  const onToggleNotification = async (next: boolean) => {
    setSavingNotification(true);
    try {
      setUser(await authApi.updateNotificationSetting(next));
      toast.success(next ? '알림을 받아요.' : '알림을 껐어요.');
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingNotification(false);
    }
  };

  const onToggleMealPhotoAnalysis = async (next: boolean) => {
    setSavingMealPhotoAnalysis(true);
    try {
      setUser(await authApi.updateMealPhotoAnalysis(next));
      toast.success(next ? '사진을 올리면 칼로리를 채워드릴게요.' : '이제 칼로리는 직접 적어요.');
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingMealPhotoAnalysis(false);
    }
  };

  const onToggleMarketing = async (next: boolean) => {
    setSavingMarketing(true);
    try {
      setUser(await authApi.updateMarketingConsent(next));
      toast.success(next ? '마케팅 수신에 동의했어요.' : '마케팅 수신을 철회했어요.');
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingMarketing(false);
    }
  };

  const isSocialAccount = !!user?.socialType && user.socialType !== 'EMAIL';

  /**
   * 문제를 알릴 때 함께 보내야 하는 정보 — 어느 빌드의 어느 기기인가.
   *
   * <p>버전만으로는 부족하다: 스토어 빌드(AAB)는 EAS 빌드를 돌린 순간의 JS 가 그대로
   * 얼어붙는데 웹은 배포할 때마다 최신이라, 같은 버전 표기로도 서로 다른 코드가 돌 수 있다.
   * 커밋 해시가 있어야 "앱만 안 되는" 증상에서 빌드 차이인지를 바로 가른다.
   */
  const buildDetail = `앱: Dubly ${BUILD_LABEL}\n기기: ${Platform.OS} ${Platform.Version}`;

  /** 버전 줄을 길게 누르면 복사 — 폰에서 그대로 붙여넣어 알릴 수 있게. */
  const onCopyBuildInfo = async () => {
    await copyText(buildDetail);
    toast.success('빌드 정보를 복사했어요.');
  };

  /**
   * 문의·버그 신고 — 메일 앱을 연다.
   * 빌드 식별 정보·플랫폼을 본문에 미리 채워 베타 리포트 분류를 돕는다.
   */
  const onContact = async () => {
    const subject = `[Dubly 문의] `;
    const body =
      `\n\n----------\n`
      + `아래 정보는 문제 확인용이에요. 지워도 괜찮아요.\n`
      + `${buildDetail}\n`;
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        // 메일 앱이 없는 기기 — 주소라도 안내한다
        Alert.alert('문의 이메일', `메일 앱을 열 수 없어요.\n${CONTACT_EMAIL} 로 보내주세요.`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('문의 이메일', `${CONTACT_EMAIL} 로 보내주세요.`);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {/*
          2026-09-23 — 카드 10개를 묶음 5개로 접었다(docs/SCREEN_DESIGN_PASS_2026-09-23.md §2-4).
          행마다 붙어 있던 설명 15개는 묶음 각주 셋과 법적 note 둘로 줄였고, 알림 종류·식사
          알림은 하위 화면으로 뺐다. 항목 자체(무엇이 어디 있는지)는 그대로다.
        */}
        <SettingsGroup title="알림" footer="푸시 알림을 끄면 종류·식사 알림과 상관없이 모두 오지 않아요.">
          <SettingsRow
            title="푸시 알림"
            switchValue={notificationsEnabled}
            onSwitch={(next) => void onToggleNotification(next)}
            disabled={savingNotification}
          />
          {/*
            OS 권한 거부는 앱에서 되돌릴 수 없다(두 번째 권한창이 뜨지 않는다).
            이 안내가 없으면 "앱에서는 켜 놨는데 아무것도 안 온다"가 되어 알림이
            고장 난 것처럼 보인다. 조건부 행이라 상주 설명이 아니다.
          */}
          {permissionDenied ? (
            <SettingsRow
              title="기기에서 알림이 차단돼 있어요"
              note="눌러서 시스템 설정에서 허용해주세요."
              danger
              onPress={() => void Linking.openSettings()}
              accessibilityLabel="시스템 알림 설정 열기"
            />
          ) : null}
          {/* 아직 안 물어본 상태 — 여기서는 시스템 설정이 아니라 권한창을 바로 띄울 수 있다 */}
          {!permissionDenied && permissionUnasked ? (
            <SettingsRow
              title="기기 알림 허용이 아직 안 됐어요"
              note="눌러서 허용해주세요."
              danger
              onPress={() => void onRequestPermission()}
              loading={requestingPermission}
              accessibilityLabel="기기 알림 허용하기"
            />
          ) : null}
          <SettingsRow title="알림 종류" onPress={() => navigation.navigate('NotificationCategories')} />
          <SettingsRow title="식사 알림" onPress={() => navigation.navigate('MealReminders')} />
          <SettingsRow
            title="마케팅 정보 수신"
            note="이벤트·혜택 소식 (선택)"
            switchValue={marketingConsent}
            onSwitch={(next) => void onToggleMarketing(next)}
            disabled={savingMarketing}
          />
        </SettingsGroup>

        {/*
          채팅 배경은 2026-09-23 에 <b>채팅방 ⋮ 메뉴</b>로 옮겼다(ChatBackgroundSheet).
          여기 나란히 두니 색 목록이 둘이라 "왜 색을 두 번 고르지"가 됐는데, 액센트는
          앱 전체 정체성이고 배경은 그 방의 취향이라 층이 다르다. 다시 가져오지 말 것.
        */}
        <SettingsGroup
          title="화면"
          footer="테마에서 시스템을 고르면 기기 설정을 따라가요. 액센트는 이 기기에서만 바뀌어요."
          style={styles.group}
        >
          <View>
            <SettingsRow title="테마" />
            <SettingsInset style={styles.chips}>
              {THEME_OPTIONS.map((o) => (
                <Chip key={o.value} label={o.label} selected={themeMode === o.value} onPress={() => void setThemeMode(o.value)} fill />
              ))}
            </SettingsInset>
          </View>
          <View>
            <SettingsRow title="액센트" />
            <SettingsInset style={styles.chips}>
              {ACCENT_OPTIONS.map((o) => (
                <Chip key={o.value} label={o.label} selected={accent === o.value} onPress={() => void setAccent(o.value)} fill />
              ))}
            </SettingsInset>
          </View>
        </SettingsGroup>

        <SettingsGroup
          title="기능"
          footer="사진 칼로리는 직접 적은 값이 있으면 건드리지 않아요."
          style={styles.group}
        >
          <SettingsRow
            title="사진으로 칼로리 채우기"
            switchValue={user?.autoAnalyzeMealPhoto !== false}
            onSwitch={(next) => void onToggleMealPhotoAnalysis(next)}
            disabled={savingMealPhotoAnalysis}
          />
          <SettingsRow
            title="맞춤법 제안"
            note="기기 안에서만 검사해요. 대화 내용은 어디로도 보내지 않아요."
            switchValue={spellCheckEnabled}
            onSwitch={setSpellCheckEnabled}
          />
          {/* 개발용 — 위 onTestDictionary 참고. 스토어 빌드에는 안 보인다 */}
          {__DEV__ ? (
            <SettingsRow
              title={dictTesting ? '검사 중…' : '(개발용) 사전 검사 테스트'}
              onPress={() => void onTestDictionary()}
              loading={dictTesting}
            />
          ) : null}
        </SettingsGroup>

        {/*
          MY 탭 메뉴에도 플랜이 있지만(`MyScreen`), 구독을 찾는 사람은 설정부터 연다.
          docs/PRO_UPSELL_AND_ADS_2026-09-17.md §6 — 자발적으로 들어올 자리만 늘린다.
          값은 `PlanScreen` 의 배지와 같은 어휘(PRO/FREE)를 쓴다.
        */}
        <SettingsGroup title="계정" style={styles.group}>
          <SettingsRow title="플랜" value={isPro ? 'PRO' : 'FREE'} onPress={() => navigation.navigate('Plan')} accessibilityLabel="플랜 보기" />
          {isSocialAccount ? (
            <SettingsRow title="비밀번호 변경" note="소셜 로그인 계정은 비밀번호를 사용하지 않아요." muted />
          ) : (
            <SettingsRow title="비밀번호 변경" onPress={() => navigation.navigate('ChangePassword')} />
          )}
        </SettingsGroup>

        <SettingsGroup title="정보" style={styles.group}>
          <SettingsRow title="이용약관" value={`v${TERMS_VERSION}`} onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })} />
          <SettingsRow title="개인정보처리방침" value={`v${PRIVACY_VERSION}`} onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })} />
          {/*
           * 오픈소스 고지 — 선택이 아니라 의무다. 맞춤법·띄어쓰기 기능이 Hunspell(LGPL)·
           * 한국어 사전(GPL-3.0)·Kiwi(LGPL)를 네이티브 바이너리로 번들하고 있어서,
           * 이 화면이 없으면 스토어에 올리는 것 자체가 라이선스 위반이다(2026-09-07).
           */}
          <SettingsRow title="오픈소스 라이선스" onPress={() => navigation.navigate('LegalDocument', { doc: 'oss' })} />
          <SettingsRow title="문의 · 버그 신고" onPress={() => void onContact()} accessibilityLabel="문의 및 버그 신고" />
        </SettingsGroup>

        <Pressable
          onLongPress={onCopyBuildInfo}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`앱 버전 ${BUILD_LABEL}`}
          accessibilityHint="길게 누르면 빌드 정보를 복사해요."
        >
          <Text style={styles.appVersion}>Dubly v{APP_VERSION}</Text>
          <Text style={styles.buildStamp}>{BUILD_STAMP}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  group: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', gap: spacing.sm },
  appVersion: {
    textAlign: 'center',
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  /* 커밋·빌드 시각 — 평소엔 눈에 걸리지 않아야 하고, 필요할 때만 읽히면 된다 */
  buildStamp: {
    textAlign: 'center',
    fontSize: fontSize.micro,
    color: colors.textSecondary,
    opacity: 0.7,
    marginTop: 2,
  },
}));
