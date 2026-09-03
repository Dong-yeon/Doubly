/**
 * 채팅 음성 메시지 녹음 시트 — 녹음(최대 30초) → 미리듣기 → 보내기.
 *
 * VoiceClipsScreen(운동 음성 응원)과 같은 녹음 UI 를 쓴다 — expo-audio 레코더,
 * "미리듣기 → 저장/다시녹음" 2단계(바로 업로드하면 잘못 녹음했을 때 되돌릴 방법이
 * 서버 왕복 뒤뿐이라 답답하다는 게 그 화면의 결론이었다).
 *
 * <p>업로드·전송은 여기서 하지 않는다 — 로컬 uri·길이만 돌려주고 호출부
 * (ChatRoomScreen.onSendVoice)가 이미지 전송과 같은 패턴(runBusy 로 업로드 후 STOMP 전송)
 * 으로 처리한다.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { MaterialCommunityIcons } from './Icon';
import { Button } from './Button';
import { playVoiceClip } from '../utils/voicePlayback';
import { formatVoiceDuration } from '../utils/chatVoice';
import { toast } from '../store/toastStore';
import { getErrorMessage } from '../utils/error';
import { haptics } from '../utils/haptics';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

/** Feature.VOICE_MESSAGE 선언과 같은 값("채팅 음성 메시지(최대 30초)") — 프론트에서도 강제한다 */
const MAX_DURATION_MS = 30_000;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (uri: string, durationSec: number) => void;
}

export function VoiceRecordSheet({ visible, onClose, onSend }: Props) {
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pendingDurationMs, setPendingDurationMs] = useState(0);

  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const reset = () => {
    setPendingUri(null);
    setPendingDurationMs(0);
  };

  const close = () => {
    reset();
    onClose();
  };

  const startRecording = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      toast.error('마이크 권한이 필요해요.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      reset();
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '녹음을 시작하지 못했어요.'));
    }
  };

  const stopRecording = async () => {
    try {
      const durationMs = recorderState.durationMillis;
      await recorder.stop();
      setPendingUri(recorder.uri);
      setPendingDurationMs(durationMs);
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '녹음을 마치지 못했어요.'));
    }
  };

  // 30초에 도달하면 사용자가 정지를 누르지 않아도 자동으로 끊는다(카톡·인스타 관행)
  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= MAX_DURATION_MS) {
      void stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording, recorderState.durationMillis]);

  const send = () => {
    if (!pendingUri) return;
    onSend(pendingUri, Math.max(1, Math.round(pendingDurationMs / 1000)));
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>음성 메시지</Text>
          <Text style={styles.hint}>최대 30초까지 녹음할 수 있어요.</Text>

          {recorderState.isRecording ? (
            <View style={styles.row}>
              <View style={styles.recordingBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>
                  {formatVoiceDuration(recorderState.durationMillis / 1000)}
                </Text>
              </View>
              <Button title="■ 정지" variant="secondary" size="md" onPress={stopRecording} />
            </View>
          ) : pendingUri ? (
            <View style={styles.row}>
              <Pressable style={styles.iconBtn} onPress={() => playVoiceClip(pendingUri)}>
                <MaterialCommunityIcons name="play-circle-outline" size={24} color={colors.primary} />
                <Text style={styles.iconBtnText}>들어보기</Text>
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={startRecording}>
                <MaterialCommunityIcons name="restart" size={24} color={colors.textSecondary} />
                <Text style={styles.iconBtnText}>다시 녹음</Text>
              </Pressable>
              <Button title="보내기" size="md" onPress={send} />
            </View>
          ) : (
            <Pressable style={styles.recordButton} onPress={startRecording} accessibilityRole="button">
              <MaterialCommunityIcons name="microphone" size={28} color={colors.white} />
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  recordingBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recordingText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  iconBtn: { alignItems: 'center', gap: 2 },
  iconBtnText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
}));
