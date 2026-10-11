/**
 * 게임 판 위 즉석 반응 바 — docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 1절.
 *
 * <p>스도쿠·오목 화면이 같이 쓴다. 누르면 상대 화면에 이모지가 떠올랐다 사라지고, 아무것도
 * 저장되지 않는다(채팅 기록도, 푸시도 없다 — 상대가 지금 그 판을 보고 있을 때만 의미 있는
 * 신호이고, 안 보고 있을 때까지 따라가면 그건 반응이 아니라 재촉이다).
 *
 * <p>구독·해제와 애니메이션을 이 컴포넌트가 다 들고 있어서, 화면은 {@code gameType} 만 주면 된다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { gameReactionApi } from '../api/game';
import { connectSocket, subscribeGameReaction, unsubscribeGameReaction } from '../api/chatSocket';
import { useAuthStore } from '../store/authStore';
import { useRelationStore } from '../store/relationStore';
import { haptics } from '../utils/haptics';
import { fontSize, radius, spacing } from '../constants/theme';
import type { GameReactionOption, GameTypeKey } from '../types';
import { themedStyles } from '../theme/themedStyles';

/** 목록은 커플·게임과 무관하게 고정이라 앱 수명 동안 한 번만 받는다 */
let cachedOptions: GameReactionOption[] | null = null;
/** 목록을 못 받아도 바가 통째로 사라지지는 않게 — 서버와 같은 순서·같은 이모지 */
const FALLBACK_OPTIONS: GameReactionOption[] = [
  { key: 'CLAP', emoji: '👏', label: '잘한다' },
  { key: 'WOW', emoji: '😮', label: '우와' },
  { key: 'THINK', emoji: '🤔', label: '음…' },
  { key: 'LAUGH', emoji: '😂', label: 'ㅋㅋㅋ' },
  { key: 'HEART', emoji: '❤️', label: '하트' },
  { key: 'TEASE', emoji: '😤', label: '두고 보자' },
];

/** 떠오르는 이모지 하나 */
interface Floating {
  id: number;
  emoji: string;
  /** 보낸 사람 이름 — 내가 보낸 것은 이름을 달지 않는다 */
  from?: string;
}

const FLOAT_MILLIS = 1600;
let floatSeq = 0;

export function GameReactionBar({ gameType }: { gameType: GameTypeKey }) {
  const relationId = useRelationStore((s) => s.couple?.id);
  const myId = useAuthStore((s) => s.user?.id);
  const [options, setOptions] = useState<GameReactionOption[]>(cachedOptions ?? FALLBACK_OPTIONS);
  const [floating, setFloating] = useState<Floating[]>([]);

  useEffect(() => {
    if (cachedOptions) return;
    gameReactionApi
      .options()
      .then((list) => {
        if (list.length === 0) return; // 빈 목록이 오면 fallback 을 유지한다
        cachedOptions = list;
        setOptions(list);
      })
      .catch(() => undefined); // fallback 으로 계속 쓴다
  }, []);

  const float = useCallback((emoji: string, from?: string) => {
    const id = ++floatSeq;
    setFloating((prev) => [...prev, { id, emoji, from }]);
    setTimeout(() => setFloating((prev) => prev.filter((f) => f.id !== id)), FLOAT_MILLIS);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!relationId) return undefined;
      let active = true;
      connectSocket()
        .then(() => {
          if (!active) return;
          subscribeGameReaction(relationId, (e) => {
            // 상대가 다른 게임 화면에 있으면 그 반응은 이 화면의 것이 아니다
            if (e.gameType !== gameType) return;
            // 내가 보낸 것은 누를 때 이미 띄웠다
            if (myId != null && e.senderId === myId) return;
            float(e.emoji, e.senderName);
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        unsubscribeGameReaction(relationId);
      };
    }, [relationId, gameType, myId, float]),
  );

  if (!relationId) return null;

  const send = (option: GameReactionOption) => {
    // 내 화면에서는 서버 왕복을 기다리지 않는다 — 실패해도 되돌리지 않는다.
    // 반응은 저장되는 상태가 아니라 신호라서, 실패를 토스트로 알리면 오히려 더 시끄럽다.
    float(option.emoji);
    haptics.light();
    gameReactionApi.send(gameType, option.key).catch(() => undefined);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.floatLayer} pointerEvents="none">
        {floating.map((f) => (
          <FloatingEmoji key={f.id} emoji={f.emoji} from={f.from} />
        ))}
      </View>
      <View style={styles.bar}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => send(o)}
            accessibilityRole="button"
            accessibilityLabel={`${o.label} 반응 보내기`}
            style={({ pressed }) => [styles.key, pressed && styles.pressed]}
          >
            <Text style={styles.emoji}>{o.emoji}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** 떠올랐다 흐려지며 사라지는 이모지 하나 — 수명은 부모가 타이머로 관리한다 */
function FloatingEmoji({ emoji, from }: { emoji: string; from?: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  /* 같은 순간에 여러 개가 겹치지 않도록 가로 위치만 흩뿌린다 */
  const offset = useRef(Math.random() * 120 - 60).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: FLOAT_MILLIS, useNativeDriver: true }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.floating,
        {
          transform: [
            { translateX: offset },
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, -70] }) },
            { scale: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] }) },
          ],
          opacity: anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
        },
      ]}
    >
      <Text style={styles.floatingEmoji}>{emoji}</Text>
      {from ? (
        <Text style={styles.floatingFrom} numberOfLines={1}>
          {from}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { marginTop: spacing.md },
  pressed: { opacity: 0.55 },
  /* 바 위쪽 공간에 겹쳐 띄운다 — 레이아웃을 밀지 않도록 absolute */
  floatLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    height: 90,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  floating: { position: 'absolute', alignItems: 'center' },
  floatingEmoji: { fontSize: 34 },
  floatingFrom: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, marginTop: 2 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  key: {
    width: 44,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emoji: { fontSize: fontSize.subtitle },
}));
