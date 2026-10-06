/**
 * 장소 상세 "메뉴" — 우리가 쌓는 메뉴(V131). 메뉴판을 찍으면 AI 가 이름·가격을 읽고, 확인·수정해서 장소 메뉴로 남긴다.
 * 설계: docs/LOVELICHELIN_PLACE_MENU_2026-10-06.md.
 *
 * <p><b>왜 직접 쌓나</b>: 카카오·네이버 모두 메뉴 공개 API 가 없다. [메뉴·정보 보기](앱 안 브라우저)로 남의 페이지를 볼 수는
 * 있지만 그건 매번 찾아 들어가야 한다. 한 번 찍어 두면 다음에 "뭐 먹었더라·얼마였더라"가 이 화면에서 끝난다.
 *
 * <p>AI 가 읽은 결과는 <b>바로 저장하지 않는다</b> — 메뉴판 글씨는 잘못 읽히기 쉽다. 편집 시트에 펼쳐 사람이 고친 목록만 남긴다.
 * 두 번째 장(메뉴판 뒷면 등)을 찍으면 기존 목록 뒤에 새 메뉴만 붙고, 같은 이름은 새로 읽은 가격으로 바뀐다.
 *
 * <p>"먹어 봤어요 N번"은 "여기서 먹은 것"(이 장소 방문에 붙은 식단)과 이름이 같은 메뉴에 붙는다 — 공백·대소문자만 무시한다.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Image, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { ImageViewer } from '../../components/ImageViewer';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { placeApi } from '../../api/place';
import { uploadApi } from '../../api/upload';
import { pickImageAsset, shrinkImage, takePhotoAsset, uploadImage } from '../../utils/imageUpload';
import { confirmDiscard } from '../../utils/discardGuard';
import { formatNumber } from '../../utils/format';
import { getErrorMessage } from '../../utils/error';
import { runBusy } from '../../store/busyStore';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { PlaceMenu, PlaceMenuBoardItem } from '../../types';

/** 접힌 상태에서 보여 주는 메뉴 수 — 나머지는 "모두 보기" */
const COLLAPSED_COUNT = 6;
/** 메뉴판 글씨는 작다 — 식단 사진(1024)보다 크게 줄인다 */
const MENU_PHOTO_MAX_SIDE = 1600;
/** 서버 상한(MenuBoardService.MAX_ITEMS)과 같다 */
const MAX_ITEMS = 80;

/** 같은 메뉴인지 — 서버 MenuBoardService.key 와 같은 규칙(공백·대소문자 무시) */
export function menuKey(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

export function formatPrice(price: number | null | undefined): string {
  return price == null ? '' : `${formatNumber(price)}원`;
}

interface Row {
  key: string;
  name: string;
  /** 입력칸 그대로 — 숫자만 남겨 저장한다 */
  price: string;
  /** 이번에 AI 가 새로 읽었거나 가격을 바꾼 줄 — 눈으로 확인하라고 표시한다 */
  fresh: boolean;
}

interface Editor {
  rows: Row[];
  /** 이번에 찍어 올린 메뉴판(저장하면 메뉴판 사진으로 붙는다) */
  photoUrl?: string;
  photoUri?: string;
  /** 처음 펼친 모양 — 고친 게 없으면 닫을 때 묻지 않는다 */
  initial: string;
}

let rowSeq = 0;
const newRowKey = () => `r${Date.now().toString(36)}-${rowSeq++}`;
const toRow = (name: string, price: number | null, fresh: boolean): Row => ({
  key: newRowKey(),
  name,
  price: price == null ? '' : String(price),
  fresh,
});
const snapshot = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.name.trim(), r.price.trim()]));
const parsePrice = (text: string): number | null => {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n <= 10_000_000 ? n : null;
};

/**
 * 지금 메뉴 + 새로 읽은 메뉴 — 이미 있는 이름은 새 가격으로(읽힌 경우만), 없는 이름은 뒤에 붙인다.
 * 메뉴판을 여러 장 찍는 흐름(앞면·뒷면)과 "가격이 올랐다"를 한 번에 받는다.
 */
