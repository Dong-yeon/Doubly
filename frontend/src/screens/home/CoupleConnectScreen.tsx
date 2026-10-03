/** 커플 연결 — 설계서 3.2 REL-01/REL-02 (초대코드 생성 / 코드 입력 연결) */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { TextField } from '../../components/TextField';
import { useRelationStore } from '../../store/relationStore';
import { relationApi } from '../../api/relation';
import { errorCodeOf } from '../../api/client';
import { getErrorMessage } from '../../utils/error';
import { copyText, shareText } from '../../utils/share';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'CoupleConnect'>;

/**
 * 초대코드 형식 — 혼동 문자(I,O,0,1) 제외 32문자 알파벳 6자리(백엔드 InviteCodeGenerator와 동일).
 * 공유 문구("Dubly에서 커플로 연결해요! 초대코드: ABC234 (24시간 유효)")를 말풍선째로 길게 눌러
 * 통째로 복사·붙여넣는 경우가 많아, 그 안에서 실제 코드만 골라낸다. \b 경계 덕분에 "Dubly"(5자)
 * 처럼 길이가 다른 라틴 문자열은 걸리지 않는다. 매칭 실패 시(짧게 직접 타이핑 중 등)엔 이전처럼
 * 앞 6자만 사용해 폭 넘는 입력을 막는다.
 */
const INVITE_CODE_PATTERN = /\b[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}\b/i;

function extractInviteCode(text: string): string {
  const upper = text.toUpperCase();
  const match = upper.match(INVITE_CODE_PATTERN);
  return match ? match[0] : upper.trim().slice(0, 6);
}

/** 코드를 띄워 둔 동안 상대가 연결했는지 확인하는 간격 */
const CONNECT_POLL_MS = 4000;

/*
 * 내 코드는 서버에서 받아 온다(GET /relations/couple/invite). 예전엔 모듈 변수에만 들고 있어서
 * 앱을 재시작하면 사라졌고, 로그아웃해도 비워지지 않아 같은 기기의 다음 계정에게 앞 계정의 코드가
 * 보였다 — 그 코드를 공유하면 상대는 앞 계정과 연결됐다(docs/first-experience-audit.md #6·#16).
 * 진입 시 자동 생성은 여전히 하지 않는다 — 코드를 <b>입력</b>하러 온 사람에게도 초대가 생긴다.
 */
