/**
 * 첫 실행 인트로 — 서비스 소개 4장 (AUTH-10 / 온보딩).
 *
 * 가입 직후 아무 안내 없이 홈에 떨어지던 문제를 완화한다.
 * 한 번 보면 doubly.onboardingSeen 플래그로 다시 보여주지 않는다(Splash 에서 분기).
 *
 * <p><b>실제 화면 캡처를 쓰지 않는 이유</b>: 하단 탭바 재구성(홈·럽바디·채팅·우리·럽슐랭,
 * docs/ALBUM_TAB_IA_2026-09-14.md)이 확정돼 있어 지금 찍은 스크린샷은 곧 낡는다.
 * 아이콘+문구는 화면 구조가 바뀌어도 살아남고, 문구만 고쳐 OTA 로 내보낼 수 있다.
 * 같은 이유로 아래 문구에 <b>탭 이름을 쓰지 않는다</b> — 브랜드 조어(럽슐랭)만 쓴다.
 */
import React, { useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
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
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Onboarding'>;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * 액센트는 <b>팔레트 키</b>로 들고 있다가 렌더 시점에 푼다.
 *
 * <p>모듈 최상위에서 {@code colors.me} 처럼 값을 꺼내 굳히면, 다크모드를 즉시 전환해도
 * (3fa4742) 이 배열은 앱 시작 시점의 색을 그대로 들고 있는다 — theme/colors.ts 의
 * "colors 프록시는 <b>읽는 시점</b>에 현재 팔레트를 참조한다" 주석과 같은 이유다.
 * 배경 토큰은 `<키>Bg` 규칙을 따르므로 키 하나로 둘 다 얻는다.
 */
type AccentKey = 'me' | 'partner' | 'together' | 'primary';

interface Slide {
  icon: IconName;
  accent: AccentKey;
  title: string;
  desc: string;
}

/*
 * 나=Gold / 상대=Green / 함께=Olive 순서로 Duo 팔레트를 따라가고, 마지막 한 장만
 * 크롬 색(primary)을 쓴다 — 럽슐랭은 소유자 구분이 아니라 브랜드 면이라서다.
 *
 * 문구는 "지금 이 앱에 있는 것"만 적는다. 2026-08 판 3장(기록·응원·계획)은 그 뒤 한 달간
 * 붙은 것(우리 이모지·협동 게임·사진 한 장 기록·AI 자동 분석)을 하나도 담지 못했다.
 */
const SLIDES: Slide[] = [
  {
    icon: 'camera-outline',
    accent: 'me',
    title: '사진 한 장이면 끝',
    desc: '운동도 식단도 사진만 올리면\nAI가 알아서 기록을 채워줘요.',
  },
  {
    icon: 'emoticon-outline',
    accent: 'partner',
    title: '우리 얼굴로 만든 이모티콘',
    desc: '애인 사진으로 감정 이모지를 그려\n채팅에 보내고 오늘의 기분으로 걸어요.',
  },
  {
    icon: 'gamepad-variant-outline',
    accent: 'together',
    title: '같이 놀고, 서로 응원해요',
    desc: '스도쿠·오목을 한 판에서 같이 풀고,\n서로의 기록에 반응하며 스트릭을 이어가요.',
  },
  {
    icon: 'crown',
    accent: 'primary',
    title: '우리만의 맛집 가이드',
    desc: '둘이 함께 매긴 별점이 등급이 되고,\n가고 싶은 곳이 우리 지도에 쌓여요.',
  },
];

export function OnboardingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  /*
   * 슬라이드 높이를 재서 직접 준다.
   *
   * VirtualizedList 가 각 항목을 감싸는 셀 View 는 <b>내용 높이</b>에 머물고 flex 로는
   * 늘어나지 않는다(실측: 리스트 666 / 셀 274). 그 안에서 justifyContent:'center' 를
   * 아무리 줘도 짧은 높이 안에서만 돌아, 내용이 화면 위쪽에 몰리고 아래에 빈 공간이
   * 절반쯤 남았다. 높이를 명시하면 셀도 따라 늘어나 세로 중앙 정렬이 성립한다.
   */
  const [listHeight, setListHeight] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    // storage.setItem 이 실패해도 로그인 화면으로는 넘어가야 한다 — 실패 시 여기서
    // 막히면 사용자가 온보딩에 갇힌다(QA_CHECKLIST.md P1-12). 못 저장한 채로 넘어가면
    // 다음 실행 때 온보딩을 한 번 더 보는 정도라 안전한 폴백이다.
    try {
      await storage.setItem(STORAGE_KEYS.onboardingSeen, 'true');
    } catch {
      // 저장 실패는 무시 — 화면 전환은 계속 진행한다
    }
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
        style={styles.list}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        onScroll={syncIndex}
        scrollEventThrottle={32}
        onMomentumScrollEnd={syncIndex}
        // scrollToIndex 는 레이아웃을 모르면 무시될 수 있다 — 슬라이드 폭이 고정이므로 명시
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width, height: listHeight || undefined }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors[`${item.accent}Bg`] }]}>
              <MaterialCommunityIcons name={item.icon} size={64} color={colors[item.accent]} />
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
              i === index && { backgroundColor: colors[SLIDES[index].accent], width: 20 },
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
  list: { flex: 1 },
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
