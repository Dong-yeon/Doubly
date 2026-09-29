/**
 * 바코드 스캔 — 포장식품 조회. 찾으면 결과를 들고 DietRecord 로 돌아간다.
 *
 * <p>서버는 식품안전나라 → Open Food Facts 순으로 찾는다(docs/BARCODE_LOOKUP_2026-09-29.md).
 * 못 찾으면 여기서 멈추고 <b>영양성분표 찍기</b>(AI 가 표기값을 그대로 읽는다)를 권한다.
 *
 * <p><b>한 번 읽으면 사용자가 고를 때까지 다시 읽지 않는다.</b> 예전엔 실패하자마자 스캔을 다시
 * 열어서, 카메라가 여전히 보고 있는 같은 바코드를 곧장 또 읽었다 — 진동과 실패 토스트가 끝없이
 * 반복돼 "인식을 못 한다"로 보였다(2026-09-29 사용자 보고).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DietStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { foodDbApi } from '../../api/foodDb';
import { isApiError } from '../../api/client';
import { getErrorMessage } from '../../utils/error';
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

  // 조회 중이거나 결과를 보여 주는 동안에는 카메라가 바코드를 더 읽지 않는다
  const paused = looking || outcome !== null;

  const onScanned = async ({ data }: { data: string }) => {
    if (paused) return;
    setLooking(true);
    haptics.light();
    try {
      const result = await foodDbApi.barcode(data);
      const hasNutrition = result.calories != null || result.carbs != null || result.protein != null;
      if (hasNutrition) {
        haptics.success();
        // 이미 스택에 있는 DietRecord 인스턴스로 복귀 + 파라미터 병합
        navigation.navigate('DietRecord', { barcodeResult: result });
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

  /** 영양성분표 촬영 — DietRecord 가 돌아오자마자 카메라를 열고 AI 로 읽는다 */
  const toLabel = (productName?: string | null) => {
    navigation.navigate('DietRecord', { scanLabel: productName ?? '' });
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
            onPress={() => navigation.navigate('DietRecord', { barcodeResult: o.result })}
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
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={paused ? undefined : onScanned}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>
          {looking ? '조회 중…' : '바코드를 프레임 안에 맞춰주세요\n흐리게 보이면 조금 멀리서 비춰보세요'}
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
        {outcome ? (
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
