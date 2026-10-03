/**
 * 내 기록 내보내기 — 사진까지 ZIP 한 파일로 (docs/DATA_EXPORT_2026-10-01.md).
 *
 * <p>"내 기록은 언제든 가져갈 수 있다" 가 목적이라 결제와 무관하다. 한도(주 2회)는 원가 방어선이고
 * 넘겨도 결제를 권하지 않는다(서버가 429 — PlanGuard.upsells). 이어받기는 횟수를 쓰지 않는다.
 *
 * <p>들어오는 길: MY → "내 기록 내보내기", 홈의 "상대가 탈퇴를 요청했어요" 배너, 회원 탈퇴 확인 창.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { exportApi } from '../../api/export';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { Alert } from '../../utils/alert';
import { sectionLabel } from '../../utils/exportDocument';
import {
  EXPORT_INCLUDES_MEDIA,
  ExportCancelled,
  availableBytes,
  canExportRecords,
  discardExport,
  formatBytes,
  pendingExport,
  runExport,
  shareExport,
  type ExportCancelToken,
  type ExportProgress,
  type ExportResult,
} from '../../utils/recordExport';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { ExportSummary } from '../../types';

/** 받는 동안에만 화면을 켜 둔다 — iOS 는 백그라운드로 가면 받기가 멈춘다. */
function KeepAwake() {
  useKeepAwake();
  return null;
}

type Pending = ReturnType<typeof pendingExport>;

