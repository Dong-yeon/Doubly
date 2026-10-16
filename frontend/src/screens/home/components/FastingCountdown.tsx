/**
 * 홈 단식 카운트다운 — 내 열의 최근 기록 줄("아침 · 오늘 08:28") 아래, 단식 중일 때만 한 줄.
 * 남은 시간이 1분마다 줄어든다(docs/HOME_FASTING_TIMER_ANALYSIS_2026-10-16.md §3·§5).
 *
 * <p><b>결정(2026-10-16, 사용자)</b>: 자리는 최근 기록 줄 아래, 상대 단식은 홈에 보이지 않는다(내 열에만).
 * 홈에는 종료 버튼을 두지 않는다 — 한 줄을 잘못 눌러 끝나면 되돌릴 길이 없다. 누르면 럽바디의 단식 줄로 간다.
 *
 * <p><b>시계</b>: 이 컴포넌트 안에서만 다시 그린다(홈·히어로는 그대로). 마운트 시점이 아니라 <b>정각 분</b>에 맞춰 줄인다 —
 * 아니면 "2:40"이 최대 1분 가까이 안 바뀐다. 남은 시간은 올림으로 센다(30초 남으면 "1분 남음", 0분은 없다).
 * 홈이 포커스를 잃으면 멈추고, 앱이 앞으로 오면 바로 다시 세고 서버 값도 다시 읽는다(다른 기기·식사로 끝났을 수 있다).
 */
import React, { useEffect, useState } from 'react';
import { AppState, Pressable, Text } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { themedStyles } from '../../../theme/themedStyles';
import { fontSize } from '../../../constants/theme';
import { useFastingStore } from '../../../store/fastingStore';
import type { FastingStatus } from '../../../types';

type Countdown =
  | { kind: 'counting'; remainingMin: number; elapsedMin: number }
  | { kind: 'done'; elapsedMin: number }
  /** 목표의 두 배를 넘겼다 — 끝내는 걸 잊었을 가능성이 크다. 칭찬하지 않는다(장시간 단식을 부추기지 않음) */
  | { kind: 'stale'; elapsedMin: number };

export function countdownOf(startedAtMs: number, targetHours: number, nowMs: number): Countdown {
  const targetMin = targetHours * 60;
  const elapsedMin = Math.max(0, Math.floor((nowMs - startedAtMs) / 60000));
  const remainingMs = startedAtMs + targetMin * 60000 - nowMs;
  if (remainingMs > 0) {
    // 기기 시계가 서버보다 늦으면 남은 시간이 목표보다 커 보인다 — 목표로 자른다
    return { kind: 'counting', remainingMin: Math.min(targetMin, Math.ceil(remainingMs / 60000)), elapsedMin };
  }
  return elapsedMin >= targetMin * 2 ? { kind: 'stale', elapsedMin } : { kind: 'done', elapsedMin };
}

/** 분 → "2:40" / "38분" */
function shortRemaining(min: number): string {
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

/** 분 → "2시간 40분" — 스크린리더용 */
function spoken(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function FastingCountdown({ status, onPress }: { status: FastingStatus; onPress: () => void }) {
  const focused = useIsFocused();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!focused) return;
    // 홈으로 돌아온 순간 바로 다시 센다 — 멈춰 있던 동안의 분이 한꺼번에 줄어든다
    let timer: ReturnType<typeof setTimeout> = setTimeout(() => setNow(Date.now()), 0);
    const schedule = () => {
      // 다음 정각 분 바로 뒤에 — 50ms 여유로 타이머가 조금 일찍 깨어나도 같은 분을 다시 그리지 않게
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 60000 - (Date.now() % 60000) + 50);
    };
    const first = timer;
    schedule();
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      setNow(Date.now());
      void useFastingStore.getState().load();
    });
    return () => {
      clearTimeout(first);
      clearTimeout(timer);
      sub.remove();
    };
  }, [focused]);

  const startedAtMs = status.startedAt ? Date.parse(status.startedAt) : NaN;
  if (!status.active || !status.targetHours || Number.isNaN(startedAtMs)) return null;
  const c = countdownOf(startedAtMs, status.targetHours, now);

  let text: string;
  let label: string;
  if (c.kind === 'counting') {
    text = `⏱ ${shortRemaining(c.remainingMin)} 남음`;
    label = `${status.targetHours}시간 단식, ${spoken(c.remainingMin)} 남음, ${spoken(c.elapsedMin)} 지남`;
  } else if (c.kind === 'done') {
    text = `🎉 ${status.targetHours}시간 달성`;
    label = `${status.targetHours}시간 단식 목표 달성, ${spoken(c.elapsedMin)} 지남. 식사를 기록하면 끝나요`;
  } else {
    text = `⏱ ${Math.floor(c.elapsedMin / 60)}시간째 단식 중`;
    label = `단식 ${spoken(c.elapsedMin)} 지남. 끝났다면 럽바디에서 정리해 주세요`;
  }

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="럽바디 단식 기록으로 가요"
    >
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { maxWidth: '100%' },
  pressed: { opacity: 0.6 },
  // 내 열 = 코랄(meText, 글자용 대비 값). 숫자가 1분마다 바뀌어도 폭이 흔들리지 않게 고정폭 숫자
  text: {
    color: colors.meText,
    fontSize: fontSize.caption,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
}));
