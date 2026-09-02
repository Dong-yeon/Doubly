/**
 * 설정 (SET-01).
 *
 * 그동안 백엔드에만 있고 화면이 없어 닿지 못하던 기능들을 모은 곳이다
 * — 비밀번호 변경, 알림 수신, 마케팅 동의 철회, 약관 열람.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { useThemeStore } from '../../store/themeStore';
import type { ThemeMode } from '../../theme/themePreference';
import { authApi } from '../../api/auth';
import { isPushPermissionDenied } from '../../utils/push';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { getErrorMessage } from '../../utils/error';
import { copyText } from '../../utils/share';
import { toast } from '../../store/toastStore';
import { APP_VERSION, BUILD_LABEL, BUILD_STAMP } from '../../constants/config';
import { CONTACT_EMAIL, PRIVACY_VERSION, TERMS_VERSION } from '../../constants/legal';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Settings'>;

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

/**
 * 알림 종류 — 보내는 도메인(운동/식단/맛집…)이 아니라 사용자가 체감하는 성가심의 결로
 * 나눈다(서버 `NotificationCategory` 와 1:1). 도메인으로 나누면 이 목록이 20줄이 되고,
 * 어느 걸 꺼야 조용해지는지 알 수 없다.
 */
const NOTIFICATION_CATEGORIES = [
  { key: 'chat', field: 'notifyChat', title: '채팅 · 전화', desc: '메시지, 반응, 전화와 부재중 알림.' },
  { key: 'anniversary', field: 'notifyAnniversary', title: '기념일 · 일정', desc: '커플 캘린더 당일과 D-7·D-1 미리 알림.' },
  { key: 'partner', field: 'notifyPartner', title: '상대 활동', desc: '운동·식단·맛집·선물처럼 상대가 남긴 기록.' },
  { key: 'reminder', field: 'notifyReminder', title: '리마인드', desc: '스트릭·오늘의 질문·추억처럼 앱이 먼저 부르는 알림.' },
] as const;