function mergeRows(board: PlaceMenuBoardItem[], read: { name: string; price: number | null }[]): Row[] {
  const rows = board.map((b) => toRow(b.name, b.price, false));
  const index = new Map(rows.map((r, i) => [menuKey(r.name), i]));
  for (const item of read) {
    const at = index.get(menuKey(item.name));
    if (at != null) {
      const row = rows[at];
      if (item.price != null && String(item.price) !== row.price) {
        rows[at] = { ...row, price: String(item.price), fresh: true };
      }
      continue;
    }
    index.set(menuKey(item.name), rows.length);
    rows.push(toRow(item.name, item.price, true));
  }
  return rows.slice(0, MAX_ITEMS);
}

interface Props {
  placeId: number;
  menu: PlaceMenu | null;
  onMenuChange: (menu: PlaceMenu) => void;
}

export function PlaceMenuBoardSection({ placeId, menu, onMenuChange }: Props) {
  const board = useMemo(() => menu?.board ?? [], [menu]);
  const photos = useMemo(() => menu?.boardPhotos ?? [], [menu]);
  const [expanded, setExpanded] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  // 진행 중 촬영·분석 — 두 번 눌러 사진이 두 장 올라가지 않게
  const capturing = useRef(false);

  // "여기서 먹은 것"과 이름이 같은 메뉴 → 먹은 횟수
  const eaten = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of menu?.items ?? []) m.set(menuKey(item.name), item.times);
    return m;
  }, [menu]);

  const openEditor = (rows: Row[], photo?: { url: string; uri: string }) => {
    const list = rows.length > 0 ? rows : [toRow('', null, false)];
    setEditor({ rows: list, photoUrl: photo?.url, photoUri: photo?.uri, initial: snapshot(list) });
  };

  const captureFrom = async (source: 'camera' | 'gallery') => {
    if (capturing.current) return;
    capturing.current = true;
    let url: string | null = null;
    try {
      const picked = source === 'camera' ? await takePhotoAsset() : await pickImageAsset();
      if (!picked) return;
      const uri = await shrinkImage(picked, MENU_PHOTO_MAX_SIDE);
      // 식단 사진 서명 — 커플 공용 사진 한도(월)를 메뉴판이 먹지 않게(docs/first-experience-audit.md #10)
      const uploaded = await runBusy('메뉴판 올리는 중…', () => uploadImage(uri, { purpose: 'meal' }));
      url = uploaded;
      const read = await runBusy('AI가 메뉴판을 읽고 있어요…', () => placeApi.analyzeMenuBoard(placeId, uploaded));
      if (!read.isMenu) {
        // 메뉴판으로 못 읽었다 — 사진은 남기지 않는다. 직접 적는 길은 열어 둔다
        uploadApi.discard(uploaded);
        url = null;
        Alert.alert('메뉴를 읽지 못했어요', '메뉴판이 화면에 꽉 차게, 글씨가 흔들리지 않게 다시 찍어 주세요.', [
          { text: '닫기', style: 'cancel' },
          { text: '직접 적기', onPress: () => openEditor(board.map((b) => toRow(b.name, b.price, false))) },
        ]);
        return;
      }
      haptics.success();
      openEditor(mergeRows(board, read.items), { url: uploaded, uri });
    } catch (e) {
      // 분석이 실패하면 올린 사진은 어디에도 안 쓰인다 — 치운다(서버가 "막 올렸고 아무도 안 쓰는 것"만 지운다)
      if (url) uploadApi.discard(url);
      toast.error(getErrorMessage(e, '메뉴판을 읽지 못했어요.'));
    } finally {
      capturing.current = false;
    }
  };

  const onCapture = () => {
    // 웹은 카메라 촬영이 어색하다 — 파일 선택만(식단 기록과 같은 판단)
    if (Platform.OS === 'web') {
      void captureFrom('gallery');
      return;
    }
    Alert.alert('메뉴판 찍기', 'AI가 메뉴 이름과 가격을 읽어요. 저장 전에 고칠 수 있어요.', [
      { text: '카메라 촬영', onPress: () => void captureFrom('camera') },
      { text: '갤러리에서 선택', onPress: () => void captureFrom('gallery') },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const closeEditor = () => {
    if (!editor) return;
    const dirty = editor.photoUrl != null || snapshot(editor.rows) !== editor.initial;
    confirmDiscard(dirty, () => {
      if (editor.photoUrl) uploadApi.discard(editor.photoUrl);
      setEditor(null);
    });
  };

  const updateRow = (key: string, patch: Partial<Row>) =>
    setEditor((e) => (e ? { ...e, rows: e.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : e));
  const removeRow = (key: string) =>
    setEditor((e) => (e ? { ...e, rows: e.rows.filter((r) => r.key !== key) } : e));
  const addRow = () =>
    setEditor((e) => (e && e.rows.length < MAX_ITEMS ? { ...e, rows: [...e.rows, toRow('', null, false)] } : e));

  const onSave = async () => {
    if (!editor) return;
    const items = editor.rows
      .map((r) => ({ name: r.name.trim(), price: parsePrice(r.price) }))
      .filter((r) => r.name.length > 0);
    setSaving(true);
    try {
      const res = await placeApi.saveMenuBoard(placeId, { items, photoUrl: editor.photoUrl });
      onMenuChange(res);
      setEditor(null);
      haptics.success();
      toast.success(items.length > 0 ? `메뉴 ${items.length}개를 남겼어요.` : '메뉴를 비웠어요.');
    } catch (e) {
      // 시트는 그대로 둔다 — 같은 목록으로 다시 누르면 된다(서버는 통째로 바꾸기라 두 번 저장돼도 같다)
      toast.error(getErrorMessage(e, '메뉴를 저장하지 못했어요.'));
    } finally {
      setSaving(false);
    }
  };

  const onDeletePhoto = (photoId: number) => {
    Alert.alert('메뉴판 사진 지우기', '이 사진을 지울까요? 저장한 메뉴는 그대로 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          try {
            onMenuChange(await placeApi.removeMenuBoardPhoto(placeId, photoId));
            setViewingIndex(null);
            toast.success('메뉴판 사진을 지웠어요.');
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const shown = expanded ? board : board.slice(0, COLLAPSED_COUNT);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>메뉴</Text>
        {board.length > 0 ? (
          <Button
            title="고치기"
            variant="ghost"
            size="sm"
            accessibilityLabel="메뉴 고치기"
            onPress={() => openEditor(board.map((b) => toRow(b.name, b.price, false)))}
          />
        ) : null}
      </View>

      {board.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>메뉴판을 찍어 두면 다음에 고를 때 편해요. AI가 메뉴와 가격을 읽어 드려요.</Text>
          <View style={styles.emptyActions}>
            <Button
              title="메뉴판 찍기"
              size="sm"
              variant="secondary"
              leftIcon={<MaterialCommunityIcons name="camera-outline" size={16} color={colors.textPrimary} />}
              onPress={onCapture}
            />
            <Button title="직접 적기" size="sm" variant="ghost" onPress={() => openEditor([])} />
          </View>
        </View>
      ) : (
        <>
          {shown.map((item) => {
            const times = eaten.get(menuKey(item.name));
            return (
              <View key={item.id} style={styles.menuRow}>
                <View style={styles.menuNameWrap}>
                  <Text style={styles.menuName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {times ? (
                    <View style={styles.eatenChip}>
                      <Text style={styles.eatenText}>먹어 봤어요{times > 1 ? ` · ${times}번` : ''}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
              </View>
            );
          })}
          {board.length > COLLAPSED_COUNT ? (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
            >
              <Text style={styles.moreText}>{expanded ? '접기' : `메뉴 ${board.length}개 모두 보기`}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setViewingIndex(i)}
                onLongPress={() => onDeletePhoto(p.id)}
                accessibilityRole="button"
                accessibilityLabel={`메뉴판 사진 ${i + 1} 크게 보기`}
                accessibilityHint="길게 눌러 지우기"
              >
                <Image source={{ uri: p.imageUrl }} style={styles.photoThumb} resizeMode="cover" />
              </TouchableOpacity>
            ))}
            <Button
              title={photos.length > 0 ? '메뉴판 더 찍기' : '메뉴판 찍기'}
              size="sm"
              variant="secondary"
              leftIcon={<MaterialCommunityIcons name="camera-outline" size={16} color={colors.textPrimary} />}
              onPress={onCapture}
            />
          </View>
        </>
      )}

      <ImageViewer
        images={photos.map((p, i) => ({
          key: String(p.id),
          uri: p.imageUrl,
          title: `메뉴판 ${i + 1}/${photos.length}`,
          // 뷰어에서 바로 지운다 — 썸네일 길게 누르기를 모르는 사람도 찾을 수 있게
          action: { label: '이 사진 지우기', icon: 'delete-outline', onPress: () => onDeletePhoto(p.id) },
        }))}
        initialIndex={viewingIndex}
        onClose={() => setViewingIndex(null)}
      />

      <Sheet visible={editor != null} onClose={closeEditor} position="bottom" cardStyle={styles.sheetCard}>
        {editor ? (
          <>
            <Text style={styles.sheetTitle}>메뉴 확인</Text>
            <Text style={styles.sheetHint}>
              {editor.photoUrl
                ? 'AI가 읽은 메뉴예요. 틀린 이름·가격을 고쳐 주세요. 새로 읽은 줄은 색으로 표시했어요.'
                : '이름과 가격을 적어 주세요. 가격은 몰라도 괜찮아요.'}
            </Text>
            {editor.photoUri ? <Image source={{ uri: editor.photoUri }} style={styles.sheetPhoto} resizeMode="cover" /> : null}
            <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
              {editor.rows.map((row) => (
                <View key={row.key} style={[styles.editRow, row.fresh && styles.editRowFresh]}>
                  <TextInput
                    style={[styles.input, styles.inputName]}
                    value={row.name}
                    onChangeText={(name) => updateRow(row.key, { name })}
                    placeholder="메뉴 이름"
                    placeholderTextColor={colors.textSecondary}
                    maxLength={100}
                    accessibilityLabel="메뉴 이름"
                  />
                  <TextInput
                    style={[styles.input, styles.inputPrice]}
                    value={row.price}
                    onChangeText={(price) => updateRow(row.key, { price: price.replace(/[^0-9]/g, '') })}
                    placeholder="가격"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="number-pad"
                    maxLength={8}
                    accessibilityLabel={`${row.name || '메뉴'} 가격(원)`}
                  />
                  <IconButton icon="close" label={`${row.name || '이 줄'} 지우기`} size={18} onPress={() => removeRow(row.key)} />
                </View>
              ))}
              {editor.rows.length < MAX_ITEMS ? (
                <Button title="+ 메뉴 추가" variant="ghost" size="sm" onPress={addRow} style={styles.addRowBtn} />
              ) : null}
            </ScrollView>
            <View style={styles.sheetActions}>
              <Button title="취소" variant="ghost" size="md" onPress={closeEditor} style={styles.flex} />
              <Button title="저장" size="md" onPress={onSave} loading={saving} style={styles.flex} />
            </View>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  flex: { flex: 1 },
  section: { marginTop: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyText: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  emptyActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // 네이버 지도 메뉴 탭처럼 — 이름 왼쪽, 가격 오른쪽, 구분선
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  menuName: { flexShrink: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  menuPrice: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  eatenChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.togetherBg,
  },
  eatenText: { fontSize: fontSize.micro, fontWeight: '700', color: colors.togetherText },
  moreBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  photoThumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  sheetCard: { maxHeight: '88%' },
  sheetTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  sheetHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  sheetPhoto: { width: '100%', height: 96, borderRadius: radius.md, marginBottom: spacing.sm },
  sheetList: { flexGrow: 0 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  editRowFresh: { backgroundColor: colors.togetherBg },
  input: {
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    fontSize: fontSize.body,
  },
  inputName: { flex: 1 },
  inputPrice: { width: 96, textAlign: 'right' },
  addRowBtn: { alignSelf: 'flex-start', marginTop: spacing.xs },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
}));
