/**
 * 전체화면 이미지 뷰어 — 좌우 스와이프 · 확대 · 닫기.
 *
 * <p><b>왜 만들었나</b>: 앱에 이미지 뷰어가 아예 없어서, 채팅으로 받은 사진은
 * 200×200 으로 잘린 썸네일이 전부였고(탭해도 무반응), 사진첩은 한 장 볼 때마다
 * 열고 닫기를 반복해야 했다. 커플 앱에서 "상대가 보낸 사진을 제대로 볼 수 없다"는
 * 기능 결손에 가까워 공용 뷰어를 둔다.
 *
 * <p><b>확대 지원 범위</b>: iOS·웹은 `ScrollView` 의 확대 축소로 핀치 줌이 된다.
 * Android 의 `ScrollView` 는 이 속성을 지원하지 않아 확대가 되지 않는다 —
 * 제스처 라이브러리를 붙이기 전까지의 한계이며, 좌우 이동·전체화면 보기는
 * 모든 플랫폼에서 동작한다.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from './Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '../store/toastStore';
import { getErrorMessage } from '../utils/error';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

export interface ViewerImage {
  /** 목록 키 — 같은 사진이 두 번 들어가도 구분되게 호출부에서 고유값을 준다 */
  key: string;
  uri: string;
  /** 상단 설명 (작성자·날짜 등) */
  title?: string;
  /** 하단 본문 */
  caption?: string;
  /** 제목 강조색 — 나/상대 구분 등 */
  titleColor?: string;
}

interface Props {
  images: ViewerImage[];
  /** 열 때 보여줄 사진 위치. null 이면 닫힌 상태 */
  initialIndex: number | null;
  onClose: () => void;
}

export function ImageViewer({ images, initialIndex, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex ?? 0);
  const listRef = useRef<FlatList<ViewerImage>>(null);
  // 저장·공유 둘 다 다운로드부터 하므로 겹치지 않게 하나만 진행한다
  const [working, setWorking] = useState<'save' | 'share' | null>(null);

  const visible = initialIndex !== null && images.length > 0;

  const onViewableChanged = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const first = viewableItems[0]?.index;
      if (first != null) setIndex(first);
    },
  ).current;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ViewerImage>) => (
      <ScrollView
        style={{ width }}
        contentContainerStyle={[styles.page, { width, height }]}
        maximumZoomScale={3}
        minimumZoomScale={1}
        centerContent
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <Image
          source={{ uri: item.uri }}
          style={{ width, height: height * 0.8 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </ScrollView>
    ),
    [width, height],
  );

  const current = images[index];

  /*
   * 갤러리 저장·공유 둘 다 로컬 파일이 있어야 한다 — uri 는 Cloudinary 원격 URL이라
   * MediaLibrary.saveToLibraryAsync·Sharing.shareAsync 모두 file:// 가 아니면 동작하지
   * 않는다(§7 분석 그대로). 캐시에 받아둔 뒤 두 기능이 그 파일을 같이 쓴다.
   */
  const downloadToCache = async (uri: string) => {
    const file = await File.downloadFileAsync(uri, Paths.cache, { idempotent: true });
    return file.uri;
  };

  const onSave = async () => {
    if (!current || working) return;
    setWorking('save');
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        toast.error('사진을 저장하려면 갤러리 접근 권한이 필요해요.');
        return;
      }
      const localUri = await downloadToCache(current.uri);
      await MediaLibrary.saveToLibraryAsync(localUri);
      toast.success('사진을 저장했어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 저장하지 못했어요.'));
    } finally {
      setWorking(null);
    }
  };

  const onShare = async () => {
    if (!current || working) return;
    setWorking('share');
    try {
      if (!(await Sharing.isAvailableAsync())) {
        toast.error('이 기기에서는 공유하기를 쓸 수 없어요.');
        return;
      }
      const localUri = await downloadToCache(current.uri);
      await Sharing.shareAsync(localUri);
    } catch (e) {
      toast.error(getErrorMessage(e, '공유하지 못했어요.'));
    } finally {
      setWorking(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onViewableItemsChanged={onViewableChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        />

        {/* 닫기 — 배경 탭만으로는 어포던스가 없고 스크린리더에도 노출되지 않는다 */}
        <Pressable
          style={[styles.close, { top: insets.top + spacing.sm }]}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <MaterialCommunityIcons name="close" size={26} color={colors.white} />
        </Pressable>

        {/* 저장·공유 — §7 분석(사진 다운로드 기능 부재) 대응, 우상단에 닫기와 대칭으로 둔다 */}
        <View style={[styles.actions, { top: insets.top + spacing.sm }]}>
          <Pressable
            style={styles.actionBtn}
            onPress={onShare}
            disabled={working !== null}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="공유하기"
          >
            {working === 'share' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <MaterialCommunityIcons name="share-variant" size={24} color={colors.white} />
            )}
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={onSave}
            disabled={working !== null}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="갤러리에 저장"
          >
            {working === 'save' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <MaterialCommunityIcons name="download" size={24} color={colors.white} />
            )}
          </Pressable>
        </View>

        {images.length > 1 ? (
          <View style={[styles.counter, { top: insets.top + spacing.sm }]}>
            <Text style={styles.counterText}>
              {index + 1} / {images.length}
            </Text>
          </View>
        ) : null}

        {current?.title || current?.caption ? (
          <View style={[styles.caption, { paddingBottom: insets.bottom + spacing.lg }]}>
            {current.title ? (
              <Text style={[styles.title, current.titleColor ? { color: current.titleColor } : null]}>
                {current.title}
              </Text>
            ) : null}
            {current.caption ? (
              <Text style={styles.captionText} numberOfLines={4}>
                {current.caption}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  page: { alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    left: spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 저장·공유 — 닫기와 대칭으로 우상단, 가로로 나란히
  actions: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    justifyContent: 'center',
  },
  counterText: { color: colors.white, fontSize: fontSize.body, fontWeight: '700' },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
  },
  title: { color: colors.white, fontSize: fontSize.body, fontWeight: '800', marginBottom: 2 },
  captionText: { color: colors.white, fontSize: fontSize.body, lineHeight: 21 },
}));
