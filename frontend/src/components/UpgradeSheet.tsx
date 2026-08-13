/**
 * 업그레이드 안내 시트 — 플랜 한도에 걸렸을 때 한 곳에서 뜬다.
 *
 * <p><b>왜 전역인가</b>: 한도는 어느 화면에서든 걸린다(여행 만들기·맛집 추가·사진 업로드…).
 * 화면마다 안내를 붙이면 같은 코드가 60곳에 흩어지고, 문구도 서로 갈린다.
 * `api/client` 가 402 를 가로채 {@link usePlanStore} 에 담고, 여기서만 그린다.
 *
 * <p><b>문구는 서버가 준다.</b> "무료 플랜은 맛집 핀을 20개까지 만들 수 있어요" 같은
 * 숫자가 들어간 문장을 앱에 박아두면, 한도를 조정할 때마다 스토어 심사를 기다려야 한다.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { MaterialCommunityIcons } from './Icon';
import { usePlanStore } from '../store/planStore';
import { PURCHASE_ENABLED } from '../constants/config';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

export function UpgradeSheet() {
  const gate = usePlanStore((s) => s.gate);
  const dismiss = usePlanStore((s) => s.dismissGate);

  if (!gate) return null;

  return (
    <Sheet visible onClose={dismiss} position="bottom">
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name="heart-multiple-outline" size={26} color={colors.together} />
      </View>

      <Text style={styles.title}>PRO로 더 넉넉하게</Text>

      {/* 서버 문구 — 어떤 한도에 걸렸는지 구체적으로 알려주는 유일한 문장이다 */}
      <Text style={styles.message}>{gate.message}</Text>

      {/*
        기능을 숫자와 함께 나열하지 않는다. 여기에 "사진 무제한" 같은 값을 박으면
        Feature.java 의 한도와 어긋나는 순간 거짓말이 되고, 앱 배포 없이는 못 고친다.
      */}
      <Text style={styles.pitch}>
        사진·AI 분석·여행·추억을 넉넉하게 쓰고, 둘 중 한 명만 PRO면 함께 쓸 수 있어요.
      </Text>

      {PURCHASE_ENABLED ? (
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={dismiss}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>PRO 시작하기</Text>
        </Pressable>
      ) : (
        /*
          결제가 아직 붙지 않았다. 없는 구매 흐름으로 보내면 사용자가 막다른 길을 만난다 —
          지금은 "준비 중"이라고 말하는 게 정확하다.
        */
        <View style={styles.notice}>
          <Text style={styles.noticeText}>PRO는 준비 중이에요. 곧 만나요!</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        onPress={dismiss}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryText}>{PURCHASE_ENABLED ? '나중에' : '알겠어요'}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  iconBox: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.togetherBg,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  pitch: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  primary: {
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryText: { fontSize: fontSize.body, fontWeight: '800', color: '#FFFFFF' },
  notice: {
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  noticeText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  secondaryText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
  pressed: { opacity: 0.6 },
}));
