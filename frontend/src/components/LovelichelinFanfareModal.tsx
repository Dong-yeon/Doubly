/**
 * 럽슐랭 등극 축하 모달 — 나/상대 대표 평점이 모두 모여 등급이 0→양수로 바뀐 순간에만 띄운다
 * (재평가로 같은 등급을 유지하거나 등급이 내려갈 때는 호출부에서 열지 않는다).
 *
 * <p>{@link Sheet} 위에 {@link Toast}와 같은 스타일(`Animated.spring`, `useNativeDriver`)의
 * 스케일 인 애니메이션만 얹는다 — 전용 fanfare 컴포넌트가 없어 이 두 재료로 새로 만든다.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { shareText } from '../utils/share';
import { toast } from '../store/toastStore';

interface Props {
  visible: boolean;
  /** 1~3 — 0 이면 열리지 않은 것과 같으므로 호출부가 애초에 열지 않는다 */
  tier: number;
  placeName: string;
  onClose: () => void;
}

export function LovelichelinFanfareModal({ visible, tier, placeName, onClose }: Props) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.85);
    opacity.setValue(0);
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const onShare = async () => {
    const result = await shareText(`🎉 럽슐랭 ${tier}스타 등극! — ${placeName}\n둘이 함께 검증한 우리만의 미식 스팟이에요.`);
    if (result === 'copied') toast.success('클립보드에 복사했어요.');
  };

  if (tier <= 0) return null;

  return (
    <Sheet visible={visible} onClose={onClose} position="center">
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="crown" size={40} color={colors.togetherText} />
        </View>
        <Text style={styles.stars}>{'★'.repeat(tier)}</Text>
        <Text style={styles.title}>럽슐랭 {tier}스타 등극!</Text>
        <Text style={styles.place}>{placeName}</Text>
        <Text style={styles.desc}>둘이 함께 검증한 우리만의 미식 스팟이에요.</Text>
        <View style={styles.actions}>
          <Button title="공유하기" variant="secondary" size="md" onPress={onShare} style={styles.flex} />
          <Button title="닫기" size="md" onPress={onClose} style={styles.flex} />
        </View>
      </Animated.View>
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  iconWrap: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.togetherBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stars: { textAlign: 'center', fontSize: 28, color: colors.togetherText, marginBottom: spacing.xs },
  title: { textAlign: 'center', fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  place: {
    textAlign: 'center',
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  desc: {
    textAlign: 'center',
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
}));
