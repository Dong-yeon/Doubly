/**
 * 채팅 지도 링크 → 럽슐랭 — 칩을 누르면 뜨는 하단 시트. 여기서 처음으로 서버에 해석을 묻는다.
 *
 * <p>흐름(docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md):
 * <ul>
 *   <li>이미 럽슐랭에 있는 곳 → "이미 럽슐랭에 있어요 · 보러 가기"</li>
 *   <li>후보 1~3개 → 하나를 고르면 바로 담는다. 별점은 묻지 않는다(방문 0건 = 가고 싶은 곳).</li>
 *   <li>후보 없음 → 시트를 닫고 읽어 낸 이름을 검색어로 채운 장소 추가 화면으로 보낸다.</li>
 *   <li>연결 끊김(status 0) → "연결이 불안정해요" + 다시 시도</li>
 * </ul>
 *
 * <p>저장은 장소 추가와 같은 {@code placeApi.save} 다 — FREE 장소 한도(402)·중복 방지·계측이 그대로 걸린다.
 * 402 면 이 시트를 닫는다: 업그레이드 시트는 api/client 가 전역으로 띄우고, 시트 둘이 겹치면 iOS 에서 뒤의
 * 것이 안 뜬다(RootOverlayModal 주석).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Sheet } from '../Sheet';
import { Button } from '../Button';
import { MaterialCommunityIcons } from '../Icon';
import { placeApi, toSavePlacePayload } from '../../api/place';
import { placeSubtitle } from '../../utils/placeLinks';
import { errorCodeOf, isApiError } from '../../api/client';
import { usePlaceStore } from '../../store/placeStore';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { PlaceLinkCandidate, ResolvePlaceLinkResponse } from '../../types';

interface Props {
  /** 해석할 링크 — null 이면 닫힌 상태 */
  url: string | null;
  /** 링크가 붙어 온 메시지 본문 — 지도 앱 공유 문구의 이름·주소를 서버가 차선으로 쓴다 */
  messageText?: string;
  onClose: () => void;
  /** 칩을 써서 끝났다(담았거나, 이미 있던 곳을 보러 갔다) — 그 메시지의 칩을 더 띄우지 않는다 */
  onHandled: () => void;
  onOpenPlace: (placeId: number, name: string) => void;
  /** 후보를 못 찾았다 — 장소 추가 화면을 이 검색어로 연다 */
  onFallbackAdd: (keyword: string) => void;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; data: ResolvePlaceLinkResponse };

export function PlaceLinkSheet(props: Props) {
  return (
    <Sheet visible={props.url != null} onClose={props.onClose} position="bottom">
      <Text style={styles.title}>럽슐랭에 담기</Text>
      {/* 링크마다 새로 시작한다(key) — 앞 링크의 결과가 다음 링크 시트에 잠깐 비치지 않게 */}
      {props.url ? <PlaceLinkSheetBody key={props.url} {...props} url={props.url} /> : null}
    </Sheet>
  );
}

