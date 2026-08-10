/** 트레이너 연결 (회원 측) — 트레이너가 준 초대코드 입력 (REL-04) */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { relationApi } from '../../api/relation';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'TrainerConnect'>;

export function TrainerConnectScreen({ navigation }: Props) {
  const fetchRelations = useRelationStore((s) => s.fetchAll);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const onConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const relation = await relationApi.connectTrainer(input.trim().toUpperCase());
      await fetchRelations();
      haptics.success();
      toast.success(`${relation.partner?.name ?? '트레이너'}님과 연결되었어요! `);
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
          <Text style={styles.title}>트레이너와 연결하기</Text>
          <Text style={styles.desc}>
            트레이너에게 받은 6자리 초대코드를 입력하세요.{'\n'}연결하면 트레이너가 내 운동 현황을 볼 수 있어요.
          </Text>
          <TextField
            value={input}
            onChangeText={(t) => setInput(t.toUpperCase())}
            placeholder="예: ABC123"
            autoCapitalize="characters"
            maxLength={6}
            errorText={error ?? undefined}
            style={styles.codeInput}
          />
          <Button title="연결하기" onPress={onConnect} loading={connecting} disabled={input.trim().length < 6} />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  desc: { fontSize: fontSize.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  codeInput: { letterSpacing: 4, fontWeight: '700' },
}));
