/**
 * 이번 주(월~일) 기록 띠 — 칸마다 나·상대의 기록 여부.
 *
 * <p><b>사람은 색이 아니라 자리와 모양으로 말한다.</b> 소유자 3색(나·상대·함께)은 명도가 같아
 * 적록색약·흑백에서 구별되지 않는다(docs/UI_UX_COMPETITIVE_REVIEW_2026-09-22.md §3-2). 그래서
 * <ul>
 *   <li>칸 안 <b>왼쪽 점 = 나, 오른쪽 점 = 상대</b> — 자리가 고정이라 색을 못 봐도 누구인지 안다</li>
 *   <li>기록 있음 = 채운 원 ●, 없음 = 빈 원 ○ — 모양이 기록 여부를 말한다</li>
 *   <li>둘 다 = 두 점 사이 짧은 연결선</li>
 * </ul>
 * 색은 보조다. 점에는 진한 소유자 값(me·partner)을 쓴다 — 연한 fill 토큰은 배경 대비 3:1 미만이다.
 *
 * <p>럽바디(식단)와 운동 홈(운동)이 같이 쓴다. 1차는 탭 동작이 없다 — 날짜별로 보여줄 화면이 아직 없다
 * (LOVEBODY_REVIEW_2026-10-02 §2-3).
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { toDateString } from '../utils/date';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 이번 주 월요일부터 7일 — 서버의 주 시작(DayOfWeek.MONDAY)과 같다 */
function thisWeekDates(): Date[] {
  const today = new Date();
  const day = today.getDay(); // 0=일 … 6=토
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

interface Props {
  /** 내가 기록한 날짜(YYYY-MM-DD) */
  myDates: readonly string[];
  /** 상대가 기록한 날짜 — showPartner 가 false 면 보지 않는다 */
  partnerDates?: readonly string[] | null;
  /** 커플 연결 — false 면 칸마다 내 점 하나만 그린다 */
  showPartner: boolean;
  /** 스크린리더 문장에 넣을 무엇의 기록인지 — "식단", "운동" */
  what: string;
}

export function WeekStrip({ myDates, partnerDates, showPartner, what }: Props) {
  const days = useMemo(() => thisWeekDates(), []);
  const todayKey = toDateString();
  const mine = useMemo(() => new Set(myDates), [myDates]);
  const theirs = useMemo(() => new Set(partnerDates ?? []), [partnerDates]);

  return (
    <View style={styles.strip}>
      {days.map((d) => {
        const key = toDateString(d);
        const isToday = key === todayKey;
        const future = key > todayKey;
        const me = mine.has(key);
        const partner = showPartner && theirs.has(key);
        const label =
          `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY[d.getDay()]}요일${isToday ? ' 오늘' : ''}, ` +
          (future
            ? '아직'
            : `나 ${what} ${me ? '기록함' : '없음'}${showPartner ? `, 상대 ${partner ? '기록함' : '없음'}` : ''}`);
        return (
          <View key={key} style={styles.cell} accessible accessibilityLabel={label}>
            <Text style={[styles.weekday, isToday && styles.weekdayToday]}>{WEEKDAY[d.getDay()]}</Text>
            <View style={[styles.dateWrap, isToday && styles.dateWrapToday]}>
              <Text style={[styles.date, isToday && styles.dateToday]}>{d.getDate()}</Text>
            </View>
            {/* 점이 없는 미래 칸도 높이를 지켜야 요일 숫자가 들썩이지 않는다 */}
            <View style={styles.dots}>
              {future ? null : (
                <>
                  <Dot filled={me} color={colors.me} />
                  {showPartner ? (
                    <>
                      <View style={[styles.link, me && partner && styles.linkOn]} />
                      <Dot filled={partner} color={colors.partner} />
                    </>
                  ) : null}
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Dot({ filled, color }: { filled: boolean; color: string }) {
  return <View style={[styles.dot, filled ? { backgroundColor: color, borderColor: color } : styles.dotEmpty]} />;
}

const DOT = 8;

const styles = themedStyles((colors) => ({
  strip: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  weekday: { fontSize: fontSize.micro, color: colors.textMuted, fontWeight: '600' },
  weekdayToday: { color: colors.textPrimary, fontWeight: '800' },
  dateWrap: { minWidth: 26, height: 26, paddingHorizontal: 2, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  // 오늘 — 진한 채움 원. 색이 아니라 "칸 하나만 채워져 있다"는 모양으로도 읽힌다
  dateWrapToday: { backgroundColor: colors.primary },
  date: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  dateToday: { color: colors.onPrimary },
  dots: { height: DOT + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5 },
  // 빈 원 — 소유자 색을 쓰지 않는다(없음은 누구의 것도 아니다). 테두리 대비는 textMuted 기준
  dotEmpty: { backgroundColor: 'transparent', borderColor: colors.textMuted },
  link: { width: 4, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  linkOn: { backgroundColor: colors.textSecondary },
}));
