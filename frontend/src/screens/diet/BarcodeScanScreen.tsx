/**
 * 바코드 스캔 — 포장식품 조회. 찾으면 결과를 들고 DietRecord 로 돌아간다.
 *
 * <p>서버는 식품안전나라 → Open Food Facts 순으로 찾는다(docs/BARCODE_LOOKUP_2026-09-29.md).
 * 못 찾으면 여기서 멈추고 <b>영양성분표 찍기</b>(AI 가 표기값을 그대로 읽는다)를 권한다.
 *
 * <p><b>한 번 읽으면 사용자가 고를 때까지 다시 읽지 않는다.</b> 예전엔 실패하자마자 스캔을 다시
 * 열어서, 카메라가 여전히 보고 있는 같은 바코드를 곧장 또 읽었다 — 진동과 실패 토스트가 끝없이
 * 반복돼 "인식을 못 한다"로 보였다(2026-09-29 사용자 보고).
 *
 * <p><b>영양성분표도 이 화면에서 찍는다(2026-09-30).</b> 예전엔 "영양성분표 찍기"가 식단기록으로
 * 돌아가 카메라를 다시 열었는데, 그 "돌아가기"가 {@code navigate} 였다. React Navigation 7 의
 * navigate 는 스택에 있는 화면으로 <b>돌아가지 않고 새로 쌓는다</b> — 식단기록 → 스캔 → 식단기록(새것)
 * 이 되어, X 로 닫으면 스캔 화면이 남고 반복할수록 쌓였다(적어 둔 항목도 밑의 식단기록에 남아 있었다).
 * 이제 이미 떠 있는 카메라를 "표 찍기" 모드로 돌려 셔터로 찍고, 결과는 {@code popTo(..., { merge: true })}
 * 로 <b>원래 식단기록 인스턴스</b>에 넘긴다. 바코드 조회 성공 경로도 같은 이유로 popTo 다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DietStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { foodDbApi } from '../../api/foodDb';
import { isApiError } from '../../api/client';
import { getErrorMessage } from '../../utils/error';
import { pickImageAsset, shrinkImage } from '../../utils/imageUpload';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { BarcodeLookup } from '../../types';

type Props = NativeStackScreenProps<DietStackParamList, 'BarcodeScan'>;

// 국내 포장식품은 대부분 EAN-13. UPC 는 수입식품 대비
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** 스캔을 멈추고 사용자가 다음을 고르게 하는 상태 */
type Outcome =
  /** 제품명은 알지만 영양정보가 없다 */
  | { kind: 'nameOnly'; result: BarcodeLookup }
  /** 어느 출처에도 없다 */
  | { kind: 'notFound' }
  /** 네트워크·서버 문제 — 다시 스캔하면 될 수도 있다 */
  | { kind: 'error'; message: string };