function PlaceLinkSheetBody({
  url,
  messageText,
  onClose,
  onHandled,
  onOpenPlace,
  onFallbackAdd,
}: Props & { url: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // 서버에 묻는다 — 상태는 응답이 온 뒤에만 바꾼다(처음 상태가 이미 loading 이다)
  const fetchResolve = () =>
    placeApi.resolveLink(url, messageText).then(
      (data) => {
        if (!data.existingPlaceId && data.candidates.length === 0) {
          // 못 찾았다 — 시트에 붙잡아 두지 않고 직접 찾는 화면으로 넘긴다(검색어는 읽어 낸 이름)
          onClose();
          toast.info(data.ogTitle ? '링크의 장소를 직접 찾아볼게요' : '링크에서 장소를 못 찾았어요. 직접 찾아볼게요');
          onFallbackAdd(data.ogTitle ?? '');
          return;
        }
        setPhase({ kind: 'result', data });
      },
      (e: unknown) => {
        if (isApiError(e) && e.status === 0) setPhase({ kind: 'offline' });
        else setPhase({ kind: 'error', message: getErrorMessage(e, '링크를 확인하지 못했어요.') });
      },
    );

  // 시트가 열릴 때 한 번 — 링크가 바뀌면 key 로 새로 마운트된다
  useEffect(() => {
    void fetchResolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    setPhase({ kind: 'loading' });
    void fetchResolve();
  };

  const openExisting = (placeId: number, name: string) => {
    onHandled();
    onClose();
    onOpenPlace(placeId, name);
  };

  const onPick = async (c: PlaceLinkCandidate) => {
    if (c.existingPlaceId) {
      openExisting(c.existingPlaceId, c.name);
      return;
    }
    if (savingKey) return;
    setSavingKey(c.kakaoPlaceId ?? c.name);
    try {
      const saved = await placeApi.save(toSavePlacePayload(c));
      usePlaceStore.getState().invalidate();
      if (saved.created === false) {
        // 해석 뒤에 상대가 먼저 담았을 수 있다
        toast.info('이미 럽슐랭에 있어요');
        openExisting(saved.id, saved.name);
        return;
      }
      haptics.success();
      toast.success(`${saved.name}을(를) 가고 싶은 곳으로 담았어요`);
      onHandled();
      onClose();
    } catch (e) {
      const code = errorCodeOf(e);
      if (code === 'PLAN_UPGRADE_REQUIRED' || code === 'PLAN_LIMIT_EXCEEDED') {
        // 업그레이드 시트는 api/client 가 이미 띄웠다 — 이 시트는 비켜 준다
        onClose();
        return;
      }
      if (isApiError(e) && e.status === 0) toast.error('연결이 불안정해요. 다시 눌러 주세요.');
      else toast.error(getErrorMessage(e, '럽슐랭에 담지 못했어요.'));
    } finally {
      setSavingKey(null);
    }
  };

  const existing =
    phase.kind === 'result' && phase.data.existingPlaceId
      ? phase.data.candidates.find((c) => c.existingPlaceId === phase.data.existingPlaceId) ?? phase.data.candidates[0]
      : null;

  return (
    <>
      {phase.kind === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>링크 속 장소를 찾고 있어요</Text>
        </View>
      ) : phase.kind === 'offline' || phase.kind === 'error' ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="cloud-off-outline" size={28} color={colors.textSecondary} />
          <Text style={styles.muted}>
            {phase.kind === 'offline' ? '연결이 불안정해요. 잠시 후 다시 시도해 주세요.' : phase.message}
          </Text>
          <Button title="다시 시도" variant="secondary" size="sm" onPress={retry} />
        </View>
      ) : existing && phase.kind === 'result' && phase.data.existingPlaceId ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="check-circle" size={28} color={colors.togetherText} />
          <Text style={styles.existingName}>{existing.name}</Text>
          <Text style={styles.muted}>이미 럽슐랭에 있어요</Text>
          <Button
            title="보러 가기"
            size="sm"
            onPress={() => openExisting(phase.data.existingPlaceId as number, existing.name)}
          />
        </View>
      ) : phase.kind === 'result' ? (
        <View style={styles.list}>
          <Text style={styles.muted}>
            {phase.data.matched ? '이 장소가 맞나요? 누르면 가고 싶은 곳으로 담겨요.' : '어느 곳인가요? 고르면 가고 싶은 곳으로 담겨요.'}
          </Text>
          {phase.data.candidates.map((c, i) => {
            const key = c.kakaoPlaceId ?? `${c.name}-${i}`;
            const savingThis = savingKey === (c.kakaoPlaceId ?? c.name);
            return (
              <Pressable
                key={key}
                onPress={() => void onPick(c)}
                disabled={savingKey != null}
                style={({ pressed }) => [styles.candidate, pressed && styles.pressed, savingKey != null && !savingThis && styles.dimmed]}
                accessibilityRole="button"
                accessibilityLabel={c.existingPlaceId ? `${c.name} — 이미 럽슐랭에 있어요, 보러 가기` : `${c.name} 럽슐랭에 담기`}
              >
                <View style={styles.flex}>
                  <Text style={styles.candidateName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {placeSubtitle(c) ? (
                    <Text style={styles.candidateMeta} numberOfLines={1}>
                      {placeSubtitle(c)}
                    </Text>
                  ) : null}
                </View>
                {savingThis ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : c.existingPlaceId ? (
                  <Text style={styles.existingTag}>이미 있어요 · 보러 가기</Text>
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
                )}
              </Pressable>
            );
          })}
          <Button title="닫기" variant="ghost" size="sm" onPress={onClose} />
        </View>
      ) : null}
    </>
  );
}

const styles = themedStyles((colors) => ({
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  muted: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center' },
  existingName: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  list: { gap: spacing.sm },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  flex: { flex: 1 },
  candidateName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  candidateMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  existingTag: { fontSize: fontSize.caption, fontWeight: '700', color: colors.togetherText },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.5 },
}));
