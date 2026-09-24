/** 커플 연결 — 설계서 3.2 REL-01/REL-02 (초대코드 생성 / 코드 입력 연결) */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { TextField } from '../../components/TextField';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { copyText, shareText } from '../../utils/share';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'CoupleConnect'>;

/**
 * 초대코드 형식 — 혼동 문자(I,O,0,1) 제외 32문자 알파벳 6자리(백엔드 InviteCodeGenerator와 동일).
 * 공유 문구("Dubly에서 커플로 연결해요! 초대코드: ABC234 (24시간 유효)")를 말풍선째로 길게 눌러
 * 통째로 복사·붙여넣는 경우가 많아, 그 안에서 실제 코드만 골라낸다. \b 경계 덕분에 "Dubly"(5자)
 * 처럼 길이가 다른 라틴 문자열은 걸리지 않는다. 매칭 실패 시(짧게 직접 타이핑 중 등)엔 이전처럼
 * 앞 6자만 사용해 폭 넘는 입력을 막는다.
 */
const INVITE_CODE_PATTERN = /\b[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}\b/i;

function extractInviteCode(text: string): string {
  const upper = text.toUpperCase();
  const match = upper.match(INVITE_CODE_PATTERN);
  return match ? match[0] : upper.trim().slice(0, 6);
}

/*
 * 세션 안에서 마지막으로 만든 코드 — 화면을 나갔다 들어와도 같은 코드를 보여준다. 예전엔 들어올
 * 때마다 비어 있어 "새로 만들어야 하나?" 가 됐고, 만들 때마다 서버에 PENDING 관계 행이 하나씩
 * 쌓인다(RelationService.createCoupleInvite). 진입 시 자동 생성은 그래서 하지 않았다 — 코드를
 * <b>입력</b>하러 온 사람에게도 행이 생긴다. 서버가 "활성 초대 조회"를 주기 전까지는 명시적 생성.
 */
let lastInvite: { code: string; expiresAt: string } | null = null;

export function CoupleConnectScreen({ navigation }: Props) {
  const { createInvite, connectCouple } = useRelationStore();
  const [code, setCode] = useState<string | null>(() =>
    lastInvite && new Date(lastInvite.expiresAt).getTime() > Date.now() ? lastInvite.code : null,
  );
  const [generating, setGenerating] = useState(false);

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const invite = await createInvite();
      lastInvite = { code: invite.code, expiresAt: invite.expiresAt };
      setCode(invite.code);
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  const onCopy = async () => {
    if (!code) return;
    try {
      await copyText(code);
      haptics.light();
      toast.success('초대코드를 복사했어요 ');
    } catch (e) {
      toast.error(getErrorMessage(e, '복사에 실패했어요.'));
    }
  };

  const onShare = async () => {
    if (!code) return;
    try {
      await shareText(`Dubly에서 커플로 연결해요! 초대코드: ${code} (24시간 유효)`);
    } catch (e) {
      // 공유 시트를 사용자가 그냥 닫아도 일부 플랫폼은 reject 한다 — 진짜 실패만 알린다
      toast.error(getErrorMessage(e, '공유에 실패했어요.'));
    }
  };

  const onConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      await connectCouple(input.trim().toUpperCase());
      haptics.success();
      toast.success('커플로 연결되었어요! ');
      navigation.goBack();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 키보드가 "연결하기" 버튼을 가리지 않도록 회피 (스크롤하면 키보드가 내려간다) */}
      <FormKeyboardView contentContainerStyle={styles.container}>
          {/* 초대코드 생성 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>내 초대코드</Text>
            {code ? (
              <>
                <View style={styles.codeBox}>
                  <Text style={styles.code}>{code}</Text>
                </View>
                {/* 설명은 코드 아래 캡션 한 줄 — 예전엔 제목 아래 안내문 + 괄호 */}
                <Text style={styles.codeCaption}>24시간 동안 유효 · 상대가 이 코드를 입력하면 연결돼요</Text>
                <View style={styles.codeActions}>
                  <Button title="복사" variant="soft" size="md" onPress={onCopy} style={styles.actionBtn} />
                  <Button
                    title="공유"
                    leftIcon={<MaterialCommunityIcons name="share-variant" size={18} color={colors.primary} />}
                    variant="soft"
                    size="md"
                    onPress={onShare}
                    style={styles.actionBtn}
                  />
                </View>
                <Button title="새 코드 만들기" variant="ghost" size="md" onPress={onGenerate} loading={generating} />
              </>
            ) : (
              <Button title="초대코드 만들기" onPress={onGenerate} loading={generating} style={styles.gap} />
            )}
          </View>

          <View style={styles.divider} />

          {/* 코드 입력 연결 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상대방 코드 입력</Text>
            <TextField
              value={input}
              onChangeText={(t) => setInput(extractInviteCode(t))}
              placeholder="받은 6자리 코드"
              autoCapitalize="characters"
              errorText={error ?? undefined}
              style={styles.codeInput}
            />
            <Button
              title="연결하기"
              onPress={onConnect}
              loading={connecting}
              disabled={input.trim().length < 6}
            />
          </View>
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  codeCaption: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  codeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  code: { fontSize: 40, fontWeight: '800', color: colors.textPrimary, letterSpacing: 8 },
  codeActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: { flex: 1 },
  gap: { marginTop: 0 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  codeInput: { letterSpacing: 4, fontWeight: '700' },
}));
