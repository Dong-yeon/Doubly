/**
 * 우리 이모지 만들기 — 사진 한 장 → 감정 6종 캐릭터 세트.
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
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { Avatar } from '../../components/Avatar';
import { AvatarCropSheet } from '../../components/AvatarCropSheet';
import { Button } from '../../components/Button';
import { MaterialCommunityIcons } from '../../components/Icon';
import { LockedCard } from '../../components/LockedCard';
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
import { COUPLE_EMOJI_EMOTIONS, coupleEmojiEmotionOf } from '../../constants/coupleEmojiEmotions';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { CoupleEmoji, CoupleEmojiBatch } from '../../types';

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

  const loadEmojis = useCoupleEmojiStore((s) => s.load);
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

  /** 감정 순서대로 6칸 — 아직 안 온 칸은 null */
  const slots = useMemo(
    () => COUPLE_EMOJI_EMOTIONS.map((e) => fresh.find((f) => f.emotion === e.key) ?? null),
    [fresh],
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
        const jobId = await startCoupleEmojiGeneration(croppedUri, subjectUserId);
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
    [subjectUserId],
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

  const subjectName = subjectUserId === me?.id ? '나' : (partner?.name ?? '상대');
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
          description="애인 얼굴로 감정 이모지 6종을 만들어 채팅에서 써요."
          upgradeMessage="우리 이모지는 PRO에서 만들 수 있어요."
        />
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
        </>
      ) : (
        <Text style={styles.sectionTitle}>
          {generating ? `${subjectName} 이모지를 그리는 중이에요` : `${subjectName} 이모지가 만들어졌어요`}
        </Text>
      )}

      {startedOrDone ? (
        <>
          <View style={styles.grid}>
            {COUPLE_EMOJI_EMOTIONS.map((emotion, i) => {
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
          </View>

          {generating ? (
            <Text style={styles.hint}>
              1분쯤 걸려요. 화면을 나가도 계속 만들어지고, 다 되면 채팅 트레이에 들어와 있어요.
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

      <View style={styles.actions}>
        {done ? (
          <>
            <Button title="채팅에서 쓰기" onPress={() => navigation.goBack()} />
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
              loading={generating}
              disabled={generating || !allowed}
            />
            <Button
              title="촬영하기"
              variant="secondary"
              onPress={() => pick('camera')}
              disabled={generating || !allowed}
            />
          </>
        )}
      </View>

      {/* 정사각 512 JPEG 로 잘라 넘긴다 — 업로드는 확정 후 한 번뿐(AvatarCropSheet 주석) */}
      <AvatarCropSheet
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
  imageUrl,
  selected,
  onPress,
}: {
  name: string;
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
      <Avatar name={name} imageUrl={imageUrl ?? undefined} size={36} />
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
