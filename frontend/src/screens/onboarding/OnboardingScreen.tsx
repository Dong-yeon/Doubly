/**
 * 첫 실행 인트로 — 서비스 소개 3장 (AUTH-10 / 온보딩).
 *
 * 가입 직후 아무 안내 없이 홈에 떨어지던 문제를 완화한다.
 * 한 번 보면 doubly.onboardingSeen 플래그로 다시 보여주지 않는다(Splash 에서 분기).
 */
import React, { useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '../../components/Icon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { storage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../constants/config';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Onboarding'>;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Slide {
  icon: IconName;
  accent: string;
  accentBg: string;
  title: string;
  desc: string;
}

// 나=Coral / 상대=Indigo / 함께=Violet 순서로 Duo 팔레트를 따라간다
const SLIDES: Slide[] = [
  {
    icon: 'clipboard-text-outline',
    accent: colors.coral,
    accentBg: colors.meBg,
    title: '함께 기록해요',
    desc: '운동·식단·일상을 둘이 함께 남겨요.\n오늘 하루가 우리의 기록이 됩니다.',
  },
  {
    icon: 'hand-heart-outline',
    accent: colors.indigo,
    accentBg: colors.partnerBg,
    title: '서로 응원해요',
    desc: '상대의 기록에 반응하고,\n함께한 날들을 스트릭으로 이어가요.',
  },
  {
    icon: 'map-marker-radius-outline',
    accent: colors.violet,
    accentBg: colors.togetherBg,
    title: '함께 계획해요',
    desc: '가고 싶은 맛집과 여행을 같이 담고,\n둘만의 추억을 쌓아가요.',
  },
];

export function OnboardingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    await storage.setItem(STORAGE_KEYS.onboardingSeen, 'true');
    navigation.replace('Login');
  };

  const onNext = () => {
    if (isLast) {
      finish();
      return;
    }
    /*
     * 웹(react-native-web)은 onMomentumScrollEnd 를 발화하지 않아 스크롤 콜백만으로는
     * index 가 영영 갱신되지 않는다. 버튼이 상태를 직접 전진시키고, 스크롤 콜백은
     * 네이티브에서 손가락 스와이프를 동기화하는 보조 역할만 한다.
     */
    const next = index + 1;
    setIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  };

  /**
   * 스크롤 위치 → 현재 페이지 동기화.
   *
   * <p><b>{@code onScroll} 에도 물려야 한다.</b> 웹(react-native-web)은
   * {@code onMomentumScrollEnd} 를 발화하지 않아서, 버튼을 누르지 않고 스와이프로만
   * 마지막 장까지 넘기면 index 가 0 에 멈춘다 — 버튼이 "시작하기"로 안 바뀌고
   * "다음"인 채로 남아 한 번 더 눌러야 했다.
   */
  const syncIndex = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index && next >= 0 && next < SLIDES.length) {
      setIndex(next);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.skipRow}>
        <Pressable
          onPress={finish}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="인트로 건너뛰기"
        >
          <Text style={styles.skipText}>건너뛰기</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={syncIndex}
        scrollEventThrottle={32}
        onMomentumScrollEnd={syncIndex}
        // scrollToIndex 는 레이아웃을 모르면 무시될 수 있다 — 슬라이드 폭이 고정이므로 명시
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconCircle, { backgroundColor: item.accentBg }]}>
              <MaterialCommunityIcons name={item.icon} size={64} color={item.accent} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View
            key={s.title}
            style={[
              styles.dot,
              i === index && { backgroundColor: SLIDES[index].accent, width: 20 },
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Button title={isLast ? '시작하기' : '다음'} onPress={onNext} />
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  skipText: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.heading,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
}));
