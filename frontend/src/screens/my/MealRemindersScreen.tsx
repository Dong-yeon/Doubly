/**
 * 식사 알림 — 설정 > 알림 > 식사 알림. 2026-09-23 에 설정 본 화면에서 분리했다
 * (docs/SCREEN_DESIGN_PASS_2026-09-23.md §2-4).
 *
 * 끼니 알림 시간 프리셋 — 아직 시간 입력 UI(피커) 없이 흔한 시간대만 칩으로 고르게 한다.
 * 서버는 어떤 시각이든 받지만, 목록을 좁혀야 "몇 시로 할까" 고민 없이 바로 켤 수 있다.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert } from '../../utils/alert';
import { Chip } from '../../components/Chip';
import { SettingsGroup, SettingsInset, SettingsRow } from '../../components/SettingsList';
import { dietApi } from '../../api/diet';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import type { MealType } from '../../types';
import { spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

const MEAL_REMINDER_TYPES: { type: MealType; title: string; times: string[] }[] = [
  { type: 'BREAKFAST', title: '아침', times: ['07:00', '07:30', '08:00', '08:30', '09:00'] },
  { type: 'LUNCH', title: '점심', times: ['11:30', '12:00', '12:30', '13:00'] },
  { type: 'DINNER', title: '저녁', times: ['18:00', '18:30', '19:00', '19:30', '20:00'] },
];

export function MealRemindersScreen() {
  const user = useAuthStore((s) => s.user);
  const notificationsEnabled = user?.notificationsEnabled ?? true;

  /** 등록해둔 것만 서버가 내려준다("HH:mm" 만 잘라서 칩 비교에 쓴다). */
  const [reminders, setReminders] = useState<Partial<Record<MealType, string>>>({});
  const [saving, setSaving] = useState<MealType | null>(null);

  useEffect(() => {
    dietApi
      .reminders()
      .then((list) => {
        const map: Partial<Record<MealType, string>> = {};
        list.forEach((r) => {
          map[r.mealType] = r.reminderTime.slice(0, 5);
        });
        setReminders(map);
      })
      .catch(() => {});
  }, []);

  const onToggle = async (type: MealType, defaultTime: string, next: boolean) => {
    setSaving(type);
    try {
      if (next) {
        await dietApi.setReminder(type, defaultTime);
        setReminders((prev) => ({ ...prev, [type]: defaultTime }));
      } else {
        await dietApi.removeReminder(type);
        setReminders((prev) => {
          const copy = { ...prev };
          delete copy[type];
          return copy;
        });
      }
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  const onPickTime = async (type: MealType, time: string) => {
    setSaving(type);
    try {
      await dietApi.setReminder(type, time);
      setReminders((prev) => ({ ...prev, [type]: time }));
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <SettingsGroup
          footer={
            notificationsEnabled
              ? '정한 시간에 아직 기록 안 한 끼니만 물어봐요. 이미 기록했으면 오지 않아요.'
              : '푸시 알림이 꺼져 있어요. 설정에서 켜면 식사 알림도 와요.'
          }
        >
          {MEAL_REMINDER_TYPES.map((m) => {
            const current = reminders[m.type];
            const defaultTime = m.times[Math.floor(m.times.length / 2)];
            return (
              // 스위치 행 + (켜져 있으면) 시간 칩 줄이 한 항목이다 — Group 이 구분선을 항목 단위로 넣는다
              <View key={m.type}>
                <SettingsRow
                  title={`${m.title} 식사`}
                  value={current ?? undefined}
                  muted={!notificationsEnabled}
                  switchValue={!!current}
                  onSwitch={(next) => void onToggle(m.type, defaultTime, next)}
                  disabled={!notificationsEnabled || saving === m.type}
                />
                {current ? (
                  <SettingsInset style={styles.times}>
                    {m.times.map((t) => (
                      <Chip key={t} label={t} selected={current === t} onPress={() => void onPickTime(m.type, t)} />
                    ))}
                  </SettingsInset>
                ) : null}
              </View>
            );
          })}
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
}));
