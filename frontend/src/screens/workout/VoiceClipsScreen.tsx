/**
 * 커플 음성 응원 — 애인 목소리로 짧은 응원 문구를 녹음해두면, 운동 중 정해진 순간
 * (휴식 종료·PR·운동 완료)에 그 목소리가 재생된다. 짐워크·플랜핏 조사에서 확인되지
 * 않은, 커플 앱만의 기능(WorkoutSessionScreen·WorkoutRecordScreen 참고).
 *
 * <p>문구를 자유 입력이 아니라 고정 3종으로 둔 이유: 앱이 이미 아는 순간에만
 * 자동으로 재생되므로, "언제 재생될지"를 사용자가 따로 설계할 필요가 없다.
 *
 * <p>녹음 → 저장 사이에 "미리듣기" 단계를 둔다. 바로 업로드해버리면 잘못 녹음했을 때
 * (헛기침, 목소리 안 들어감) 되돌릴 방법이 서버 갔다 온 뒤뿐이라 답답하다.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Button } from '../../components/Button';
import { Alert } from '../../utils/alert';
import { voiceClipsApi } from '../../api/voiceClips';
import { uploadVoiceClip } from '../../utils/voiceUpload';
import { playVoiceClip } from '../../utils/voicePlayback';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { VoiceClip, VoicePhrase } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

const PHRASES: { value: VoicePhrase; label: string; hint: string }[] = [
  { value: 'REST_END', label: '휴식 끝났을 때', hint: '예: "휴식 끝! 다음 세트 가자"' },
  { value: 'PR', label: '신기록 세웠을 때', hint: '예: "자기야 신기록이야!!"' },
  { value: 'WORKOUT_COMPLETE', label: '운동 다 끝났을 때', hint: '예: "오늘도 고생했어"' },
];

function formatSeconds(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `0:${String(s).padStart(2, '0')}`;
}

export function VoiceClipsScreen() {
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [loading, setLoading] = useState(true);
  // 지금 녹음 중이거나 미리듣기 대기 중인 문구 — 한 번에 하나만
  const [activePhrase, setActivePhrase] = useState<VoicePhrase | null>(null);
  // 녹음 직후, 아직 서버에 안 올린 로컬 파일 — "미리듣기 → 저장/다시녹음" 단계에 쓴다
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const load = useCallback(() => {
    voiceClipsApi
      .mine()
      .then(setClips)
      .catch(() => setClips([]))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const clipUrlFor = (phrase: VoicePhrase) => clips.find((c) => c.phrase === phrase)?.audioUrl;

  const startRecording = async (phrase: VoicePhrase) => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      toast.error('마이크 권한이 필요해요.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      setActivePhrase(phrase);
      setPendingUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '녹음을 시작하지 못했어요.'));
      setActivePhrase(null);
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      setPendingUri(recorder.uri);
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '녹음을 마치지 못했어요.'));
    }
  };

  const cancelPending = () => {
    setPendingUri(null);
    setActivePhrase(null);
  };

  const savePending = async () => {
    if (!activePhrase || !pendingUri) return;
    setSaving(true);
    try {
      const url = await runBusy('녹음 올리는 중…', () => uploadVoiceClip(pendingUri));
      const saved = await voiceClipsApi.save(activePhrase, url);
      setClips((prev) => [...prev.filter((c) => c.phrase !== activePhrase), saved]);
      haptics.success();
      toast.success('저장했어요 ');
      setPendingUri(null);
      setActivePhrase(null);
    } catch (e) {
      toast.error(getErrorMessage(e, '저장에 실패했어요.'));
    } finally {
      setSaving(false);
    }
  };

  const removeClip = (phrase: VoicePhrase) => {
    Alert.alert('녹음 삭제', '이 문구의 녹음을 지울까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await voiceClipsApi.remove(phrase);
            setClips((prev) => prev.filter((c) => c.phrase !== phrase));
            haptics.light();
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>
          애인 목소리로 응원받아요! 짧게 녹음해두면 운동 중 정해진 순간에 자동으로 재생돼요.
        </Text>

        {PHRASES.map((p) => {
          const savedUrl = clipUrlFor(p.value);
          const isActive = activePhrase === p.value;
          const isRecording = isActive && recorderState.isRecording;
          const hasPending = isActive && !!pendingUri;

          return (
            <View key={p.value} style={styles.card}>
              <Text style={styles.cardTitle}>{p.label}</Text>
              <Text style={styles.cardHint}>{p.hint}</Text>

              {isRecording ? (
                <View style={styles.row}>
                  <View style={styles.recordingBadge}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>{formatSeconds(recorderState.durationMillis)}</Text>
                  </View>
                  <Button title="■ 정지" variant="secondary" size="md" onPress={stopRecording} />
                </View>
              ) : hasPending ? (
                <View style={styles.row}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => playVoiceClip(pendingUri)}>
                    <MaterialCommunityIcons name="play-circle-outline" size={22} color={colors.primary} />
                    <Text style={styles.iconBtnText}>들어보기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={cancelPending} disabled={saving}>
                    <MaterialCommunityIcons name="restart" size={22} color={colors.textSecondary} />
                    <Text style={styles.iconBtnText}>다시 녹음</Text>
                  </TouchableOpacity>
                  <Button title="저장" size="md" onPress={savePending} loading={saving} disabled={saving} />
                </View>
              ) : savedUrl ? (
                <View style={styles.row}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => playVoiceClip(savedUrl)}>
                    <MaterialCommunityIcons name="play-circle-outline" size={22} color={colors.primary} />
                    <Text style={styles.iconBtnText}>재생</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => startRecording(p.value)}
                    disabled={activePhrase !== null}
                  >
                    <MaterialCommunityIcons name="microphone-outline" size={22} color={colors.textSecondary} />
                    <Text style={styles.iconBtnText}>다시 녹음</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => removeClip(p.value)}>
                    <MaterialCommunityIcons name="delete-outline" size={22} color={colors.danger} />
                    <Text style={[styles.iconBtnText, styles.dangerText]}>삭제</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.recordButton}
                  onPress={() => startRecording(p.value)}
                  disabled={loading || activePhrase !== null}
                >
                  <MaterialCommunityIcons name="microphone" size={20} color={colors.primary} />
                  <Text style={styles.recordButtonText}>녹음하기</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <Text style={styles.footnote}>
          커플로 연결돼 있으면, 서로가 녹음해둔 목소리가 상대방 운동 중에 재생돼요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  cardHint: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: 2, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    paddingVertical: spacing.sm,
  },
  recordButtonText: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary },
  recordingBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recordingText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  iconBtn: { alignItems: 'center', gap: 2 },
  iconBtnText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  dangerText: { color: colors.danger },
  footnote: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
}));
