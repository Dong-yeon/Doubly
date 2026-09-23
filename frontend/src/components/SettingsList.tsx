/**
 * 묶음 목록(grouped list) — 설정·MY 처럼 "행이 쌓인 화면"의 공용 문법.
 *
 * <p><b>왜 Card 가 아닌가</b>: 설정 화면이 묶음 10개를 전부 `Card`(헤어라인 + 그림자)로
 * 그리고 있었고, 카드 좌우 패딩을 0 으로 지우는 우회까지 있었다. iOS 설정·카카오톡·토스·
 * 당근은 설정을 "떠 있는 카드"가 아니라 그림자 없는 묶음으로 그린다 — 목록은 콘텐츠가
 * 아니라 구조라서다(docs/SCREEN_DESIGN_PASS_2026-09-23.md §2-3).
 *
 * <p><b>설명은 행이 아니라 묶음의 각주다.</b> 예전엔 거의 모든 행에 캡션 설명이 붙어 화면이
 * 안내문이 됐다(설정 15곳). {@link SettingsRow} 에는 설명 prop 이 없고, {@link SettingsGroup}
 * 의 `footer` 한 번으로만 적는다. 행에 꼭 붙어야 하는 법적 문구(마케팅 수신 동의·온디바이스
 * 고지)만 `note` 로 허용한다.
 *
 * <pre>
 *   <SettingsGroup title="알림" footer="푸시 알림을 끄면 종류와 상관없이 모두 오지 않아요.">
 *     <SettingsRow title="푸시 알림" switchValue={on} onSwitch={setOn} />
 *     <SettingsRow title="알림 종류" onPress={...} />           // 오른쪽 셰브론
 *     <SettingsRow title="플랜" value="PRO" onPress={...} />    // 값 + 셰브론
 *   </SettingsGroup>
 * </pre>
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface GroupProps {
  /** 묶음 머리말 — 캡션·회색. 없으면 블록만 */
  title?: string;
  /** 묶음 각주 — 설명은 여기 한 번만 */
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SettingsGroup({ title, footer, children, style }: GroupProps) {
  // 행 사이 구분선은 자식을 세어 넣는다 — 호출부가 <Divider/> 를 끼워 넣지 않게
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.block}>
        {rows.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {child}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

interface RowProps {
  title: string;
  /** 행에 꼭 붙어야 하는 짧은 문구(법적 고지 등). 일반 설명은 Group.footer 로 */
  note?: string;
  /** 오른쪽 값 — 캡션·회색 ("PRO", "v1.2") */
  value?: string;
  /** 누를 수 있는 행 — 오른쪽에 셰브론이 붙는다 (right 를 주면 그것으로 대체) */
  onPress?: () => void;
  /** 오른쪽 슬롯을 직접 그릴 때 (Switch 는 아래 switchValue 로) */
  right?: React.ReactNode;
  /** 스위치 행 — 값·핸들러를 주면 오른쪽에 Switch 가 붙는다 */
  switchValue?: boolean;
  onSwitch?: (next: boolean) => void;
  disabled?: boolean;
  /** 진행 중 — 오른쪽 슬롯을 스피너로 바꾼다 */
  loading?: boolean;
  /** 파괴적 액션 — 빨간 글자, 셰브론 없음 */
  danger?: boolean;
  /** 비활성 안내 — 회색 글자 */
  muted?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** 제목 왼쪽에 직접 그리는 앞 슬롯(아바타 등) */
  leading?: React.ReactNode;
}

export function SettingsRow({
  title,
  note,
  value,
  onPress,
  right,
  switchValue,
  onSwitch,
  disabled,
  loading,
  danger,
  muted,
  accessibilityLabel,
  accessibilityHint,
  leading,
}: RowProps) {
  const isSwitch = typeof switchValue === 'boolean';
  const titleStyle = [styles.rowTitle, danger && styles.rowTitleDanger, muted && styles.rowTitleMuted];

  const trailing = loading ? (
    <ActivityIndicator size="small" color={danger ? colors.danger : colors.textSecondary} />
  ) : isSwitch ? (
    <Switch
      value={!!switchValue}
      onValueChange={onSwitch}
      disabled={disabled}
      trackColor={{ true: colors.primaryFill }}
      thumbColor={colors.white}
    />
  ) : right !== undefined ? (
    right
  ) : (
    <View style={styles.trailing}>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress && !danger ? (
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
      ) : null}
    </View>
  );

  const body = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text style={titleStyle} numberOfLines={2}>
          {title}
        </Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      {trailing}
    </>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
    >
      {body}
    </Pressable>
  );
}

/** 묶음 안에 행이 아닌 것(칩 줄 등)을 넣을 때의 안쪽 여백 */
export function SettingsInset({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.inset, style]}>{children}</View>;
}

const ROW_PADDING = spacing.md;

const styles = themedStyles((colors) => ({
  title: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.2,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  // 그림자 없는 블록. 바탕이 거의 흰색이라 헤어라인 하나로 경계를 준다 — 바탕 명도를 낮추면
  // (UI_UX_COMPETITIVE_REVIEW §2) 이 선은 빼도 된다
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  footer: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: ROW_PADDING },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  leading: { justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  // 500 — 설정 행이 전부 600 이면 어디가 강조인지 사라진다
  rowTitle: { fontSize: fontSize.subtitle, fontWeight: '500', color: colors.textPrimary, lineHeight: 22 },
  rowTitleDanger: { color: colors.danger },
  rowTitleMuted: { color: colors.textSecondary },
  note: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18, marginTop: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  value: { fontSize: fontSize.body, color: colors.textSecondary },
  inset: { paddingHorizontal: ROW_PADDING, paddingBottom: spacing.md },
}));
