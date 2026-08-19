/**
 * 바코드 스캔 — 포장식품 조회. 조회 결과를 들고 DietRecord 화면으로 돌아간다.
 * ⚠️ FOOD_DB_API_KEY 발급 전까지는 조회 자체가 "바코드 조회 기능이 아직 준비되지
 * 않았어요"로 응답한다(FoodDbClient 참고) — 카메라·스캔 UI는 키 발급과 무관하게 동작한다.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DietStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { foodDbApi } from '../../api/foodDb';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<DietStackParamList, 'BarcodeScan'>;

// 국내 포장식품은 대부분 EAN-13. UPC 는 수입식품 대비
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export function BarcodeScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [looking, setLooking] = useState(false);

  const onScanned = async ({ data }: { data: string }) => {
    if (scanned || looking) return;
    setScanned(true);
    setLooking(true);
    haptics.light();
    try {
      const result = await foodDbApi.barcode(data);
      haptics.success();
      // 이미 스택에 있는 DietRecord 인스턴스로 복귀 + 파라미터 병합
      navigation.navigate('DietRecord', { barcodeResult: result });
    } catch (e) {
      toast.error(getErrorMessage(e, '바코드 조회에 실패했어요.'));
      setScanned(false); // 다시 스캔할 수 있게 풀어준다
    } finally {
      setLooking(false);
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

  return (
    <View style={styles.safe}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={scanned ? undefined : onScanned}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>{looking ? '조회 중…' : '제품 바코드를 프레임 안에 맞춰주세요'}</Text>
      </View>
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
    width: 260,
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.white,
  },
  hint: {
    marginTop: spacing.lg,
    color: colors.white,
    fontSize: fontSize.body,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  permissionText: { color: colors.textSecondary, fontSize: fontSize.body, textAlign: 'center' },
}));
