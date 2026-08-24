/** 여행 앨범 — 피드 사진을 여행에 담아 그리드로 모아 본다 (담기/빼기) */
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '../../components/Icon';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { TripSectionTabs } from './TripSectionTabs';
import { ImageViewer, type ViewerImage } from '../../components/ImageViewer';
import { Sheet } from '../../components/Sheet';
import { tripApi } from '../../api/trip';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { AlbumPost } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'TripAlbum'>;

export function TripAlbumScreen({ route }: Props) {
  const { tripId, title } = route.params;
  const { width } = useWindowDimensions();
  const cell = (width - spacing.lg * 2 - spacing.sm) / 2; // 2열 정사각형 셀

  const [photos, setPhotos] = useState<AlbumPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /* 사진을 탭하면 전체화면으로 — 예전엔 onPress 가 없어 눌러도 아무 일이 없었다 */
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<AlbumPost[]>([]);

  /*
   * 뷰어에는 사진이 있는 항목만 넣는다. 그래서 그리드 위치와 뷰어 위치가 어긋나므로
   * id → 뷰어 인덱스 맵을 함께 만들어 탭한 사진이 정확히 열리게 한다.
   */
  const { viewerImages, viewerIndexById } = useMemo(() => {
    const withPhoto = photos.filter((p) => p.imageUrl);
    return {
      viewerImages: withPhoto.map<ViewerImage>((p) => ({
        key: String(p.id),
        uri: p.imageUrl as string,
        title: `${p.mine ? '내가' : `${p.authorName}님이`}  ·  ${p.createdAt.slice(5, 10)}`,
        titleColor: p.mine ? colors.coral : colors.indigo,
        caption: p.content ?? undefined,
      })),
      viewerIndexById: new Map(withPhoto.map((p, i) => [p.id, i])),
    };
  }, [photos]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setPhotos(await tripApi.album(tripId));
    } catch (e) {
      toast.error(getErrorMessage(e, '앨범을 불러오지 못했어요.'));
      // 실패해도 목록은 비우지 않는다 — "진짜 빈 목록"과 구분은 loadError 로 한다
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openPicker = async () => {
    try {
      setCandidates(await tripApi.albumCandidates(tripId));
      setPickerOpen(true);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
    }
  };

  const attach = async (post: AlbumPost) => {
    setPickerOpen(false);
    try {
      await tripApi.attachAlbum(tripId, post.id);
      haptics.light();
      toast.success('사진을 앨범에 담았어요.');
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    }
  };

  const detach = (post: AlbumPost) => {
    Alert.alert('앨범에서 빼기', '이 사진을 여행 앨범에서 뺄까요?\n사진은 우리 기록(피드)에 그대로 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '빼기',
        onPress: async () => {
          try {
            await tripApi.detachAlbum(tripId, post.id);
            haptics.light();
            toast.success('앨범에서 뺐어요.');
            load();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 형제 화면(경비·준비물·회고)으로 바로 이동 — 여행 상세를 거치지 않는다 */}
      <TripSectionTabs tripId={tripId} title={title} />
      <FlatList
        data={photos}
        keyExtractor={(p) => String(p.id)}
        numColumns={2}
        columnWrapperStyle={styles.columnWrap}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>우리 여행 사진 {photos.length}장</Text>
            <Button title="＋ 사진 담기" variant="secondary" size="md" onPress={openPicker} />
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.cell, { width: cell }]}
            activeOpacity={0.85}
            onPress={item.imageUrl ? () => setViewingIndex(viewerIndexById.get(item.id) ?? 0) : undefined}
            onLongPress={() => detach(item)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${item.mine ? '내' : item.authorName} 사진 크게 보기`}
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={[styles.photo, { width: cell, height: cell }]} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty, { width: cell, height: cell }]}>
                <MaterialCommunityIcons name="image-off-outline" size={28} color={colors.textMuted} />
              </View>
            )}
            {item.content ? (
              <Text style={styles.caption} numberOfLines={1}>
                {item.content}
              </Text>
            ) : null}
            <Text style={styles.by}>
              {item.mine ? '내가' : `${item.authorName}님이`} · {item.createdAt.slice(5, 10)}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="앨범을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={load}
              />
            ) : (
              <EmptyState
                icon="image-multiple-outline"
                title="아직 앨범에 담은 사진이 없어요"
                description={'"＋ 사진 담기"로 우리 기록의 사진을 모아보세요! (사진을 길게 눌러 빼기)'}
              />
            )
          ) : null
        }
      />

      {/* 사진 담기 모달 */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} cardStyle={styles.sheet}>
            <Text style={styles.sheetTitle}>어떤 사진을 담을까요?</Text>
            <FlatList
              data={candidates}
              keyExtractor={(p) => String(p.id)}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.candidate} activeOpacity={0.7} onPress={() => attach(item)}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.candThumb} />
                  ) : (
                    <View style={[styles.candThumb, styles.photoEmpty]}>
                      <MaterialCommunityIcons name="image-off-outline" size={20} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.candBody}>
                    <Text style={styles.candCaption} numberOfLines={1}>
                      {item.content || '사진'}
                    </Text>
                    <Text style={styles.by}>
                      {item.mine ? '내가' : `${item.authorName}님`} · {item.createdAt.slice(5, 10)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>담을 사진이 없어요. 우리 기록(피드)에 사진을 먼저 남겨보세요!</Text>
              }
            />
            <Button title="닫기" variant="ghost" size="md" onPress={() => setPickerOpen(false)} />
      </Sheet>

      {/* 전체화면 보기 — 좌우 스와이프로 앨범을 이어서 넘긴다 */}
      <ImageViewer
        images={viewerImages}
        initialIndex={viewingIndex}
        onClose={() => setViewingIndex(null)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  columnWrap: { gap: spacing.sm },

  cell: { marginBottom: spacing.md },
  photo: { borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xs },
  by: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xl, lineHeight: 20 },

  /* 배경·모서리·패딩은 Sheet 가 담당한다 — 여기서는 높이 상한만 준다 */
  sheet: { maxHeight: '75%' },
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  sheetList: { marginBottom: spacing.sm },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  candThumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginRight: spacing.md },
  candBody: { flex: 1 },
  candCaption: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
}));