export function CoupleConnectScreen({ navigation }: Props) {
  const { createInvite, findInvite, connectCouple, fetchAll } = useRelationStore();
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    findInvite()
      .then((invite) => {
        // 불러오는 사이 새로 만들었으면 그쪽이 최신이다
        if (alive && invite) setCode((current) => current ?? invite.code);
      })
      .catch(() => undefined); // 못 불러와도 "초대코드 만들기"로 새로 받으면 된다
    return () => {
      alive = false;
    };
  }, [findInvite]);

  /** 연결이 확인되면 한 번만 — 목록을 갱신하고 화면을 닫는다 */
  const finishConnected = useCallback(async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    await fetchAll().catch(() => undefined);
    haptics.success();
    toast.success('커플로 연결되었어요! ');
    navigation.goBack();
  }, [fetchAll, navigation]);

  /*
   * 초대한 쪽은 연결돼도 알 길이 없었다 — 아직 관계 id 가 없어 실시간 채널을 구독할 수 없고, 홈은
   * 포커스될 때만 다시 불러온다. 코드를 띄워 둔 동안만 가볍게 확인하고, 앱으로 돌아온 순간(공유하러
   * 메신저에 다녀온 뒤)에도 바로 확인한다. 서버는 연결 시 초대한 쪽에 푸시도 보낸다.
   */
  useFocusEffect(
    useCallback(() => {
      if (!code) return undefined;
      let busy = false;
      const check = async () => {
        if (busy || closedRef.current) return;
        busy = true;
        try {
          const relations = await relationApi.list();
          const connected = relations.some(
            (r) => r.relationType === 'COUPLE' && r.status === 'ACTIVE' && r.partner,
          );
          if (connected) await finishConnected();
        } catch {
          // 일시적 실패는 다음 차례에 다시 본다
        } finally {
          busy = false;
        }
      };
      const timer = setInterval(check, CONNECT_POLL_MS);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void check();
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [code, finishConnected]),
  );

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const invite = await createInvite();
      setCode(invite.code);
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  const onCopy = async () => {
    if (!code) return;
    try {
      await copyText(code);
      haptics.light();
      toast.success('초대코드를 복사했어요 ');
    } catch (e) {
      toast.error(getErrorMessage(e, '복사에 실패했어요.'));
    }
  };

  const onShare = async () => {
    if (!code) return;
    try {
      await shareText(`Dubly에서 커플로 연결해요! 초대코드: ${code} (24시간 유효)`);
    } catch (e) {
      // 공유 시트를 사용자가 그냥 닫아도 일부 플랫폼은 reject 한다 — 진짜 실패만 알린다
      toast.error(getErrorMessage(e, '공유에 실패했어요.'));
    }
  };

  const onConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      await connectCouple(input.trim().toUpperCase());
      await finishConnected();
    } catch (e) {
      // 이미 연결된 상태 — 앞선 요청이 서버에선 성공했는데 응답만 못 받은 경우가 대부분이다.
      // 실패 문구 대신 실제 상태를 다시 보고, 연결돼 있으면 성공으로 마무리한다.
      if (errorCodeOf(e) === 'ALREADY_CONNECTED') {
        await fetchAll().catch(() => undefined);
        if (useRelationStore.getState().couple?.partner) {
          await finishConnected();
          return;
        }
      }
      setError(getErrorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 키보드가 "연결하기" 버튼을 가리지 않도록 회피 (스크롤하면 키보드가 내려간다) */}
      <FormKeyboardView contentContainerStyle={styles.container}>
          {/* 초대코드 생성 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>내 초대코드</Text>
            {code ? (
              <>
                <View style={styles.codeBox}>
                  <Text style={styles.code}>{code}</Text>
                </View>
                {/* 설명은 코드 아래 캡션 한 줄 — 예전엔 제목 아래 안내문 + 괄호 */}
                <Text style={styles.codeCaption}>24시간 동안 유효 · 상대가 이 코드를 입력하면 연결돼요</Text>
                <View style={styles.codeActions}>
                  <Button title="복사" variant="soft" size="md" onPress={onCopy} style={styles.actionBtn} />
                  <Button
                    title="공유"
                    leftIcon={<MaterialCommunityIcons name="share-variant" size={18} color={colors.primary} />}
                    variant="soft"
                    size="md"
                    onPress={onShare}
                    style={styles.actionBtn}
                  />
                </View>
                <Button title="새 코드 만들기" variant="ghost" size="md" onPress={onGenerate} loading={generating} />
              </>
            ) : (
              <Button title="초대코드 만들기" onPress={onGenerate} loading={generating} style={styles.gap} />
            )}
          </View>

          <View style={styles.divider} />

          {/* 코드 입력 연결 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상대방 코드 입력</Text>
            <TextField
              value={input}
              onChangeText={(t) => setInput(extractInviteCode(t))}
              placeholder="받은 6자리 코드"
              autoCapitalize="characters"
              errorText={error ?? undefined}
              style={styles.codeInput}
            />
            <Button
              title="연결하기"
              onPress={onConnect}
              loading={connecting}
              disabled={input.trim().length < 6}
            />
          </View>
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  codeCaption: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  codeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  code: { fontSize: 40, fontWeight: '800', color: colors.textPrimary, letterSpacing: 8 },
  codeActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: { flex: 1 },
  gap: { marginTop: 0 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  codeInput: { letterSpacing: 4, fontWeight: '700' },
}));
