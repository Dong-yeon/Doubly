/** 커플 연결 — 설계서 3.2 REL-01/REL-02 (초대코드 생성 / 코드 입력 연결) */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

export function CoupleConnectScreen({ navigation }: Props) {
  const { createInvite, connectCouple } = useRelationStore();
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const invite = await createInvite();
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
      await shareText(`Doubly에서 커플로 연결해요! 초대코드: ${code} (24시간 유효)`);
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
            <Text style={styles.sectionTitle}>내 초대코드 만들기</Text>
            <Text style={styles.desc}>코드를 상대방에게 공유하세요. (24시간 동안 유효)</Text>
            {code ? (
              <>
                <View style={styles.codeBox}>
                  <Text style={styles.code}>{code}</Text>
                </View>
                <View style={styles.codeActions}>
                  <Button title="복사" variant="soft" size="md" onPress={onCopy} style={styles.actionBtn} />
                  <Button title="공유" variant="soft" size="md" onPress={onShare} style={styles.actionBtn} />
                </View>
              </>
            ) : null}
            <Button
              title={code ? '새 코드 생성' : '초대코드 생성'}
              variant="secondary"
              onPress={onGenerate}
              loading={generating}
              style={styles.gap}
            />
          </View>

          <View style={styles.divider} />

          {/* 코드 입력 연결 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상대방 코드 입력</Text>
            <Text style={styles.desc}>받은 6자리 코드를 입력해 연결하세요.</Text>
            <TextField
              value={input}
              onChangeText={(t) => setInput(t.toUpperCase())}
              placeholder="예: ABC123"
              autoCapitalize="characters"
              maxLength={6}
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
  flex: { flex: 1 },
  container: { padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
  codeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  code: { fontSize: 40, fontWeight: '800', color: colors.primaryDark, letterSpacing: 8 },
  codeActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: { flex: 1 },
  gap: { marginTop: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  codeInput: { letterSpacing: 4, fontWeight: '700' },
}));
