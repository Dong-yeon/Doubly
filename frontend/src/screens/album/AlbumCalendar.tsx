/**
 * 사진첩 달력 보기 — "우리" 탭의 두 번째 모양(docs/photo-feed-current-state.md §10).
 *
 * <p>칸 하나가 하루다. 그날(기록일 기준) 사진이 있으면 <b>가장 최근 사진</b>을 칸에 깔고 장수를
 * 붙인다. 날짜는 올린 날이 아니라 먹은·운동한·다녀온 날이다(2026-10-02 결정) — 지난 날짜로
 * 늦게 올린 끼니도 그 날 칸에 앉는다.
 *
 * <p>데이터는 부모(AlbumScreen)가 한 달치를 통째로 받아 넘긴다(`GET /feed/photos/month`).
 * 칸을 누르면 부모가 그날 첫 사진부터 뷰어를 열고, 계속 넘기면 그 달의 다른 날로 이어진다.
 *
 * <p>요일·일요일 색·이전/다음 달 버튼은 커플 캘린더(CoupleCalendarScreen)와 같은 문법이다.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CachedImage } from '../../components/CachedImage';
import { MaterialCommunityIcons } from '../../components/Icon';
import { useContentWidth } from '../../hooks/useContentWidth';
import { thumbnailUrl } from '../../utils/imageUrl';
import { toDateString } from '../../utils/date';
import type { FeedPhoto } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const GAP = 2;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM' 을 delta 달만큼 옮긴다 */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** 이번 달 'YYYY-MM' — 기기 날짜 기준(커플 캘린더와 같다) */
export function currentMonth(): string {
  return toDateString().slice(0, 7);
}

interface Props {
  /** 'YYYY-MM' */
  month: string;
  /** 그 달의 사진 — 서버 순서(기록일·올린 시각 최신순) 그대로 */
  items: FeedPhoto[];
  loading: boolean;
  error: boolean;
  /** 서버가 상한에 걸려 일부를 뺐다 */
  truncated: boolean;
  /** 필터가 걸려 있으면 빈 달 문구를 바꾼다 */
  filtered: boolean;
  onMove: (delta: -1 | 1) => void;
  onPressDay: (date: string) => void;
  onRetry: () => void;
}

export function AlbumCalendar({ month, items, loading, error, truncated, filtered, onMove, onPressDay, onRetry }: Props) {
  const width = useContentWidth() - layout.screenPadding * 2;
  const cell = Math.floor((width - GAP * 6) / 7);
  const today = toDateString();
  const canNext = month < currentMonth();

  /** 날짜 → 그날 사진들(최신순). 서버 순서를 지키므로 [0] 이 칸의 대표 사진이다 */
  const byDate = useMemo(() => {
    const map = new Map<string, FeedPhoto[]>();
    for (const p of items) {
      if (!p.recordDate) continue;
      const list = map.get(p.recordDate);
      if (list) list.push(p);
      else map.set(p.recordDate, [p]);
    }
    return map;
  }, [items]);

  const cells = useMemo(() => {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const blanks = new Date(y, m - 1, 1).getDay();
    const lastDay = new Date(y, m, 0).getDate();
    const arr: (number | null)[] = Array(blanks).fill(null);
    for (let d = 1; d <= lastDay; d++) arr.push(d);
    return arr;
  }, [month]);

  const photoCount = (list: FeedPhoto[]) =>
    list.reduce((n, p) => n + (p.imageUrls && p.imageUrls.length > 0 ? p.imageUrls.length : 1), 0);

  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];

  return (
    <View style={styles.root}>
      <View style={styles.monthRow}>
        <Pressable
          style={styles.monthBtn}
          onPress={() => onMove(-1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="이전 달"
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.monthTitleWrap}>
          <Text style={styles.monthTitle}>
            {y}년 {m}월
          </Text>
          {/* 달을 넘길 때 칸은 그대로 두고 제목 옆에서만 돈다 — 격자가 깜빡이지 않게 */}
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>
        <Pressable
          style={[styles.monthBtn, !canNext && styles.monthBtnDisabled]}
          onPress={() => onMove(1)}
          disabled={!canNext}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          accessibilityState={{ disabled: !canNext }}
        >
          <MaterialCommunityIcons name="chevron-right" size={26} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, { width: cell }, i === 0 && { color: colors.sunday }]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={`b${idx}`} style={{ width: cell, height: cell }} />;
          const date = `${month}-${pad2(day)}`;
          const list = byDate.get(date);
          const cover = list?.[0];
          const isToday = date === today;
          const sunday = idx % 7 === 0;
          if (!cover || !list) {
            return (
              <View key={date} style={[styles.cell, { width: cell, height: cell }]}>
                <Text style={[styles.dayEmpty, sunday && { color: colors.sunday }, isToday && styles.dayToday]}>
                  {day}
                </Text>
              </View>
            );
          }
          const count = photoCount(list);
          return (
            <Pressable
              key={date}
              style={({ pressed }) => [styles.cell, { width: cell, height: cell }, pressed && styles.cellPressed]}
              onPress={() => onPressDay(date)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${m}월 ${day}일 사진 ${count}장 보기`}
            >
              <CachedImage uri={thumbnailUrl(cover.imageUrl, cell)} style={styles.cover} contentFit="cover" recyclingKey={date} />
              {/* 사진 위 글자 — 테마와 무관하게 흰 글자 + 어두운 알약 */}
              <View style={[styles.dayPill, isToday && styles.dayPillToday]}>
                <Text style={styles.dayOnPhoto}>{day}</Text>
              </View>
              {count > 1 ? (
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>이 달의 사진을 불러오지 못했어요.</Text>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.cellPressed]}
            accessibilityRole="button"
            accessibilityLabel="이 달 사진 다시 불러오기"
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : !loading && items.length === 0 ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {filtered ? '이 달엔 조건에 맞는 사진이 없어요.' : '이 달엔 남긴 사진이 없어요.'}
          </Text>
        </View>
      ) : truncated ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>사진이 많아 이 달은 일부만 보여요.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  root: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.xs },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  monthBtn: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnDisabled: { opacity: 0.3 },
  monthTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  monthTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  weekRow: { flexDirection: 'row', gap: GAP, marginBottom: spacing.xs },
  weekday: {
    textAlign: 'center',
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  cellPressed: { opacity: 0.7 },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dayEmpty: { fontSize: fontSize.caption, color: colors.textSecondary },
  dayToday: { color: colors.primary, fontWeight: '800' },
  dayPill: {
    position: 'absolute',
    top: 3,
    left: 3,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
  },
  // 오늘 — 사진 위에서도 보이게 알약 색을 바꾼다
  dayPillToday: { backgroundColor: colors.primary },
  dayOnPhoto: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  countPill: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  countText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  notice: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  noticeText: { fontSize: fontSize.caption, color: colors.textSecondary },
  retryBtn: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
}));
