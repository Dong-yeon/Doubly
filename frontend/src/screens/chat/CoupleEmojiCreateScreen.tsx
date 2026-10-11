/**
 * 우리 이모지 만들기 — 사진 한 장 → 감정 캐릭터 세트(23종을 여러 번 나눠 모은다).
 * docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §7 (프론트 1단계).
 *
 * <p><b>왜 진행률 바가 아니라 6칸인가</b>: 세트 하나가 60초 안팎이고 서버가 감정 하나를
 * 끝낼 때마다 <b>즉시 저장</b>한다(CoupleEmojiService 클래스 주석). 그래서 목록을 다시
 * 부르면 칸이 하나씩 채워진다 — 60초를 견디게 하는 건 이것뿐이라는 게 설계 결론이었다.
 *
 * <p><b>기다리기를 그만둬도 작업은 계속된다.</b> {@code awaitAiJob} 은 2분에서 포기하지만
 * 서버는 만들어 저장한다(aiJob.ts 주석). 화면을 떠나도 마찬가지라, 여기서 실패로 처리하면
 * 안 되고 "트레이에서 확인하라"고 안내한다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { Avatar } from '../../components/Avatar';
import { AvatarCropSheet } from '../../components/AvatarCropSheet';
import { Button } from '../../components/Button';
import { MaterialCommunityIcons } from '../../components/Icon';
import { LockedCard } from '../../components/LockedCard';
import { Sheet } from '../../components/Sheet';
import { awaitAiJob } from '../../api/aiJob';
import { startCoupleEmojiGeneration } from '../../api/coupleEmoji';
import { useAuthStore } from '../../store/authStore';
import { useCoupleEmojiStore } from '../../store/coupleEmojiStore';
import { usePlanStore } from '../../store/planStore';
import { useRelationStore } from '../../store/relationStore';
import { toast } from '../../store/toastStore';
import { Alert } from '../../utils/alert';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import { pickImageAsset, takePhotoAsset, type PickedImage } from '../../utils/imageUpload';
import { fetchEmojiSetProduct, requestEmojiSetPurchase } from '../../utils/iap';
import { PURCHASE_ENABLED } from '../../constants/config';
import {
  COUPLE_EMOJI_EMOTIONS,
  COUPLE_EMOJI_GROUP_LABEL,
  MAX_EMOJI_PER_REQUEST,
  coupleEmojiEmotionOf,
  type CoupleEmojiEmotionDef,
} from '../../constants/coupleEmojiEmotions';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { CoupleEmoji, CoupleEmojiBatch, CoupleEmojiEmotion } from '../../types';

type Props = NativeStackScreenProps<ChatStackParamList, 'CoupleEmojiCreate'>;

/**
 * 칸을 다시 세는 주기. 장당 8~15초라 이보다 자주 물어봐야 "채워지는" 느낌이 나지만,
 * 목록 조회가 관계 전체를 훑으므로 더 짧게 잡을 이유도 없다.
 */
