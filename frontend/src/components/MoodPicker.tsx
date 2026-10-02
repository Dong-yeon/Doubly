/**
 * 무드 선택 시트 — Obimy 벤치마킹(PLAN.md "무드 상태" 참고).
 *
 * 움직이는 이모티콘 게이팅과 같은 구조·같은 규칙이다. 기본 12종은 전부 무료이고,
 * 확장 무드팩만 PRO 다(`Feature.PREMIUM_STICKER` — 스티커와 같은 게이트로 판정한다).
 * 서버(MoodService)도 같은 규칙으로 한 번 더 막는다 — 여기는 우회 방지가 아니라
 * UX(굳이 보냈다가 거부당하지 않게).
 *
 * <p><b>우리 이모지는 "내 얼굴 최신 한 벌"만 올린다</b>(설계 메모 §7·§18). 커플이 여러 벌을
 * 만들 수 있어서(PRO 월 5세트) 전부 올리면 최대 30장이 되는데, 이 파일의 12종 원칙 자체가
 * "처음부터 다 만들면 선택 마비만 생긴다"(`moodEmojis.ts`)에서 나왔다. 두 가지로 줄인다 —
 * ① 무드는 "내 기분"이므로 <b>내 얼굴</b>(subjectUserId === 나)만, ② 그중 <b>최신 한 벌</b>만.
 * 그래야 세트를 몇 벌 만들어도 여기 개수는 한 벌치(감정 종류 수)로 고정된다.
 *
 * <p><b>2단계 "한 줄 남기기"</b>(2026-10-02, 나만의 하루 기록 — docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §4-1).
 * 무드를 고른 직후 같은 시트에서 <b>나만 보는</b> 오늘 한 줄을 받는다. <b>오늘 기록이 아직 없을 때만</b>
 * 넘어간다 — 이미 썼으면 예전처럼 무드만 보내고 닫는다(기록의 기분은 바꾸지 않는다). 1단계 메모는
 * 상대에게 보이고 2단계 한 줄은 나만 보이므로, 두 칸의 문구를 "상대에게 한마디" / 자물쇠 + "나만 보여요"로
 * 가른다. 시트는 공용 {@link Sheet} 로 옮겼다 — 2단계에 글 입력이 들어가 키보드 내리기가 필요하다.
 *
 * <p><b>미연결</b>이면 무드는 커플 기능이라(서버 mood_statuses 가 관계 소유) 보낼 곳이 없다 —
 * 예전엔 그래도 POST /mood 를 보내 404 토스트가 떴다. 이제 메모칸을 숨기고, 고른 기분은 오늘 기록에만 남긴다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { MaterialCommunityIcons } from './Icon';
import { MOOD_EMOJIS, PREMIUM_MOOD_EMOJIS } from '../constants/moodEmojis';
import { COUPLE_EMOJI_EMOTIONS } from '../constants/coupleEmojiEmotions';
import { usePlanStore } from '../store/planStore';
import { useCoupleEmojiStore } from '../store/coupleEmojiStore';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { journalApi, journalToday, type JournalEntry } from '../api/journal';
import { setJournalDraft } from '../store/journalDraft';
import { analyticsApi } from '../api/analytics';
import { getErrorMessage } from '../utils/error';
import { confirmDiscard } from '../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import type { MoodChoice } from '../api/mood';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 상대에게 보이는 무드 보내기 — 연결됐을 때만 불린다 */
  onSelect: (choice: MoodChoice, message?: string) => void;
  /** 커플 연결 여부 — 아니면 메모칸을 숨기고 무드를 보내지 않는다 */
  connected: boolean;
  /** 그날 페이지 열기 — 초안은 store/journalDraft 로 먼저 건네 둔다(URL 에 싣지 않는다) */
  onOpenJournal: (date: string) => void;
  /** 기록을 저장했다 — 홈이 미연결 무드 아이콘을 갱신한다 */
  onJournalSaved?: (entry: JournalEntry) => void;
  /** 무드 달력 열기 — 연결됐을 때만 입구가 보인다(무드 원장은 커플 단위) */
  onOpenCalendar?: () => void;
}

