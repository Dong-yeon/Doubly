/**
 * 홈 상단 히어로 — 배경 사진 위의 "우리" 영역.
 *
 * <p>예전에는 아바타 둘이 나란히 서고 그 아래 D+ 칩과 스트릭 숫자가 줄줄이 붙어
 * 대시보드처럼 읽혔다. 지금은 <b>D+ 숫자 하나</b>를 주인공으로 두고, 두 사람은
 * 살짝 겹쳐 세워 "함께"라는 인상을 준다. 나머지 수치는 한 줄 요약으로 눌러 담았다.
 *
 * <p>순수 표현 컴포넌트다 — 스토어를 직접 읽지 않고 전부 props 로 받는다.
 * 화면 없이도 미리보기·스냅샷을 찍을 수 있어야 하기 때문.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from '../../../components/Avatar';
import { DoublyMark } from '../../../components/DoublyLogo';
import { formatDateLabel } from '../../../utils/date';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';

export interface CoupleHeroProps {
  meName: string;
  meImageUrl?: string | null;
  meDone: boolean;
  partnerName: string;
  partnerImageUrl?: string | null;
  partnerDone: boolean;
  /** 함께한 일수 (D+N) */
  dday: number;
  /** 기준 날짜 (YYYY-MM-DD) — 없으면 날짜 줄을 생략한다 */
  anniversaryDate?: string | null;
  myStreak: number;
  partnerStreak: number;
  onPressDday: () => void;
}

/** 오늘 상태 한 줄 — 숫자 나열 대신 지금 무슨 상황인지 문장으로 */
function todayLine(meDone: boolean, partnerDone: boolean, meName: string, partnerName: string): string {
  if (meDone && partnerDone) return '오늘 둘 다 기록했어요 🔥';
  if (meDone) return `${partnerName}님의 기록을 기다리는 중`;
  if (partnerDone) return `${partnerName}님은 오늘 기록했어요`;
  return '오늘은 아직 조용해요';
}

export function CoupleHero({
  meName,
  meImageUrl,
  meDone,
  partnerName,
  partnerImageUrl,
  partnerDone,
  dday,
  anniversaryDate,
  myStreak,
  partnerStreak,
  onPressDday,
}: CoupleHeroProps) {
  return (
    <View style={styles.wrap}>
      {/* 주인공 — D+ 숫자 */}
      <Pressable style={styles.ddayWrap} onPress={onPressDday} accessibilityRole="button">
        <Text style={styles.ddayLabel}>함께한 지</Text>
        <Text style={styles.dday} allowFontScaling={false}>
          D+{dday}
        </Text>
        {anniversaryDate ? (
          <Text style={styles.ddaySince}>{formatDateLabel(anniversaryDate)}부터</Text>
        ) : (
          <Text style={styles.ddaySince}>눌러서 기념일 설정하기</Text>
        )}
      </Pressable>

      {/* 두 사람 — 살짝 겹쳐 세운다. 나=코랄 / 상대=인디고 */}
      <View style={styles.coupleRow}>
        <Face name={meName} imageUrl={meImageUrl} done={meDone} color={colors.coral} streak={myStreak} />
        <View style={styles.mark}>
          <DoublyMark size={22} />
        </View>
        <Face
          name={partnerName}
          imageUrl={partnerImageUrl}
          done={partnerDone}
          color={colors.indigo}
          streak={partnerStreak}
        />
      </View>

      <Text style={styles.todayLine}>{todayLine(meDone, partnerDone, meName, partnerName)}</Text>
    </View>
  );
}

function Face({
  name,
  imageUrl,
  done,
  color,
  streak,
}: {
  name: string;
  imageUrl?: string | null;
  done: boolean;
  color: string;
  streak: number;
}) {
  return (
    <View style={styles.face}>
      <View style={[styles.avatarRing, { borderColor: done ? color : 'rgba(255,255,255,0.45)' }]}>
        <Avatar name={name} imageUrl={imageUrl} size={62} color={color} />
        {done ? (
          <View style={[styles.doneBadge, { backgroundColor: color }]}>
            <MaterialCommunityIcons name="check" size={13} color={colors.white} />
          </View>
        ) : null}
      </View>
      <Text style={styles.faceName} numberOfLines={1}>
        {name}
      </Text>
      {/* 연속 기록은 0일 때 숨긴다 — '0일'은 알려주는 정보가 없고 시선만 끈다 */}
      {streak > 0 ? <Text style={styles.faceStreak}>🔥 {streak}일</Text> : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { paddingHorizontal: spacing.xs, alignItems: 'stretch' },


  ddayWrap: { alignItems: 'center' },
  ddayLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.caption,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dday: {
    color: colors.white,
    fontSize: 64,
    lineHeight: 74,
    fontWeight: '800',
    letterSpacing: -2,
    // 밝은 배경 사진 위에서도 숫자가 뭉개지지 않도록
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 3 },
  },
  ddaySince: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.caption, fontWeight: '600', marginTop: 2 },

  coupleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  // 하트 마크가 두 얼굴 사이에 끼도록 좌우를 당긴다
  mark: { marginHorizontal: -spacing.xs, marginTop: 20 },
  face: { alignItems: 'center', width: 96 },
  avatarRing: { borderWidth: 2.5, borderRadius: 999, padding: 3 },
  doneBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    // 히어로는 스크림으로 항상 어둡다 — 테마에 따라 뒤집히면 안 되므로 고정색
    borderColor: '#14162B',
  },
  faceName: { color: colors.white, fontSize: fontSize.body, fontWeight: '800', marginTop: spacing.xs },
  faceStreak: { color: 'rgba(255,255,255,0.85)', fontSize: fontSize.caption, fontWeight: '700', marginTop: 1 },

  todayLine: {
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: spacing.md,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
}));
