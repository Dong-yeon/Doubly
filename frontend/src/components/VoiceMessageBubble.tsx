/**
 * 음성 메시지 재생 버블 — 재생/일시정지 + 남은 시간.
 *
 * utils/voicePlayback.ts(운동 음성 응원)의 "쏘고 잊기" 재생과 달리, 채팅에서는
 * 몇 초짜리 클립을 여러 개 오가며 듣거나 중간에 멈출 수 있어야 해서 상태를 들고 있는
 * useAudioPlayer/useAudioPlayerStatus 를 직접 쓴다.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { MaterialCommunityIcons } from './Icon';
import { formatVoiceDuration } from '../utils/chatVoice';
import { colors, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  url: string;
  /** 서버가 알려준 길이 — 아직 재생 전이라 플레이어가 duration 을 모를 때의 표시값 */
  durationSec: number;
  mine: boolean;
}

export function VoiceMessageBubble({ url, durationSec, mine }: Props) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // 끝까지 들은 뒤 다시 누르면 그 자리에 멈춰만 있다 — 처음으로 되돌려야 다시 들린다
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) {
      void player.seekTo(0);
    }
    player.play();
  };

  const total = status.duration > 0 ? status.duration : durationSec;
  const remaining = status.playing || status.currentTime > 0 ? Math.max(0, total - status.currentTime) : total;

  return (
    <Pressable
      onPress={toggle}
      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? '음성 메시지 일시정지' : '음성 메시지 재생'}
    >
      <MaterialCommunityIcons
        name={status.playing ? 'pause-circle' : 'play-circle'}
        size={32}
        color={mine ? colors.white : colors.primary}
      />
      <Text style={[styles.duration, mine && styles.durationMine]}>{formatVoiceDuration(remaining)}</Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    minWidth: 96,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 6 },
  duration: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  durationMine: { color: colors.white },
}));