export function SettingsScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const spellCheckEnabled = useSettingsStore((s) => s.spellCheckEnabled);
  const setSpellCheckEnabled = useSettingsStore((s) => s.setSpellCheckEnabled);
  // TEMP-PROTOTYPE(2026-09-02) — 아래 onTestHunspell 참고, 검증 끝나면 같이 지운다
  const [hunspellTesting, setHunspellTesting] = useState(false);
  const onTestHunspell = async () => {
    setHunspellTesting(true);
    try {
      const t0 = Date.now();
      const { getHunspell } = await import('../../utils/hunspell/hunspellEngine');
      const hunspell = await getHunspell();
      const loadMs = Date.now() - t0;
      const words = ['안되요', '오랫만에', '어의없어', '갈께', '왠일로', '안돼', '특이해'];
      const lines = words.map((w) => {
        const ok = hunspell.spell(w);
        return ok ? `${w} : OK` : `${w} : 오류 → ${hunspell.suggest(w).slice(0, 3).join(', ')}`;
      });
      Alert.alert('Hunspell 로드 성공', `로드 ${loadMs}ms\n\n${lines.join('\n')}`);
    } catch (e) {
      Alert.alert('Hunspell 로드 실패', getErrorMessage(e, String(e)));
    } finally {
      setHunspellTesting(false);
    }
  };
  /* 테마 — 고르는 즉시 화면에 반영된다 (RootNavigator 가 트리를 다시 그린다) */
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const [savingNotification, setSavingNotification] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);
  /** 저장 중인 카테고리 키 — 카테고리마다 상태를 두면 네 개가 되므로 하나로 관리한다 */
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  /** OS 권한이 거부된 상태 — 앱 안 설정으로는 되돌릴 수 없어 시스템 설정으로 보내야 한다 */
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    void isPushPermissionDenied().then(setPermissionDenied);
  }, []);

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

  const onToggleCategory = async (key: string, next: boolean) => {
    setSavingCategory(key);
    try {
      setUser(await authApi.updateNotificationCategories({ [key]: next }));
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingCategory(null);
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
        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>알림</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>푸시 알림</Text>
              <Text style={styles.rowDesc}>상대방 활동·채팅·기념일 알림을 받아요.</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={onToggleNotification}
              disabled={savingNotification}
              trackColor={{ true: colors.primary }}
            />
          </View>

          {/*
            OS 권한 거부는 앱에서 되돌릴 수 없다(두 번째 권한창이 뜨지 않는다).
            이 안내가 없으면 "앱에서는 켜 놨는데 아무것도 안 온다"가 되어 알림이
            고장 난 것처럼 보인다.
          */}
          {permissionDenied ? (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              accessibilityLabel="시스템 알림 설정 열기"
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitleWarn}>기기에서 알림이 차단돼 있어요</Text>
                <Text style={styles.rowDesc}>
                  아래 설정을 켜도 알림이 오지 않아요. 눌러서 시스템 설정에서 허용해주세요.
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>마케팅 정보 수신</Text>
              <Text style={styles.rowDesc}>이벤트·혜택 소식을 받아요. (선택)</Text>
            </View>
            <Switch
              value={marketingConsent}
              onValueChange={onToggleMarketing}
              disabled={savingMarketing}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>알림 종류</Text>
          <View style={[styles.rowText, styles.themeIntro]}>
            <Text style={styles.rowDesc}>
              받고 싶은 것만 골라 받을 수 있어요. 위의 푸시 알림을 끄면 여기 설정과 상관없이
              모두 오지 않아요.
            </Text>
          </View>
          {NOTIFICATION_CATEGORIES.map((c, i) => (
            <View key={c.key}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={notificationsEnabled ? styles.rowTitle : styles.rowTitleMuted}>
                    {c.title}
                  </Text>
                  <Text style={styles.rowDesc}>{c.desc}</Text>
                </View>
                <Switch
                  value={notificationsEnabled && (user?.[c.field] ?? true)}
                  onValueChange={(next) => onToggleCategory(c.key, next)}
                  disabled={!notificationsEnabled || savingCategory === c.key}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            </View>
          ))}
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>채팅</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>맞춤법 제안</Text>
              <Text style={styles.rowDesc}>
                되/돼처럼 헷갈리는 말을 입력창 위에서 알려줘요. 기기 안에서만 검사하고
                대화 내용은 어디로도 보내지 않아요.
              </Text>
            </View>
            <Switch
              value={spellCheckEnabled}
              onValueChange={setSpellCheckEnabled}
              trackColor={{ true: colors.primary }}
            />
          </View>
          {/*
            TEMP-PROTOTYPE(2026-09-02) — hunspell-asm(WASM) + hunspell-dict-ko 가 실기기에서
            실제로 로드·동작하는지 확인용. 검증 끝나면 이 행과 onTestHunspell 를 지운다.
          */}
          <Pressable onPress={onTestHunspell} style={styles.row} disabled={hunspellTesting}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{hunspellTesting ? '테스트 중…' : '(개발용) Hunspell 테스트'}</Text>
              <Text style={styles.rowDesc}>실기기에서 WASM 사전이 로드되는지 확인</Text>
            </View>
          </Pressable>
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>화면</Text>
          {/* section 이 좌우 패딩 0 이라(위 주석) 행마다 패딩을 직접 준다 — 테마 블록은
              row 를 안 쓰므로 빠뜨리면 제목이 카드 벽에 붙는다 */}
          <View style={[styles.rowText, styles.themeIntro]}>
            <Text style={styles.rowTitle}>테마</Text>
            <Text style={styles.rowDesc}>시스템을 고르면 기기 설정을 따라가요.</Text>
          </View>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={themeMode === o.value}
                onPress={() => void setThemeMode(o.value)}
                fill
              />
            ))}
          </View>
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>계정</Text>
          {isSocialAccount ? (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitleMuted}>비밀번호 변경</Text>
                <Text style={styles.rowDesc}>소셜 로그인 계정은 비밀번호를 사용하지 않아요.</Text>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={() => navigation.navigate('ChangePassword')}
            >
              <Text style={styles.rowTitle}>비밀번호 변경</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>약관 및 정책</Text>
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })}
          >
            <Text style={styles.rowTitle}>이용약관</Text>
            <Text style={styles.version}>v{TERMS_VERSION}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
          >
            <Text style={styles.rowTitle}>개인정보처리방침</Text>
            <Text style={styles.version}>v{PRIVACY_VERSION}</Text>
          </Pressable>
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>문의 및 지원</Text>
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={onContact}
            accessibilityRole="button"
            accessibilityLabel="문의 및 버그 신고"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>문의 · 버그 신고</Text>
              <Text style={styles.rowDesc}>불편한 점이나 오류를 알려주세요.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Card>

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
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  // Card 기본 좌우 패딩(16)을 지운다 — 안 지우면 container(24)+card(16)+row(24)=64 로
  // MY 화면(24+0+24=48)보다 텍스트가 16px 더 안쪽에서 시작해 두 화면이 어긋났다
  section: { paddingVertical: spacing.sm, paddingHorizontal: 0 },
  themeIntro: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  themeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  sectionLabel: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 56,
    gap: spacing.md,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '600' },
  rowTitleMuted: { fontSize: fontSize.subtitle, color: colors.textSecondary, fontWeight: '600' },
  rowTitleWarn: { fontSize: fontSize.subtitle, color: colors.danger, fontWeight: '600' },
  rowDesc: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  pressed: { opacity: 0.6 },
  chevron: { fontSize: fontSize.title, color: colors.textSecondary },
  version: { fontSize: fontSize.caption, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  appVersion: {
    textAlign: 'center',
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
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
