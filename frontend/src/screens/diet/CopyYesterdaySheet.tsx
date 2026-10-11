/**
 * 어제 식단 불러오기 — 끼니를 골라서(2026-10-08 사용자 보고).
 *
 * <p>예전엔 버튼 한 번에 어제 하루를 통째로 오늘로 옮겼다. 그러면 ① 아침에 누르면 아직 안 먹은 점심·저녁까지 기록되고
 * ② 오늘 점심을 따로 남긴 뒤 누르면 어제 점심이 한 끼 더 붙었다. 이제 어제 끼니를 보여 주고 고른 것만 옮긴다.
 * <ul>
 *   <li>처음엔 <b>지금 시간대의 끼니만</b> 골라 둔다(아침이면 아침) — 대부분은 그대로 [불러오기]만 누르면 된다.</li>
 *   <li>오늘 이미 기록한 끼니는 고를 수 없다(서버도 건너뛴다 — MealService.copyFrom).</li>
 * </ul>
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Checkbox } from '../../components/Checkbox';
import { Button } from '../../components/Button';
import { dietApi } from '../../api/diet';
import { defaultMealType } from '../../utils/mealType';
import { formatKcal } from '../../utils/format';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { Meal, MealType } from '../../types';

const ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

interface Props {
  visible: boolean;
  onClose: () => void;
  yesterday: Meal[];
  today: Meal[];
  /** 불러온 뒤 — 목록을 다시 받는다 */
  onCopied: () => void;
}

/** 끼니 한 묶음 — 어제 간식이 둘이면 한 줄에 함께 */
interface Group {
  type: MealType;
  label: string;
  summary: string;
  calories: number;
  count: number;
  recordedToday: boolean;
}

function summarize(meals: Meal[]): string {
  const names = meals.flatMap((m) => (m.items?.length ? m.items.map((i) => i.name) : m.memo ? [m.memo] : []));
  if (names.length === 0) return '사진·칼로리만 있는 기록';
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개` : names.join(', ');
}

export function CopyYesterdaySheet({ visible, onClose, yesterday, today, onCopied }: Props) {
  const groups = useMemo<Group[]>(() => {
    const todayTypes = new Set(today.map((m) => m.mealType));
    return ORDER.flatMap((type) => {
      const meals = yesterday.filter((m) => m.mealType === type);
      if (meals.length === 0) return [];
      return [
        {
          type,
          label: meals[0].mealTypeLabel ?? type,
          summary: summarize(meals),
          calories: meals.reduce((s, m) => s + (m.calories ?? 0), 0),
          count: meals.length,
          recordedToday: todayTypes.has(type),
        },
      ];
    });
  }, [yesterday, today]);

  // 처음엔 지금 시간대의 끼니만 — 아침에 저녁까지 기록되지 않게
  const initial = useMemo(() => {
    const now = defaultMealType();
    const g = groups.find((x) => x.type === now && !x.recordedToday);
    return new Set<MealType>(g ? [g.type] : []);
  }, [groups]);
  const [picked, setPicked] = useState<Set<MealType> | null>(null);
  const selected = picked ?? initial;
  const [copying, setCopying] = useState(false);

  const close = () => {
    setPicked(null);
    onClose();
  };

  const toggle = (type: MealType, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(type);
    else next.delete(type);
    setPicked(next);
  };

  const onCopy = async () => {
    if (selected.size === 0) return;
    setCopying(true);
    try {
      const copied = await dietApi.copyFromYesterday([...selected]);
      haptics.success();
      toast.success(`어제 식단 ${copied.length}개를 불러왔어요`);
      close();
      onCopied();
    } catch (e) {
      toast.error(getErrorMessage(e, '어제 식단을 불러오지 못했어요.'));
    } finally {
      setCopying(false);
    }
  };

  const available = groups.filter((g) => !g.recordedToday);

  return (
    <Sheet visible={visible} onClose={close} position="bottom">
      <Text style={styles.title}>어제 식단 불러오기</Text>
      <Text style={styles.hint}>오늘 먹은 끼니만 골라 주세요. 오늘 이미 기록한 끼니는 불러올 수 없어요.</Text>
      <View style={styles.list}>
        {groups.map((g) => (
          <View key={g.type} style={g.recordedToday ? styles.disabled : undefined}>
            <Checkbox
              checked={selected.has(g.type) && !g.recordedToday}
              onChange={(on) => {
                if (!g.recordedToday) toggle(g.type, on);
              }}
              label={`${g.label}${g.count > 1 ? ` ${g.count}개` : ''} · ${g.calories > 0 ? formatKcal(g.calories) : '칼로리 없음'}`}
            />
            <Text style={styles.summary} numberOfLines={1}>
              {g.recordedToday ? '오늘 이미 기록했어요' : g.summary}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Button title="취소" variant="ghost" size="md" onPress={close} style={styles.flex} />
        <Button
          title={selected.size > 0 ? `${selected.size}끼 불러오기` : '끼니를 골라 주세요'}
          size="md"
          onPress={onCopy}
          loading={copying}
          disabled={selected.size === 0 || available.length === 0}
          style={styles.flex}
        />
      </View>
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  flex: { flex: 1 },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
  list: { gap: spacing.sm },
  disabled: { opacity: 0.45 },
  summary: { fontSize: fontSize.caption, color: colors.textSecondary, marginLeft: spacing.xl + spacing.xs, marginTop: -spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
}));
