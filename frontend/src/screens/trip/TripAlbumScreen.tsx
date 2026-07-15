/** 여행 앨범 — 피드 사진을 여행에 담아 그리드로 모아 본다 (담기/빼기) */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { tripApi } from '../../api/trip';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { AlbumPost } from '../../types';

type Props = NativeStackScreenProps<PlaceStackParamList, 'TripAlbum'>;

export function TripAlbumScreen({ route }: Props) {
  const { tripId } = route.params;
  const { width } = useWindowDimensions();
  const cell = (width - spacing.lg * 2 - spacing.sm) / 2; // 2열 정사각형 셀

  const [photos, setPhotos] = useState<AlbumPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<AlbumPost[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPhotos(await tripApi.album(tripId));
    } catch (e) {
      toast.error(getErrorMessage(e, '앨범을 불러오지 못했어요.'));
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
            onLongPress={() => detach(item)}
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
            <Text style={styles.empty}>
              아직 앨범에 담은 사진이 없어요.{'\n'}"＋ 사진 담기"로 우리 기록의 사진을 모아보세요! (사진을 길게 눌러 빼기)
            </Text>
          ) : null
        }
      />

      {/* 사진 담기 모달 */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet}>
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
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceCard, borderRadius: radius.xl, padding: spacing.lg, maxHeight: '75%' },
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
});
