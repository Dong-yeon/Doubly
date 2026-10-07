/**
 * AI 데이트 코스 — 고르기(코스 유형·시간대·분위기·안 가본 곳)와 결과 카드. 버튼·모달 껍데기는 AiInsightButton 이 맡는다.
 * 설계: docs/LOVELICHELIN_AI_COURSE_2026-10-07.md.
 *
 * <p>장소·콘텐츠는 화면도 데이터도 합치지 않았다 — 결과 카드에서만 한 줄로 이어 보인다. 장소 stop 은 장소 상세로, 콘텐츠 stop 은
 * 콘텐츠 상세로 간다. 옛 서버 응답(kind·id 없음)은 누를 곳이 없으니 예전처럼 글자만 보인다.
 */
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Chip } from '../../components/Chip';
import { Checkbox } from '../../components/Checkbox';
import { MaterialCommunityIcons } from '../../components/Icon';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { DateCourse, DateCourseOptions, DateCourseStop, DateCourseType } from '../../types';

export const DEFAULT_DATE_COURSE_OPTIONS: DateCourseOptions = {
  type: 'OUTDOOR',
  timeSlot: null,
  mood: null,
  includeUnvisited: true,
};

const TYPES: { value: DateCourseType; label: string; hint: string }[] = [
  { value: 'OUTDOOR', label: '밖에서', hint: '저장한 장소로만 짜요' },
  { value: 'MOVIE_SHOW', label: '영화·공연', hint: '보고 싶은 공연이나 지금 상영 중인 영화 하나 + 근처 장소' },
  { value: 'HOME', label: '집콕', hint: '드라마·영화 + 포장해 올 곳' },
];

const TIME_SLOTS: { value: DateCourseOptions['timeSlot']; label: string }[] = [
  { value: null, label: '상관없음' },
  { value: 'LUNCH', label: '점심' },
  { value: 'DINNER', label: '저녁' },
  { value: 'DAY', label: '하루' },
];

const MOODS: { value: DateCourseOptions['mood']; label: string }[] = [
  { value: null, label: '상관없음' },
  { value: 'CALM', label: '조용히' },
  { value: 'ACTIVE', label: '활동적' },
];

interface SetupProps {
  value: DateCourseOptions;
  onChange: (next: DateCourseOptions) => void;
}

/** 고르기 — 집콕은 시간대·분위기·안 가본 곳이 의미가 없어 숨긴다 */
export function DateCourseSetup({ value, onChange }: SetupProps) {
  const outside = value.type !== 'HOME';
  const set = (patch: Partial<DateCourseOptions>) => onChange({ ...value, ...patch });
  return (
    <View style={styles.setup}>
      <Text style={styles.label}>어떤 데이트?</Text>
      <View style={styles.chipRow}>
        {TYPES.map((t) => (
          <Chip key={t.value} label={t.label} selected={value.type === t.value} onPress={() => set({ type: t.value })} fill />
        ))}
      </View>
      <Text style={styles.hint}>{TYPES.find((t) => t.value === value.type)?.hint}</Text>

      {outside ? (
        <>
          <Text style={styles.label}>시간대</Text>
          <View style={styles.chipRow}>
            {TIME_SLOTS.map((t) => (
              <Chip key={t.label} label={t.label} selected={value.timeSlot === t.value} onPress={() => set({ timeSlot: t.value })} fill />
            ))}
          </View>
          <Text style={styles.label}>분위기</Text>
          <View style={styles.chipRow}>
            {MOODS.map((m) => (
              <Chip key={m.label} label={m.label} selected={value.mood === m.value} onPress={() => set({ mood: m.value })} fill />
            ))}
          </View>
          <Checkbox
            checked={value.includeUnvisited}
            onChange={(includeUnvisited) => set({ includeUnvisited })}
            label="아직 안 가본 곳도 넣기"
          />
        </>
      ) : null}
    </View>
  );
}

interface ResultProps {
  course: DateCourse;
  onOpenPlace: (id: number, name: string) => void;
  onOpenContent: (id: number, title: string) => void;
}

export function DateCourseResult({ course, onOpenPlace, onOpenContent }: ResultProps) {
  return (
    <View style={{ gap: spacing.sm }}>
      {course.comment ? <Text style={styles.comment}>{course.comment}</Text> : null}
      {course.stops.map((s, i) => (
        <View key={`${s.kind ?? 'X'}-${s.id ?? s.name}-${i}`}>
          <StopRow stop={s} index={i} onOpenPlace={onOpenPlace} onOpenContent={onOpenContent} />
          {s.nextDistanceKm != null ? (
            <Text style={styles.distance}>다음 장소까지 약 {s.nextDistanceKm}km</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function StopRow({
  stop,
  index,
  onOpenPlace,
  onOpenContent,
}: {
  stop: DateCourseStop;
  index: number;
} & Omit<ResultProps, 'course'>) {
  const isContent = stop.kind === 'CONTENT';
  const target = stop.id != null && stop.kind != null;
  const onPress = !target
    ? undefined
    : () => (isContent ? onOpenContent(stop.id as number, stop.name) : onOpenPlace(stop.id as number, stop.name));
  return (
    <Pressable
      onPress={onPress}
      disabled={!target}
      style={({ pressed }) => [styles.stop, pressed && target ? styles.pressed : null]}
      accessibilityRole={target ? 'button' : undefined}
      accessibilityLabel={`${index + 1}번째 ${stop.name}${target ? (isContent ? ' 콘텐츠 상세 보기' : ' 장소 상세 보기') : ''}`}
    >
      <Text style={styles.num}>{index + 1}</Text>
      {isContent ? (
        stop.posterUrl ? (
          <Image source={{ uri: stop.posterUrl }} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]}>
            <MaterialCommunityIcons name="movie-open-outline" size={18} color={colors.textSecondary} />
          </View>
        )
      ) : null}
      <View style={styles.body}>
        <Text style={styles.name}>
          {stop.name}
          {stop.category ? <Text style={styles.category}>{` · ${stop.category}`}</Text> : null}
        </Text>
        {stop.reason ? <Text style={styles.reason}>{stop.reason}</Text> : null}
      </View>
      {target ? <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  setup: { gap: spacing.sm },
  label: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary, marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary },
  comment: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.xs },
  stop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', borderRadius: radius.md, paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  num: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    fontWeight: '800',
    fontSize: fontSize.caption,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  poster: { width: 40, height: 60, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  posterEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  name: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  category: { fontWeight: '600', color: colors.textSecondary },
  reason: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xxs, lineHeight: 18 },
  // 이어지는 두 장소 사이 — 번호 아래 줄에 붙는다
  distance: { fontSize: fontSize.micro, color: colors.textSecondary, marginLeft: 24 + spacing.sm, marginTop: 2 },
}));
