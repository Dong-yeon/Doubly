/**
 * 원판 계산기 — 목표 무게를 바에 걸려면 <b>한쪽에 뭘 끼우나</b>를 알려준다.
 *
 * <p>헬스장에서 실제로 하는 계산은 "100kg 하려면… 바가 20이니까 80, 반으로 40, 20+15+5"다.
 * 세트마다 이걸 암산하다 틀리면 무게가 어긋난 채로 기록이 남는다.
 * 짐워크·번핏을 포함한 기록 앱들이 대체로 갖고 있는 이유가 이거다.
 *
 * <p><b>한쪽 기준으로 보여준다</b> — 양쪽 합을 보여주면 결국 다시 반으로 나눠야 한다.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

/** 흔한 바 무게 — 0 은 머신·덤벨처럼 바가 없는 경우 */
const BARS = [
  { kg: 20, label: '20kg 바' },
  { kg: 15, label: '15kg 바' },
  { kg: 10, label: '10kg 바' },
  { kg: 0, label: '바 없음' },
];

/** 한국 헬스장에서 흔한 원판 구성 (kg), 큰 것부터 */
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/**
 * 한쪽에 끼울 원판을 큰 것부터 채운다.
 *
 * @returns 끼울 원판 목록과 <b>맞추지 못한 나머지</b>. 나머지가 있으면 그 무게는
 *          지금 원판 구성으로는 정확히 만들 수 없다는 뜻이라 숨기지 않고 알려준다.
 */
function platesPerSide(totalKg: number, barKg: number): { plates: number[]; remainderKg: number } {
  let side = (totalKg - barKg) / 2;
  if (!Number.isFinite(side) || side <= 0) return { plates: [], remainderKg: 0 };
  const plates: number[] = [];
  for (const plate of PLATES) {
    while (side >= plate - 1e-9) {
      plates.push(plate);
      side -= plate;
    }
  }
  return { plates, remainderKg: Math.round(side * 100) / 100 };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(n));

interface Props {
  visible: boolean;
  /** 계산할 목표 무게(kg). 비어 있으면 안내만 보여준다 */
  targetKg: number | null;
  onClose: () => void;
}

export function PlateCalculatorSheet({ visible, targetKg, onClose }: Props) {
  const [barKg, setBarKg] = useState(20);
  const result = useMemo(
    () => (targetKg == null ? null : platesPerSide(targetKg, barKg)),
    [targetKg, barKg],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>
            원판 계산 {targetKg != null ? `· ${fmt(targetKg)}kg` : ''}
          </Text>

          <View style={styles.barRow}>
            {BARS.map((b) => (
              <Pressable
                key={b.kg}
                style={[styles.barChip, barKg === b.kg && styles.barChipActive]}
                onPress={() => setBarKg(b.kg)}
                accessibilityRole="button"
                accessibilityState={{ selected: barKg === b.kg }}
              >
                <Text style={[styles.barChipText, barKg === b.kg && styles.barChipTextActive]}>
                  {b.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {targetKg == null ? (
            <Text style={styles.hint}>무게를 먼저 적어주세요.</Text>
          ) : result && result.plates.length === 0 ? (
            <Text style={styles.hint}>
              {targetKg <= barKg
                ? '바 무게보다 가벼워요 — 원판이 필요 없어요.'
                : '이 무게는 원판으로 만들 수 없어요.'}
            </Text>
          ) : (
            <>
              <Text style={styles.sideLabel}>한쪽에</Text>
              <View style={styles.plateRow}>
                {result?.plates.map((plate, i) => (
                  <View key={`${plate}-${i}`} style={styles.plate}>
                    <Text style={styles.plateText}>{fmt(plate)}</Text>
                  </View>
                ))}
              </View>
              {result && result.remainderKg > 0 ? (
                <Text style={styles.remainder}>
                  {fmt(result.remainderKg)}kg 모자라요 — 가장 가까운 무게는{' '}
                  {fmt(targetKg - result.remainderKg * 2)}kg 예요.
                </Text>
              ) : null}
            </>
          )}

          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },

  barRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  barChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  barChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  barChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  barChipTextActive: { color: colors.primary },

  sideLabel: { fontSize: fontSize.caption, color: colors.textSecondary },
  plateRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  // 원판처럼 보이게 — 숫자만 나열하는 것보다 실제로 집어야 할 개수가 눈에 들어온다
  plate: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  plateText: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
  remainder: { fontSize: fontSize.caption, color: colors.coral },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, paddingVertical: spacing.md },

  close: { alignItems: 'center', paddingVertical: spacing.sm },
  closeText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
}));