/**
 * 2단계로 들고 가는 고른 기분. 기록에는 유니코드만 남는다 — 우리 이모지는 관계 소유라 지난 기록 삭제 때
 * 사라지고, 이별 뒤 일기에 상대가 그린 얼굴이 남아서도 안 된다(분석 §1-3). 그림은 이 시트에서만 보여 준다.
 */
interface Picked {
  glyph: string;
  imageUrl?: string;
}

/** 서버 상한(SaveJournalRequest.body)과 맞춘다 */
const MAX_JOURNAL = 2000;

export function MoodPicker({ visible, onClose, onSelect, connected, onOpenJournal, onJournalSaved, onOpenCalendar }: Props) {
  const [message, setMessage] = useState('');
  /** 오늘 기록이 있나 — null 은 아직 모름(불러오는 중·실패). 모르면 2단계로 넘어가지 않는다 */
  const [hasToday, setHasToday] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [line, setLine] = useState('');
  const [savingLine, setSavingLine] = useState(false);
  const can = usePlanStore((s) => s.can);
  const showUpgrade = usePlanStore((s) => s.showUpgrade);
  const premiumAllowed = can('PREMIUM_STICKER');

  const myId = useAuthStore((s) => s.user?.id);
  const coupleEmojis = useCoupleEmojiStore((s) => s.emojis);
  const loadCoupleEmojis = useCoupleEmojiStore((s) => s.load);

  // 시트를 열 때 목록을 확인한다(캐시가 있으면 요청은 안 나간다 — 스토어의 load 규칙).
  useEffect(() => {
    // 실패해도 시트는 유니코드 무드로 그대로 쓸 수 있다 — 오프라인에서 unhandled rejection 을 내지 않는다
    if (visible) loadCoupleEmojis().catch(() => undefined);
  }, [visible, loadCoupleEmojis]);

  // 열 때마다 오늘 기록이 있는지 본다 — 그사이 다른 화면에서 쓰고 왔을 수 있다(닫을 때 null 로 되돌린다)
  useEffect(() => {
    if (!visible) return;
    let active = true;
    journalApi
      .day(journalToday())
      .then((entry) => {
        if (active) setHasToday(entry !== null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [visible]);

  /** 내 얼굴 — 감정마다 최신 한 장. 파일 상단 주석의 두 가지 축소 규칙 */
  const myLatestSet = useMemo(() => {
    if (!myId) return [];
    /*
     * 감정마다 "가장 최근에 만든 한 장"을 고른다. 목록이 최신순(id desc)이라 감정별로 처음
     * 만나는 것이 최신이다.
     *
     * <b>예전엔 최신 batchId 하나만 봤다.</b> 한 요청 = 한 벌 = 전체 감정이던 때는 같은
     * 결과였지만, 한 요청 장 수 상한(MAX_EMOJI_PER_REQUEST, 지금 6)이 생기면서 한 벌이 여러 배치로
     * 쪼개진다 — 그러면 마지막 배치에 표정이 하나도 없을 때(상황 감정만 골랐을 때) 앞 배치에
     * 멀쩡히 있는데도 무드가 통째로 비어 버린다. 감정 단위로 묶으면 몇 번에 나눠 만들든
     * 개수가 감정 종류 수로 고정된다 — 이 파일 상단 주석이 말하는 원래 의도가 그것이다.
     *
     * moodVisible 만 올린다 — 감정이 17종이 되면서 전부 올리면 선택지가 기본 12 + 17 = 29개가
     * 된다. 표정 6종은 켜진 채로, 상황 11종(출근·마스크팩 등)은 꺼진 채로 만들어지고
     * (CoupleEmojiEmotion.defaultMoodVisible), 트레이에서 길게 눌러 바꾼다.
     */
    const mine = coupleEmojis.filter((e) => e.subjectUserId === myId && e.moodVisible);
    // 감정 정해진 순서로 — 목록 순서(id desc)는 생성 역순이라 사람이 읽는 순서와 다르다
    return COUPLE_EMOJI_EMOTIONS.map((def) => mine.find((e) => e.emotion === def.key)).filter(
      (e): e is (typeof mine)[number] => !!e,
    );
  }, [coupleEmojis, myId]);
  /**
   * 기본 12칸을 우리 이모지로 <b>덮은</b> 목록 + 칸을 못 얻은 나머지.
   *
   * <p>예전에는 "우리 이모지" 섹션과 "기본" 섹션이 위아래로 나뉘어 있었다. 같은 것을 고르는
   * 자리가 둘로 갈려서, 이모지를 만들어도 기본 12종이 그대로 남아 "무엇이 내 무드인가"가
   * 흐렸다. 이제 한 격자이고, 대응되는 칸은 내 얼굴이 차지한다.
   *
   * <p><b>어느 칸을 덮을지는 서버가 준 {@code moodEmoji} 가 정한다</b>(CoupleEmojiEmotion 의
   * 매핑). 앱이 같은 표를 또 들지 않는다 — 감정을 하나 더할 때 두 곳을 고쳐야 하는 걸 막는다.
   *
   * <p><b>여러 감정이 같은 칸을 노린다</b>(😊 = 기쁨·씻고왔다·퇴근·마스크팩). 먼저 오는 것이
   * 가져가고, {@code myLatestSet} 이 이미 감정 정의 순서(표정 6종이 앞)라 <b>표정이 우선</b>한다 —
   * "좋음" 칸에는 상황 그림이 아니라 웃는 얼굴이 들어가는 편이 자연스럽다.
   *
   * <p>칸을 못 얻은 것은 <b>버리지 않고 뒤에 잇는다.</b> 상황 11종은 사용자가 트레이에서
   * 일부러 켠 것이라(moodVisible), 덮어쓰기를 도입하면서 조용히 사라지면 기능이 줄어든다.
   */
  const { slots, extras } = useMemo(() => {
    const taken = new Set<number>();
    const filled = MOOD_EMOJIS.map((mood) => {
      const hit = myLatestSet.find((e) => e.moodEmoji === mood.emoji && !taken.has(e.id));
      if (hit) taken.add(hit.id);
      return { mood, emoji: hit };
    });
    return { slots: filled, extras: myLatestSet.filter((e) => !taken.has(e.id)) };
  }, [myLatestSet]);

  /*
   * 격자 스크롤 높이를 320 으로 고정해뒀더니, 화면이 큰 기기(아이폰 프로맥스 등)에서는
   * 시트가 화면 아래쪽 절반도 못 채우고 그 위로 배경(딤 처리된 화면)만 크게 비어
   * 보였다(실기기 리포트, 2026-09-01). 화면 높이에 비례하게 키워서 큰 화면에서도
   * 시트가 그만큼 커지게 한다 — 작은 화면 보호용으로 하한(320)은 그대로 둔다.
   */
  const { height: windowHeight } = useWindowDimensions();
  const gridMaxHeight = Math.max(320, windowHeight * 0.45);

  /*
   * 닫기 — 시트가 사라지는 애니메이션 동안 내용이 1단계로 되돌아가 번쩍이지 않도록(웹 확인)
   * 내부 상태는 사라진 뒤에 비운다. 300ms 는 Sheet 의 slide/fade 길이보다 조금 길다.
   */
  const close = () => {
    onClose();
    setTimeout(() => {
      setMessage('');
      setPicked(null);
      setLine('');
      setHasToday(null);
    }, 300);
  };

  const saveJournal = async (body: string | null) => {
    if (!picked) return;
    setSavingLine(true);
    try {
      const saved = await journalApi.save(journalToday(), { moodEmoji: picked.glyph, body, source: 'MOOD_PICKER' });
      onJournalSaved?.(saved);
      toast.success(body ? '나만의 기록에 남겼어요' : '오늘 기분을 남겼어요');
      close();
    } catch (e) {
      toast.error(getErrorMessage(e, '기록을 남기지 못했어요.'));
    } finally {
      setSavingLine(false);
    }
  };

  /**
   * "나중에"·배경 탭·뒤로 가기. 연결됐으면 무드는 이미 상대에게 갔으니 그냥 닫는다.
   * 미연결이면 기분이 남을 곳이 기록뿐이라 — 고른 기분만이라도 기록에 남긴다("고르면 남는다").
   *
   * <p>배경 탭·뒤로 가기는 한 줄을 쓰다 말았으면 먼저 묻는다. 예전엔 배경을 잘못 건드리기만 해도 쓴 글이
   * 경고 없이 사라졌다(docs/daily-mood-current-state.md §8-11). "나중에"는 누른 사람의 뜻이 분명하니
   * 묻지 않는다 — utils/discardGuard 의 공용 정책(명시적 취소 버튼은 바로 닫는다)과 같다.
   */
  const dismissLine = (ask: boolean) => {
    if (savingLine) return;
    confirmDiscard(ask && line.trim().length > 0, () => {
      if (!connected && picked) {
        void saveJournal(null);
        return;
      }
      close();
    });
  };

  /**
   * 1단계 시트 닫기(배경 탭·뒤로 가기) — "상대에게 한마디"를 쓰다 말았으면 묻는다.
   * 무드를 고른 뒤 닫히는 경로는 {@link close} 를 바로 부르므로 여기를 지나지 않는다.
   */
  const dismissPicker = () => confirmDiscard(message.trim().length > 0, close);

  const openMore = () => {
    const date = journalToday();
    setJournalDraft({ date, mood: picked?.glyph, body: line.trim() || undefined });
    close();
    onOpenJournal(date);
  };

  const onPress = (choice: MoodChoice, locked: boolean, label: string, glyph: string, imageUrl?: string) => {
    if (locked) {
      showUpgrade(`${label} 무드는 PRO에서 쓸 수 있어요.`);
      return;
    }
    if (connected) onSelect(choice, message.trim() || undefined);
    if (hasToday === false) {
      // 오늘 기록이 없을 때만 넘어간다 — 이미 썼으면 무드만 보내고 닫는다(2026-10-02 결정)
      setPicked({ glyph, imageUrl });
      analyticsApi.log('JOURNAL_PROMPT_SHOWN').catch(() => {});
      return;
    }
    if (!connected) {
      // 미연결 + 오늘 기록 있음: 보낼 무드가 없고, 기록의 기분은 여기서 바꾸지 않는다 — 기록으로 안내한다
      const date = journalToday();
      close();
      if (hasToday) {
        toast.success('오늘 기록의 기분은 기록에서 바꿀 수 있어요', {
          label: '열기',
          onPress: () => onOpenJournal(date),
        });
      } else {
        toast.error('기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      return;
    }
    close();
  };

  if (picked) {
    return (
      <Sheet visible={visible} onClose={() => dismissLine(true)} position="bottom">
        <View style={styles.pickedRow}>
          {picked.imageUrl ? (
            <Image source={{ uri: picked.imageUrl }} style={styles.pickedImage} resizeMode="contain" />
          ) : (
            <Text style={styles.pickedEmoji}>{picked.glyph}</Text>
          )}
          <Text style={styles.title}>{connected ? '오늘 기분, 남겼어요' : '오늘 기분을 골랐어요'}</Text>
        </View>

        <View style={styles.privateRow}>
          <MaterialCommunityIcons name="lock-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.privateText}>나만 보여요 · 상대에게도, 우리 기록에도 나가지 않아요</Text>
        </View>

        <TextInput
          style={styles.lineInput}
          value={line}
          onChangeText={setLine}
          placeholder="오늘 한 줄 남겨 볼까요?"
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_JOURNAL}
          multiline
          autoFocus
          accessibilityLabel="나만 보는 오늘 한 줄"
        />

        <View style={styles.lineActions}>
          <Pressable
            onPress={openMore}
            hitSlop={8}
            style={styles.moreBtn}
            accessibilityRole="button"
            accessibilityLabel="더 쓰기 — 사진도 붙일 수 있어요"
          >
            <MaterialCommunityIcons name="image-plus" size={18} color={colors.textSecondary} />
            <Text style={styles.moreText}>더 쓰기</Text>
          </Pressable>
          <View style={styles.lineButtons}>
            <Button title="나중에" variant="ghost" size="md" onPress={() => dismissLine(false)} disabled={savingLine} />
            <Button
              title="남기기"
              size="md"
              onPress={() => saveJournal(line.trim())}
              disabled={!line.trim()}
              loading={savingLine}
            />
          </View>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={dismissPicker} position="bottom" cardStyle={styles.sheet}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>지금 기분</Text>
        {/*
          무드 달력 입구 — 무드를 고르러 들어온 자리가 지난 기분을 떠올리기도 가장 쉬운 자리다.
          미연결이면 무드가 서버에 쌓이지 않아(하루 기록에만 남는다) 보여 줄 게 없다.
        */}
        {connected && onOpenCalendar ? (
          <Pressable
            onPress={() => {
              close();
              onOpenCalendar();
            }}
            hitSlop={8}
            style={styles.calendarLink}
            accessibilityRole="button"
            accessibilityLabel="지난 기분 보기 — 우리 무드 달력"
          >
            <MaterialCommunityIcons name="calendar-heart" size={16} color={colors.primary} />
            <Text style={styles.calendarLinkText}>지난 기분</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.desc}>
        {connected ? '이모지 하나로 답장 없이 알려줘요.' : '오늘 기분을 골라 나만의 기록에 남겨요.'}
      </Text>

      {/* 상대에게 보이는 한마디 — 미연결이면 받을 사람이 없다 */}
      {connected ? (
        <TextInput
          style={styles.messageInput}
          value={message}
          onChangeText={setMessage}
          placeholder="상대에게 한마디 (선택, 20자)"
          placeholderTextColor={colors.textTertiary}
          maxLength={20}
          accessibilityLabel="상대에게 보이는 한마디"
        />
      ) : null}

      {/* 확장팩까지 24종이라 작은 화면에서는 넘친다 — 시트 안에서만 스크롤한다 */}
      <ScrollView style={{ maxHeight: gridMaxHeight }}>
        {/*
          우리 이모지가 있을 때만 섹션이 나타난다. 없을 때 "만들기" 안내를 넣지 않은 건
          생성 진입점이 채팅 트레이 한 곳이어서다 — 여기에 또 두면 같은 기능의 입구가
          둘로 갈린다(§18 "남은 것"에 후속으로 적어 뒀다).
        */}
        <View style={styles.grid}>
          {/* 기본 12칸 — 대응되는 우리 이모지가 있으면 그림이 그 자리를 차지한다 */}
          {slots.map(({ mood, emoji }) => (
            <Pressable
              key={mood.emoji}
              style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              onPress={() =>
                onPress(
                  emoji ? { coupleEmojiId: emoji.id } : { emoji: mood.emoji },
                  false,
                  mood.label,
                  mood.emoji,
                  emoji?.imageUrl,
                )
              }
              accessibilityRole="button"
              accessibilityLabel={emoji ? `내 얼굴로 ${mood.label} 무드 남기기` : `${mood.label} 무드로 남기기`}
            >
              {emoji ? (
                <Image source={{ uri: emoji.imageUrl }} style={styles.cellImage} resizeMode="contain" />
              ) : (
                <Text style={styles.emoji}>{mood.emoji}</Text>
              )}
              {/* 라벨은 <b>칸의 뜻</b>(좋음)을 유지한다 — 그림이 바뀌어도 12칸의 의미는 그대로다 */}
              <Text style={styles.label}>{mood.label}</Text>
            </Pressable>
          ))}
          {/* 칸을 못 얻은 우리 이모지(주로 상황 11종) — 뒤에 잇는다 */}
          {extras.map((e) => (
            <Pressable
              key={e.id}
              style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              onPress={() => onPress({ coupleEmojiId: e.id }, false, e.label, e.moodEmoji, e.imageUrl)}
              accessibilityRole="button"
              accessibilityLabel={`내 얼굴 ${e.label} 무드로 남기기`}
            >
              <Image source={{ uri: e.imageUrl }} style={styles.cellImage} resizeMode="contain" />
              <Text style={styles.label}>{e.label}</Text>
            </Pressable>
          ))}
          {PREMIUM_MOOD_EMOJIS.map((m) => (
            <Pressable
              key={m.emoji}
              style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              onPress={() => onPress({ emoji: m.emoji }, !premiumAllowed, m.label, m.emoji)}
              accessibilityRole="button"
              accessibilityLabel={`${m.label} 무드로 남기기${premiumAllowed ? '' : ' — PRO 기능'}`}
            >
              {!premiumAllowed ? (
                <View style={styles.lockBadge}>
                  <Text style={styles.lockBadgeText}>PRO</Text>
                </View>
              ) : null}
              <Text style={styles.emoji}>{m.emoji}</Text>
              <Text style={styles.label}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  /* 격자 칸 폭(22%)이 예전 시트 여백(md)에 맞춰져 있다 — 공용 Sheet 의 lg 를 md 로 되돌린다 */
  sheet: { paddingHorizontal: spacing.md },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: spacing.xs },
  calendarLinkText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
  messageInput: {
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.caption,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  pickedEmoji: { fontSize: 32, lineHeight: 36 },
  pickedImage: { width: 40, height: 40 },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  privateText: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary },
  lineInput: {
    minHeight: 96,
    maxHeight: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  lineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  moreText: { fontSize: fontSize.body, fontWeight: '600', color: colors.textSecondary },
  lineButtons: { flexDirection: 'row', gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: '22%',
    minWidth: 60,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellPressed: { backgroundColor: colors.primarySoft, transform: [{ scale: 0.94 }] },
  lockBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.togetherBg,
  },
  lockBadgeText: { color: colors.together, fontSize: 8, fontWeight: '800' },
  /*
   * lineHeight 를 fontSize 보다 크게 주면(예전엔 30) iOS 가 그 여유분을 위아래로
   * 고르게 안 나눠서, 셀 안에서 emoji 가 정가운데가 아니라 위쪽으로 쏠려 보였다
   * (실기기 스크린샷 리포트, 2026-09-01 — cell 의 justifyContent:'center' 자체는
   * 정상 동작, glyph 라인 박스 안의 위치가 문제였다). lineHeight 를 fontSize 와
   * 똑같이 맞춰 여유분을 없애면 글자가 자기 박스를 꽉 채워 쏠릴 여지가 없다.
   */
  /*
   * 크기는 셀을 기준으로 잡는다. 셀은 정사각형(aspectRatio:1)이라 390px 화면에서 약 79px 인데,
   * 예전 26px 글리프로는 내용이 41px(26 + gap 2 + 라벨 13)뿐이라 <b>38px 가 비었다</b>
   * — 위아래로 19px 씩이라 "이모지 위에 공간이 많이 남는" 것으로 보였다(2026-09-14 리포트).
   * 셀을 줄이는 대신 글리프를 키웠다: 고르는 화면에서는 큰 편이 알아보기도 누르기도 낫다.
   */
  emoji: { fontSize: 36, lineHeight: 36 },
  /** 우리 이모지 — 유니코드 글리프보다 키운다. 얼굴이 알아보여야 고를 수 있다 */
  cellImage: { width: 48, height: 48 },
  label: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
}));