export function RecordExportScreen() {
  // 로그인한 사람만 오는 화면이다. 0 은 어떤 계정과도 맞지 않아 남은 상태를 남의 것으로 본다(안전한 쪽)
  const userId = useAuthStore((s) => s.user?.id) ?? 0;
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [saveToGallery, setSaveToGallery] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const cancel = useRef<ExportCancelToken>({ cancelled: false });
  /*
   * 연타 가드 — running(state)은 다음 렌더에야 버튼을 끄므로, 그 사이 두 번째 탭이 들어오면
   * start() 가 두 번 불려 주 2회 한도가 한 번에 다 깎였다(docs/my-current-state.md §7-3).
   * 첫 await 보다 먼저 ref 로 잠근다.
   */
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setPending(pendingExport(userId));
    try {
      setSummary(await exportApi.summary());
    } catch (e) {
      setLoadError(getErrorMessage(e, '내보낼 기록을 불러오지 못했어요.'));
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // 화면을 떠나면 멈춘다 — 받은 것은 남고 다음에 이어서 한다
  useEffect(
    () => () => {
      cancel.current.cancelled = true;
    },
    [],
  );

  const run = async (fresh: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    if (!(await canExportRecords())) {
      toast.error('이 기기에서는 파일을 저장할 수 없어요.');
      inFlight.current = false;
      setRunning(false);
      return;
    }
    cancel.current = { cancelled: false };
    setResult(null);
    try {
      let started: ExportSummary | null = null;
      if (fresh) {
        if (saveToGallery && EXPORT_INCLUDES_MEDIA) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
          const { status } = await MediaLibrary.requestPermissionsAsync(true);
          if (status !== 'granted') {
            toast.error('갤러리 권한이 없어 ZIP 에만 담을게요.');
          }
        }
        started = await exportApi.start();
        setSummary(started);
      }
      const done = await runExport({
        userId,
        summary: started,
        saveToGallery: fresh ? saveToGallery : false,
        onProgress: setProgress,
        cancel: cancel.current,
      });
      setResult(done);
      setPending(pendingExport(userId));
      await shareExport(done.zipUri, done.zipName);
    } catch (e) {
      if (e instanceof ExportCancelled) return;
      Alert.alert('내보내기를 멈췄어요', `${getErrorMessage(e, '잠시 뒤 다시 시도해주세요.')}\n받은 것은 남아 있어 이어서 할 수 있어요.`);
      setPending(pendingExport(userId));
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  };

  const onStart = () => {
    if (!summary) return;
    const free = availableBytes();
    // ZIP 을 묶는 동안 받은 파일과 ZIP 이 잠깐 같이 있다 — 예상 용량의 두 배를 본다
    if (free !== null && free < summary.estimatedBytes * 2.2) {
      Alert.alert(
        '저장공간이 모자랄 수 있어요',
        `약 ${formatBytes(summary.estimatedBytes * 2.2)}가 필요한데 ${formatBytes(free)} 남아 있어요.`,
        [
          { text: '취소', style: 'cancel' },
          { text: '그래도 시작', onPress: () => void run(true) },
        ],
      );
      return;
    }
    void run(true);
  };

  const onDiscard = () => {
    Alert.alert('받던 내보내기를 지울까요?', '받아 둔 파일이 지워지고, 다음에는 처음부터 받아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () => {
          discardExport();
          setPending(null);
          setResult(null);
        },
      },
    ]);
  };

  const outOfQuota = summary?.remaining === 0;
  const total = summary?.sections.reduce((n, s) => n + s.count, 0) ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {running ? <KeepAwake /> : null}
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.lead}>
          함께한 기록과 내 기록을 파일 하나(ZIP)로 받아요.{'\n'}
          {EXPORT_INCLUDES_MEDIA
            ? '올린 사진·음성까지 담기고, 압축을 풀면 index.html 로 한눈에 볼 수 있어요.'
            : '웹에서는 기록만 담겨요. 사진까지 받으려면 휴대폰 앱에서 내보내 주세요.'}
        </Text>

        {loadError ? (
          <View style={styles.card}>
            <Text style={styles.body}>{loadError}</Text>
            <Button title="다시 불러오기" variant="secondary" size="md" onPress={() => void load()} style={styles.mt} />
          </View>
        ) : null}

        {summary ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>담길 기록</Text>
            <Text style={styles.body}>
              기록 {total.toLocaleString()}건
              {EXPORT_INCLUDES_MEDIA ? ` · 사진·음성 ${summary.mediaCount.toLocaleString()}개 · 약 ${formatBytes(summary.estimatedBytes)}` : ''}
            </Text>
            <Text style={styles.caption}>
              {summary.sections
                .filter((s) => s.count > 0)
                .map((s) => `${sectionLabel(s.key)} ${s.count}`)
                .join(' · ') || '아직 기록이 없어요.'}
            </Text>
            {!summary.coupled ? <Text style={styles.caption}>커플이 연결되어 있지 않아 내 기록만 담겨요.</Text> : null}
            {EXPORT_INCLUDES_MEDIA ? (
              <Text style={styles.caption}>사진은 올릴 때 줄여 저장되어, 처음 찍은 원본보다 작을 수 있어요.</Text>
            ) : null}
          </View>
        ) : null}

        {pending && !running && !result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{pending.phase === 'done' ? '만들어 둔 파일이 있어요' : '받다가 멈춘 내보내기가 있어요'}</Text>
            <Text style={styles.caption}>{new Date(pending.startedAt).toLocaleString()}에 시작</Text>
            <View style={styles.row}>
              {pending.phase === 'done' && pending.zipUri ? (
                <Button
                  title="다시 저장하기"
                  size="md"
                  onPress={() => void shareExport(pending.zipUri!, pending.zipName)}
                  style={styles.flex}
                />
              ) : (
                <Button title="이어서 받기" size="md" onPress={() => void run(false)} style={styles.flex} />
              )}
              <Button title="지우기" variant="ghost" size="md" onPress={onDiscard} style={styles.flex} />
            </View>
            {pending.phase !== 'done' ? <Text style={styles.caption}>이어서 받기는 이번 주 횟수를 쓰지 않아요.</Text> : null}
          </View>
        ) : null}

        {running && progress ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{phaseLabel(progress)}</Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round(ratio(progress) * 100)}%` }]} />
            </View>
            <Text style={styles.caption}>
              {progress.phase === 'records'
                ? `기록 ${progress.sectionsDone} / ${progress.sectionsTotal}`
                : progress.phase === 'media'
                  ? `사진·음성 ${progress.mediaDone.toLocaleString()} / ${progress.mediaTotal.toLocaleString()}`
                  : '거의 다 됐어요'}
            </Text>
            {progress.waitingForNetwork ? <Text style={styles.warn}>인터넷 연결을 기다리는 중이에요.</Text> : null}
            <Text style={styles.caption}>
              {Platform.OS === 'web'
                ? '이 탭을 닫지 말아 주세요.'
                : '앱을 켜 둔 채로 기다려 주세요. 다른 앱으로 가면 멈추고, 돌아오면 이어서 받을 수 있어요.'}
            </Text>
          </View>
        ) : null}

        {result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>다 만들었어요</Text>
            <Text style={styles.body}>{result.zipName}</Text>
            {result.failed.length + result.missing > 0 ? (
              <Text style={styles.warn}>
                받지 못한 파일 {result.failed.length + result.missing}개 — 목록은 ZIP 안 README.txt 에 있어요.
              </Text>
            ) : null}
            <Button
              title={Platform.OS === 'web' ? '다시 내려받기' : '파일 저장·공유'}
              size="md"
              onPress={() => void shareExport(result.zipUri, result.zipName)}
              style={styles.mt}
            />
          </View>
        ) : null}

        {summary && !running ? (
          <View style={styles.actions}>
            {EXPORT_INCLUDES_MEDIA ? (
              <Checkbox checked={saveToGallery} onChange={setSaveToGallery} label="사진을 갤러리에도 저장" />
            ) : null}
            <Button
              title={outOfQuota ? '이번 주 횟수를 다 썼어요' : '새로 내보내기'}
              onPress={onStart}
              disabled={outOfQuota || total === 0}
            />
            <Text style={styles.caption}>
              새로 내보내기는 일주일에 {summary.limit}번까지예요
              {summary.remaining !== null ? ` (남은 횟수 ${summary.remaining})` : ''}. 받던 것을 이어 받는 건 세지 않아요.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function phaseLabel(p: ExportProgress): string {
  switch (p.phase) {
    case 'records':
      return '기록을 받는 중';
    case 'media':
      return '사진·음성을 받는 중';
    case 'zip':
      return '파일로 묶는 중';
    default:
      return '마무리하는 중';
  }
}

function ratio(p: ExportProgress): number {
  if (p.phase === 'records') return p.sectionsTotal ? (p.sectionsDone / p.sectionsTotal) * 0.1 : 0;
  if (p.phase === 'media') return 0.1 + (p.mediaTotal ? (p.mediaDone / p.mediaTotal) * 0.8 : 0.8);
  return p.phase === 'zip' ? 0.95 : 1;
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  lead: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: fontSize.body, color: colors.textPrimary },
  caption: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  warn: { fontSize: fontSize.caption, color: colors.dangerText },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginVertical: spacing.xs },
  barFill: { height: 8, backgroundColor: colors.primary },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
  mt: { marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
}));