export function BarcodeScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [looking, setLooking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [torch, setTorch] = useState(false);
  /**
   * 영양성분표 찍기 모드 — 바코드 인식을 끄고 셔터를 띄운다. 값은 바코드로 알아낸 제품명(없으면 빈 문자열).
   * null 이면 바코드 모드.
   */
  const [labelFor, setLabelFor] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // 조회 중이거나 결과를 보여 주는 동안, 표 찍기 모드에서는 카메라가 바코드를 더 읽지 않는다
  const paused = looking || outcome !== null || labelFor !== null;
  /*
   * 동기 잠금 — paused 는 상태라 다음 렌더에야 반영되는데, 카메라는 같은 바코드를 프레임마다 연달아
   * 콜백한다. 그 사이 두 번째 콜백이 들어와 조회가 두 번 나가고 식단기록에 같은 음식이 두 번 붙었다
   * (1.0.5 점검). 결과 화면이 닫혀 스캔이 다시 열릴 때 풀고, 찾아서 돌아가는 중이면 끝까지 잠가 둔다.
   */
  const scanLockRef = useRef(false);
  const leavingRef = useRef(false);
  useEffect(() => {
    if (!paused && !leavingRef.current) scanLockRef.current = false;
  }, [paused]);

  /** 원래 식단기록 인스턴스로 돌아가며 파라미터를 합친다 — navigate 는 새로 쌓는다(파일 주석) */
  const backToRecord = (params: DietStackParamList['DietRecord']) => {
    navigation.popTo('DietRecord', params, { merge: true });
  };

  const onScanned = async ({ data }: { data: string }) => {
    if (paused || scanLockRef.current) return;
    scanLockRef.current = true;
    setLooking(true);
    haptics.light();
    try {
      const result = await foodDbApi.barcode(data);
      const hasNutrition = result.calories != null || result.carbs != null || result.protein != null;
      if (hasNutrition) {
        haptics.success();
        leavingRef.current = true;
        backToRecord({ barcodeResult: result });
        return;
      }
      setOutcome({ kind: 'nameOnly', result });
    } catch (e) {
      haptics.medium();
      setOutcome(
        isApiError(e) && e.status === 404
          ? { kind: 'notFound' }
          : { kind: 'error', message: getErrorMessage(e, '바코드 조회에 실패했어요.') },
      );
    } finally {
      setLooking(false);
    }
  };

  /** 영양성분표 찍기 모드로 — 같은 카메라를 그대로 쓴다 */
  const toLabel = (productName?: string | null) => {
    setOutcome(null);
    setLabelFor(productName ?? '');
  };

  /**
   * 찍은(고른) 표 사진을 식단기록에 넘긴다 — 업로드·AI 분석·항목 채우기는 식단기록이 한다
   * (사진 분석 결과를 적용하는 코드가 거기 있다). 글씨가 작아 평소(1024)보다 크게 줄인다.
   */
  const sendLabel = async (image: { uri: string; width: number; height: number }) => {
    const uri = await shrinkImage(image, 1600);
    backToRecord({ labelPhoto: { uri, productName: labelFor || undefined } });
  };

  const onShutter = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (!photo) return;
      haptics.light();
      await sendLabel(photo);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 찍지 못했어요. 다시 시도해주세요.'));
    } finally {
      setCapturing(false);
    }
  };

  /** 이미 찍어 둔 표 사진이 있을 때 */
  const onPickLabel = async () => {
    try {
      const picked = await pickImageAsset();
      if (picked) await sendLabel(picked);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>바코드를 스캔하려면 카메라 접근 권한이 필요해요.</Text>
          <Button title="권한 허용하기" onPress={requestPermission} />
        </View>
      </SafeAreaView>
    );
  }

  const renderOutcome = (o: Outcome) => {
    const productName = o.kind === 'nameOnly' ? o.result.foodName : null;
    return (
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>
          {o.kind === 'nameOnly'
            ? (productName ?? '이 제품')
            : o.kind === 'notFound'
              ? '이 바코드의 영양정보를 찾지 못했어요'
              : '조회하지 못했어요'}
        </Text>
        <Text style={styles.sheetBody}>
          {o.kind === 'nameOnly'
            ? '제품은 찾았는데 영양정보가 없어요. 포장의 영양성분표를 찍으면 AI가 표기값 그대로 읽어요.'
            : o.kind === 'notFound'
              ? '포장의 영양성분표를 찍으면 AI가 표기값 그대로 읽어요.'
              : o.message}
        </Text>
        {o.kind !== 'error' ? (
          <Button title="영양성분표 찍기" onPress={() => toLabel(productName)} />
        ) : null}
        {o.kind === 'nameOnly' ? (
          <Button
            title="이름만 넣기"
            variant="secondary"
            onPress={() => backToRecord({ barcodeResult: o.result })}
          />
        ) : null}
        <Button
          title="다시 스캔"
          variant={o.kind === 'error' ? 'primary' : 'ghost'}
          onPress={() => setOutcome(null)}
        />
      </View>
    );
  };

  return (
    <View style={styles.safe}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={paused ? undefined : onScanned}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={labelFor !== null ? styles.labelFrame : styles.frame} />
        <Text style={styles.hint}>
          {labelFor !== null
            ? '영양성분표가 틀 안에 꽉 차게 찍어주세요\n글씨가 또렷하게 보일 때 누르세요'
            : looking
              ? '조회 중…'
              : '바코드를 프레임 안에 맞춰주세요\n흐리게 보이면 조금 멀리서 비춰보세요'}
        </Text>
      </View>

      {/* 어두운 곳에서는 인식이 급격히 떨어진다 — 아이콘 폰트에 손전등이 없어 글자로 둔다 */}
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <Pressable
          onPress={() => setTorch((v) => !v)}
          style={styles.torchBtn}
          accessibilityRole="button"
          accessibilityLabel={torch ? '플래시 끄기' : '플래시 켜기'}
        >
          <Text style={styles.torchText}>{torch ? '플래시 끄기' : '플래시 켜기'}</Text>
        </Pressable>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
        {labelFor !== null ? (
          <View style={styles.labelBar}>
            <Pressable
              onPress={() => setLabelFor(null)}
              style={styles.labelSide}
              accessibilityRole="button"
              disabled={capturing}
            >
              <Text style={styles.labelSideText}>바코드로</Text>
            </Pressable>
            <Pressable
              onPress={() => void onShutter()}
              style={[styles.shutter, capturing && styles.shutterBusy]}
              accessibilityRole="button"
              accessibilityLabel="영양성분표 찍기"
              disabled={capturing}
            >
              {capturing ? <ActivityIndicator color={colors.white} /> : <View style={styles.shutterInner} />}
            </Pressable>
            <Pressable
              onPress={() => void onPickLabel()}
              style={styles.labelSide}
              accessibilityRole="button"
              disabled={capturing}
            >
              <Text style={styles.labelSideText}>앨범에서</Text>
            </Pressable>
          </View>
        ) : outcome ? (
          renderOutcome(outcome)
        ) : (
          <Pressable
            onPress={() => toLabel()}
            style={styles.labelLink}
            accessibilityRole="button"
            disabled={looking}
          >
            <Text style={styles.labelLinkText}>바코드가 안 읽히나요? 영양성분표 찍기</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  frame: {
    width: 280,
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.white,
  },
  hint: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    color: colors.white,
    fontSize: fontSize.body,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  topBar: { position: 'absolute', top: 0, right: 0, padding: spacing.md },
  torchBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  torchText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '800' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg },
  // 영양성분표는 세로로 길다 — 바코드 틀보다 크고 세로로
  labelFrame: {
    width: 300,
    height: 380,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.white,
  },
  labelBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelSide: {
    minWidth: 88,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  labelSideText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '800' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shutterBusy: { opacity: 0.6 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
  labelLink: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  labelLinkText: { color: colors.white, fontSize: fontSize.body, fontWeight: '800' },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  sheetBody: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.xs },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  permissionText: { color: colors.textSecondary, fontSize: fontSize.body, textAlign: 'center' },
}));