const PROGRESS_POLL_MS = 4000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function CoupleEmojiCreateScreen({ navigation }: Props) {
  const me = useAuthStore((s) => s.user);
  const couple = useRelationStore((s) => s.couple);
  const partner = couple?.partner ?? null;
  const allowed = usePlanStore((s) => s.can('AI_COUPLE_EMOJI'));
  const emojiState = usePlanStore((s) => s.stateOf('AI_COUPLE_EMOJI'));
  const buyerId = useAuthStore((s) => s.user?.id);
  /*
   * 세트 추가(소모성 상품) — 정액 구독 밖에서 파는 "한 세트 더". 스토어에 상품이 있을 때만 가격이
   * 오고, 그때만 버튼을 그린다(없는 상품을 팔지 않는다). FREE 는 구독 없이 하나를 사 볼 수 있고,
   * PRO 는 월 한도를 다 쓴 뒤 더 산다. 산 세트는 서버가 플랜 잔여 횟수에 합산해 내려준다
   * (docs/BILLING_STATUS_2026-09-25.md §7).
   */
  const [setPrice, setSetPrice] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  useEffect(() => {
    if (!PURCHASE_ENABLED) return;
    void fetchEmojiSetProduct().then((product) => setSetPrice(product?.displayPrice ?? null));
  }, []);
  const exhausted = !allowed || emojiState?.remaining === 0;
  const canBuySet = PURCHASE_ENABLED && !!setPrice && !!buyerId && exhausted;
  const onBuySet = async () => {
    if (!buyerId || buying) return;
    setBuying(true);
    try {
      await requestEmojiSetPurchase(buyerId);
    } catch (e) {
      toast.error(getErrorMessage(e, '결제를 시작하지 못했어요. 잠시 후 다시 시도해주세요.'));
    } finally {
      setBuying(false);
    }
  };

  const loadEmojis = useCoupleEmojiStore((s) => s.load);
  const allEmojis = useCoupleEmojiStore((s) => s.emojis);
  const removeEmoji = useCoupleEmojiStore((s) => s.remove);

  /*
   * 누구 얼굴인가 — 애인이 기본(§3). 골랐을 때만 상태를 남기고 평소엔 관계에서 끌어 쓴다:
   * useState 초기값으로 두면 관계가 아직 안 실어졌을 때 undefined 로 굳고, 그걸 효과로
   * 다시 맞추면 렌더가 한 번 더 돈다(react-hooks/set-state-in-effect).
   */
  const [subjectPick, setSubjectPick] = useState<number | undefined>(undefined);
  const subjectUserId = subjectPick ?? partner?.id ?? me?.id;
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [generating, setGenerating] = useState(false);
  /** 이번 세트로 새로 생긴 것만 — 기존 트레이 목록과 섞이면 "채워지는" 게 안 보인다 */
  const [fresh, setFresh] = useState<CoupleEmoji[]>([]);
  const [done, setDone] = useState<CoupleEmojiBatch | null>(null);

  // 화면을 떠난 뒤에도 폴링이 돌면 사라진 화면의 상태를 건드린다 — 두 곳에서 끊는다
  const mounted = useRef(true);
  const polling = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      polling.current = false;
    };
  }, []);

  // 시작 전 목록을 알아야 "이번에 생긴 것"을 가려낼 수 있다
  useEffect(() => {
    loadEmojis().catch(() => undefined);
  }, [loadEmojis]);

  /**
   * 이 얼굴로 이미 가지고 있는 감정 — 다시 만들 필요가 없는 것들.
   *
   * <p>감정이 17종이 되면서 "몇 장 때문에 전체를 다시 뽑는" 것이 그대로 실비가 됐다
   * (장당 약 0.04 USD). 이미 있는 감정을 알려주고 기본으로 빼 두면, 고르지 않아도 가장
   * 싼 선택이 기본값이 된다.
   */
  const existingEmotions = useMemo(() => {
    const mine = allEmojis.filter((e) => e.subjectUserId === subjectUserId);
    return new Set(mine.map((e) => e.emotion));
  }, [allEmojis, subjectUserId]);

  /**
   * 이번에 그릴 감정. 기본값은 <b>아직 없는 것만</b>이고, 하나도 없으면 전부다.
   *
   * <p>손으로 고른 것은 <b>어느 얼굴에 대한 선택인지와 함께</b> 들고 있는다. 얼굴을 바꾸면
   * 그 얼굴이 이미 가진 감정이 달라져 선택도 뜻을 잃기 때문이다. 효과로 초기화하지 않는
   * 이유는 subjectPick 과 같다(위 주석) — 렌더 중 계산으로 끝나는 일이다.
   */
  const [selection, setSelection] = useState<{
    subject: number | undefined;
    keys: Set<CoupleEmojiEmotion>;
  } | null>(null);
  const effectiveSelected = useMemo(() => {
    if (selection && selection.subject === subjectUserId) return selection.keys;
    // 한 번에 MAX_EMOJI_PER_REQUEST 장까지라, 기본값도 그만큼만 고른다 — 아직 없는 것 우선
    const missing = COUPLE_EMOJI_EMOTIONS.filter((e) => !existingEmotions.has(e.key)).map((e) => e.key);
    const pool = missing.length > 0 ? missing : COUPLE_EMOJI_EMOTIONS.map((e) => e.key);
    return new Set<CoupleEmojiEmotion>(pool.slice(0, MAX_EMOJI_PER_REQUEST));
  }, [selection, subjectUserId, existingEmotions]);

  const setSelectedKeys = (keys: Set<CoupleEmojiEmotion>) => {
    haptics.light();
    setSelection({ subject: subjectUserId, keys });
  };
  const toggleEmotion = (key: CoupleEmojiEmotion) => {
    const next = new Set(effectiveSelected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      // 서버도 막지만(400), 누른 뒤에 거절당하는 것보다 못 눌리는 편이 낫다
      if (next.size >= MAX_EMOJI_PER_REQUEST) {
        toast.info(`한 번에 ${MAX_EMOJI_PER_REQUEST}장까지 만들 수 있어요.`);
        return;
      }
      next.add(key);
    }
    setSelectedKeys(next);
  };

  /** 고른 감정(표 순서) — 접힌 줄의 이모지 미리보기와 접근성 라벨 */
  const selectedDefs = COUPLE_EMOJI_EMOTIONS.filter((e) => effectiveSelected.has(e.key));
  /** "아직 없는 것부터 6개" — 기본값과 같은 규칙. 시트의 "6개 고르기" */
  const fillDefault = () => {
    const missing = COUPLE_EMOJI_EMOTIONS.filter((e) => !existingEmotions.has(e.key)).map((e) => e.key);
    const pool = missing.length > 0 ? missing : COUPLE_EMOJI_EMOTIONS.map((e) => e.key);
    setSelectedKeys(new Set<CoupleEmojiEmotion>(pool.slice(0, MAX_EMOJI_PER_REQUEST)));
  };
  /** 감정 고르기 시트 — 접어 둔 17종을 여기서만 펼친다 */
  const [pickerOpen, setPickerOpen] = useState(false);

  /** 생성이 시작되면 그때 고른 감정으로 고정한다 — 진행 중에 토글해도 칸이 흔들리지 않게 */
  const [drawing, setDrawing] = useState<CoupleEmojiEmotionDef[]>([]);

  /** 이번에 그리는 감정 순서대로 칸 — 아직 안 온 칸은 null */
  const slots = useMemo(
    () => drawing.map((e) => fresh.find((f) => f.emotion === e.key) ?? null),
    [drawing, fresh],
  );

  const pick = async (from: 'library' | 'camera') => {
    try {
      const asset = from === 'library' ? await pickImageAsset() : await takePhotoAsset();
      if (asset) setPicked(asset);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
    }
  };

  const generate = useCallback(
    async (croppedUri: string) => {
      setGenerating(true);
      setFresh([]);
      setDone(null);
      // 이번에 그릴 감정을 여기서 고정한다 — 진행 중에 토글해도 칸이 흔들리지 않는다
      const targets = COUPLE_EMOJI_EMOTIONS.filter((e) => effectiveSelected.has(e.key));
      setDrawing(targets);

      /*
       * "이번에 생긴 것"을 가려내는 기준선은 방금 서버에서 받은 목록이어야 한다. 마운트 때의
       * 조회가 실패했거나(오프라인 진입) 아직 안 끝났으면 스토어가 비어 있어, 기존 세트 전부가
       * 새로 만든 것으로 분류돼 6칸이 이전 얼굴로 즉시 채워진다(2026-09-08 점검 #10). 생성은
       * 어차피 네트워크가 필요하므로 여기서 못 읽으면 시작하지 않는다.
       */
      try {
        await useCoupleEmojiStore.getState().load(true);
      } catch (e) {
        if (!mounted.current) return;
        toast.error(getErrorMessage(e, '연결을 확인하고 다시 시도해주세요.'));
        setGenerating(false);
        return;
      }
      const before = new Set(useCoupleEmojiStore.getState().emojis.map((e) => e.id));
      const collectFresh = () =>
        useCoupleEmojiStore.getState().emojis.filter((e) => !before.has(e.id));

      polling.current = true;
      const pollProgress = async () => {
        while (polling.current) {
          await wait(PROGRESS_POLL_MS);
          if (!polling.current) return;
          try {
            await useCoupleEmojiStore.getState().load(true);
            if (mounted.current) setFresh(collectFresh());
          } catch {
            // 진행률을 한 번 못 그린 것뿐이다 — 작업의 성패는 아래 awaitAiJob 이 판정한다
          }
        }
      };

      try {
        const jobId = await startCoupleEmojiGeneration(
          croppedUri,
          subjectUserId,
          targets.map((e) => e.key),
        );
        void pollProgress();
        const batch = await awaitAiJob<CoupleEmojiBatch>(jobId);
        // 결과가 확정됐으니 트레이 캐시도 이번 세트를 포함하게 맞춘다
        await useCoupleEmojiStore.getState().load(true).catch(() => undefined);
        if (!mounted.current) return;
        setFresh(collectFresh());
        setDone(batch);
        haptics.light();
      } catch (e) {
        if (!mounted.current) return;
        // 이미 몇 칸이 찼다면 "실패"가 아니다 — 기다리기를 그만뒀거나 일부만 실패한 것이다
        toast.error(getErrorMessage(e, '우리 이모지를 만들지 못했어요.'));
      } finally {
        polling.current = false;
        if (mounted.current) setGenerating(false);
      }
    },
    [subjectUserId, effectiveSelected],
  );

  const confirmRemove = (emoji: CoupleEmoji) => {
    Alert.alert('이 이모지를 지울까요?', '지우면 채팅 트레이에서도 사라져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () => {
          removeEmoji(emoji.id)
            .then(() => setFresh((prev) => prev.filter((f) => f.id !== emoji.id)))
            .catch((e) => toast.error(getErrorMessage(e, '지우지 못했어요.')));
        },
      },
    ]);
  };

  /** 결과 화면에서 다음 세트로 — 같은 얼굴, 기본값은 다시 "아직 없는 것부터" */
  const startAnother = () => {
    setFresh([]);
    setDone(null);
    setDrawing([]);
    setSelection(null);
  };

  // "내 이모지" / "지민 이모지" — "나 이모지"는 조사가 어색했다
  const subjectName = subjectUserId === me?.id ? '내' : (partner?.name ?? '상대');
  const startedOrDone = generating || fresh.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* §9-5 — 별도 동의 화면 대신 이 한 줄과 "상대도 지울 수 있다"는 구조로 푼다 */}
      <View style={styles.notice}>
        <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.noticeText}>
          사진은 이모지를 만드는 데만 쓰고 저장하지 않아요. 만든 이모지는 둘 다 보고, 둘 다 지울 수 있어요.
        </Text>
      </View>

      {!allowed ? (
        <LockedCard
          title="우리 이모지"
          description="애인 얼굴로 감정 이모지를 만들어 채팅에서 써요."
          upgradeMessage="우리 이모지는 PRO에서 만들 수 있어요."
          // PRO 도 월 4회라, 같은 잠금이 "결제하세요"가 아니라 "다 썼어요"여야 할 때가 있다
          feature="AI_COUPLE_EMOJI"
        />
      ) : null}

      {canBuySet ? (
        <View style={styles.creditBox}>
          <Text style={styles.creditTitle}>세트를 하나만 더 만들고 싶다면</Text>
          <Text style={styles.hint}>구독 없이 세트 하나(6장까지)를 살 수 있어요. 산 세트는 이번 달이 지나도 남아요.</Text>
          <Button title={`세트 1개 추가 · ${setPrice}`} variant="secondary" size="md" onPress={() => void onBuySet()} loading={buying} />
        </View>
      ) : null}
      {emojiState && emojiState.credits > 0 ? (
        <Text style={styles.creditNote}>추가로 산 세트 {emojiState.credits}개가 남아 있어요.</Text>
      ) : null}

      {!startedOrDone ? (
        <>
          <Text style={styles.sectionTitle}>누구 얼굴로 만들까요?</Text>
          <View style={styles.subjectRow}>
            {partner ? (
              <SubjectChip
                name={partner.name}
                imageUrl={partner.profileImageUrl}
                selected={subjectUserId === partner.id}
                onPress={() => setSubjectPick(partner.id)}
              />
            ) : null}
            {me ? (
              <SubjectChip
                name="나"
                // 아바타 글자는 진짜 이름에서 — "나" 로 두면 칩이 "나 나" 로 읽혔다
                avatarName={me.name}
                imageUrl={me.profileImageUrl}
                selected={subjectUserId === me.id}
                onPress={() => setSubjectPick(me.id)}
              />
            ) : null}
          </View>

          {/*
            두 번째 문장은 설계 메모 §12-2 의 반영 항목 — v2 이후 앵커가 "사진과 같은 옷"을
            요구해서 사진 속 옷차림이 그대로 캐릭터 옷이 된다. 잠옷 사진을 고른 사용자가
            결과를 보고 놀라지 않게 고르기 전에 알려 준다.
          */}
          <Text style={styles.hint}>
            얼굴이 크고 또렷하게 나온 정면 사진일수록 잘 닮게 나와요. 사진 속 옷차림 그대로 그려져요.
          </Text>

          {/*
            감정은 <b>접어 둔다</b>(2026-09-29, docs/COUPLE_EMOJI_CREATE_UX_2026-09-29.md §4). 예전엔 17개 칩을
            한 화면에 펼쳐 두었는데, 대부분은 미리 골라 둔 기본값(아직 없는 것부터 6개)을 그대로 쓴다 —
            고르지 않는 사람에게 칩 17개는 읽을 필요 없는 장애물이었다. 기본 흐름은 "누구 → 사진" 두 결정이고,
            바꾸고 싶은 사람만 시트를 연다.
          */}
          <View style={styles.emotionRow}>
            <View style={styles.emotionRowText}>
              <Text style={styles.sectionTitle}>
                만들 감정 ({effectiveSelected.size}/{MAX_EMOJI_PER_REQUEST})
              </Text>
              {selectedDefs.length > 0 ? (
                <Text style={styles.emotionPreview} numberOfLines={1}>
                  {selectedDefs.map((e) => e.placeholder).join(' ')}
                </Text>
              ) : (
                <Text style={styles.hint}>고른 감정이 없어요</Text>
              )}
            </View>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [styles.emotionChange, pressed && styles.cellPressed]}
              accessibilityRole="button"
              accessibilityLabel={`감정 바꾸기, 지금 ${selectedDefs.map((e) => e.label).join(', ') || '없음'}`}
            >
              <Text style={styles.emotionChangeText}>바꾸기</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={styles.hint}>
            {existingEmotions.size === 0
              ? `기본 표정 ${MAX_EMOJI_PER_REQUEST}가지를 골라 뒀어요.`
              : '아직 없는 감정부터 골라 뒀어요.'}
            {` 한 번에 ${MAX_EMOJI_PER_REQUEST}장까지 — 나머지는 다음에 이어서 만들면 돼요.`}
          </Text>
        </>
      ) : (
        <Text style={styles.sectionTitle}>
          {generating ? `${subjectName} 이모지를 그리는 중이에요` : `${subjectName} 이모지가 만들어졌어요`}
        </Text>
      )}

      {startedOrDone ? (
        <>
          <View style={styles.grid}>
            {/* 이번에 그리는 감정만 칸으로 — slots 는 drawing 순서라 17종 전체를 돌면 라벨이 어긋난다 */}
            {drawing.map((emotion, i) => {
              const emoji = slots[i];
              return (
                <View key={emotion.key} style={styles.cell}>
                  {emoji ? (
                    <Pressable
                      onPress={() => confirmRemove(emoji)}
                      accessibilityRole="button"
                      accessibilityLabel={`${emotion.label} 이모지 지우기`}
                      style={({ pressed }) => [styles.cellBox, pressed && styles.cellPressed]}
                    >
                      <Image source={{ uri: emoji.imageUrl }} style={styles.cellImage} resizeMode="cover" />
                      <View style={styles.removeBadge}>
                        <MaterialCommunityIcons name="close" size={12} color="#FFFFFF" />
                      </View>
                    </Pressable>
                  ) : (
                    <View style={[styles.cellBox, styles.cellEmpty]}>
                      {generating ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                      ) : (
                        <Text style={styles.cellPlaceholder}>{emotion.placeholder}</Text>
                      )}
                    </View>
                  )}
                  <Text style={styles.cellLabel}>{emotion.label}</Text>
                </View>
              );
            })}
            {/*
              마지막 줄을 왼쪽부터 채운다 — 3열 space-between 이라 5장이면 [졸림 · 빈칸 · 사랑]처럼 양 끝으로
              벌어졌다. 모자란 칸을 빈 칸으로 채워 줄을 맞춘다(보이지 않는다).
            */}
            {Array.from({ length: (3 - (drawing.length % 3)) % 3 }, (_, i) => (
              <View key={`filler-${i}`} style={styles.cell} />
            ))}
          </View>

          {generating ? (
            <Text style={styles.hint}>
              {drawing.length}장을 그리고 있어요. 화면을 나가도 계속 만들어지고, 다 되면 채팅
              트레이에 들어와 있어요.
            </Text>
          ) : null}

          {done && done.failedEmotions.length > 0 ? (
            <Text style={styles.hint}>
              {done.failedEmotions.map((f) => coupleEmojiEmotionOf(f)?.label ?? f).join('·')}은(는) 만들지
              못했어요. 다른 사진으로 다시 만들면 채워져요.
            </Text>
          ) : null}
        </>
      ) : null}

      {/* 그리는 동안에는 버튼을 숨긴다 — 흐린 버튼 둘이 남아 있으면 눌러야 할 것처럼 보였다 */}
      {generating ? null : (
        <View style={styles.actions}>
          {done ? (
            <>
              <Button title="채팅에서 쓰기" onPress={() => navigation.goBack()} />
              {/*
                17종을 채우려면 여러 번 나눠 만든다 — 결과 화면에서 바로 다음 세트로 간다.
                기본값은 다시 "아직 없는 것부터"라 방금 만든 감정은 빠진다.
              */}
              {existingEmotions.size < COUPLE_EMOJI_EMOTIONS.length && emojiState?.remaining !== 0 ? (
                <Button title="이어서 더 만들기" variant="secondary" onPress={startAnother} disabled={!allowed} />
              ) : null}
              {/*
                부분 실패 안내가 "다른 사진으로 다시 만들면 채워져요" 라고 말하는데 그 버튼이 없었다
                (2026-09-08 점검 #11) — 실패한 칸이 있을 때만 재시도 진입점을 같이 둔다.
              */}
              {done.failedEmotions.length > 0 ? (
                <Button
                  title="다른 사진으로 다시 만들기"
                  variant="secondary"
                  onPress={() => pick('library')}
                  disabled={!allowed}
                />
              ) : null}
            </>
          ) : (
            <>
              <Button
                title={fresh.length > 0 ? '다른 사진으로 다시 만들기' : '사진 고르기'}
                onPress={() => pick('library')}
                // 감정을 하나도 안 고르면 그릴 것이 없다
                disabled={!allowed || effectiveSelected.size === 0}
              />
              <Button
                title="촬영하기"
                variant="secondary"
                onPress={() => pick('camera')}
                // 사진 고르기와 같은 조건 — 감정을 하나도 안 고르면 그릴 것이 없다
                disabled={!allowed || effectiveSelected.size === 0}
              />
              {/* 남은 횟수 — 예전엔 다 쓰고 나서야 알았다. remaining 에는 산 세트가 이미 합산돼 있다 */}
              {allowed && emojiState?.remaining != null ? (
                <Text style={[styles.hint, styles.remainingNote]}>
                  {emojiState.remaining > 0
                    ? `${emojiState.remaining}세트 더 만들 수 있어요`
                    : '이번 달 세트를 다 썼어요'}
                </Text>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* 감정 고르기 — 표정 / 자주 하는 말 / 상황 세 묶음. 이미 가진 감정에는 점이 붙는다 */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} position="bottom">
        <View style={styles.pickerHead}>
          <Text style={styles.sectionTitle}>
            감정 고르기 ({effectiveSelected.size}/{MAX_EMOJI_PER_REQUEST})
          </Text>
          {/*
            전체 선택은 없앴다 — 한 번에 MAX_EMOJI_PER_REQUEST 장까지라 누를 수 없는 버튼이 된다.
            대신 "아직 없는 것부터 6개"를 채워 준다: 가장 자주 쓰는 선택이고, 이미 가진 감정을
            또 그리는 것이 가장 아까운 지출이다.
          */}
          <Pressable
            onPress={() => (effectiveSelected.size > 0 ? setSelectedKeys(new Set<CoupleEmojiEmotion>()) : fillDefault())}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.emotionSelectAll}>
              {effectiveSelected.size > 0 ? '선택 해제' : `${MAX_EMOJI_PER_REQUEST}개 고르기`}
            </Text>
          </Pressable>
        </View>
        {(['face', 'words', 'scene'] as const).map((group) => (
          <View key={group} style={styles.pickerGroup}>
            <Text style={styles.pickerGroupTitle}>{COUPLE_EMOJI_GROUP_LABEL[group]}</Text>
            <View style={styles.emotionWrap}>
              {COUPLE_EMOJI_EMOTIONS.filter((e) => e.group === group).map((emotion) => {
                const on = effectiveSelected.has(emotion.key);
                const have = existingEmotions.has(emotion.key);
                return (
                  <Pressable
                    key={emotion.key}
                    onPress={() => toggleEmotion(emotion.key)}
                    style={({ pressed }) => [
                      styles.emotionChip,
                      on && styles.emotionChipOn,
                      pressed && styles.cellPressed,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${emotion.label}${have ? ' — 이미 있음' : ''}`}
                  >
                    <Text style={styles.emotionChipEmoji}>{emotion.placeholder}</Text>
                    <Text style={[styles.emotionChipText, on && styles.emotionChipTextOn]}>{emotion.label}</Text>
                    {/* 이미 가진 감정 — 다시 그리면 덮어쓰는 게 아니라 한 장이 더 생긴다 */}
                    {have ? <View style={styles.emotionHaveDot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        {existingEmotions.size > 0 ? (
          <Text style={styles.hint}>점이 붙은 건 이미 만들어 둔 감정이에요. 다시 고르면 한 장이 더 생겨요.</Text>
        ) : null}
        <Button title="완료" onPress={() => setPickerOpen(false)} />
      </Sheet>

      {/* 정사각 512 JPEG 로 잘라 넘긴다 — 업로드는 확정 후 한 번뿐(AvatarCropSheet 주석) */}
      <AvatarCropSheet
        title="얼굴 맞추기"
        source={picked}
        onCancel={() => setPicked(null)}
        onConfirm={(uri) => {
          setPicked(null);
          void generate(uri);
        }}
      />
    </ScrollView>
  );
}

function SubjectChip({
  name,
  avatarName,
  imageUrl,
  selected,
  onPress,
}: {
  name: string;
  /** 아바타 첫 글자에 쓸 이름 — 없으면 name */
  avatarName?: string;
  imageUrl?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.subjectChip, selected && styles.subjectChipSelected]}
    >
      <Avatar name={avatarName ?? name} imageUrl={imageUrl ?? undefined} size={36} />
      <Text style={[styles.subjectName, selected && styles.subjectNameSelected]}>{name}</Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  noticeText: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },

  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  creditBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  creditTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  creditNote: { fontSize: fontSize.caption, color: colors.togetherText, fontWeight: '700' },

  subjectRow: { flexDirection: 'row', gap: spacing.sm },
  subjectChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  subjectChipSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  subjectName: { fontSize: fontSize.body, fontWeight: '600', color: colors.textSecondary },
  subjectNameSelected: { color: colors.textPrimary },

  /*
   * 3열. 열 사이 간격은 space-between 이 만든다 — column gap 과 퍼센트 폭을 같이 쓰면
   * (33.3% × 3 + gap × 2) 가 100% 를 넘어 마지막 칸이 다음 줄로 떨어진다.
   */
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  cell: { width: '31.5%', alignItems: 'center', gap: spacing.xs },
  cellBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  cellPressed: { opacity: 0.7 },
  /* 감정 — 접힌 한 줄(고른 감정 이모지 + 바꾸기) */
  emotionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emotionRowText: { flex: 1, gap: spacing.xxs },
  emotionPreview: { fontSize: 22, letterSpacing: 2 },
  emotionChange: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: spacing.sm,
  },
  emotionChangeText: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary },
  remainingNote: { textAlign: 'center' },
  /* 감정 고르기 시트 */
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerGroup: { gap: spacing.xs, marginTop: spacing.sm },
  pickerGroupTitle: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  /* 감정 고르기 — 칩 격자 */
  emotionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emotionSelectAll: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  emotionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  emotionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emotionChipOn: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  emotionChipEmoji: { fontSize: 14 },
  emotionChipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  emotionChipTextOn: { color: colors.primary, fontWeight: '800' },
  /* 이미 가진 감정 표시 — 다시 그리면 덮어쓰는 게 아니라 한 장이 더 생긴다 */
  emotionHaveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textTertiary },
  cellEmpty: { alignItems: 'center', justifyContent: 'center' },
  cellPlaceholder: { fontSize: fontSize.title },
  cellImage: { width: '100%', height: '100%' },
  removeBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cellLabel: { fontSize: fontSize.micro, color: colors.textSecondary, fontWeight: '600' },

  actions: { gap: spacing.sm },
}));
