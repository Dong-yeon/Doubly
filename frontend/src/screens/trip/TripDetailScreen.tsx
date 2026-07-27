/** 여행 상세 — 일자별 일정표(Itinerary) + 담긴 장소 목록(지도 핀) */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { KakaoMap } from '../../components/KakaoMap';
import { tripApi } from '../../api/trip';
import { placeApi } from '../../api/place';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Place, TripDay, TripDetail, TripItem } from '../../types';
import { tripStatusLabel } from './TripListScreen';

type Props = NativeStackScreenProps<PlaceStackParamList, 'TripDetail'>;
type Tab = 'itinerary' | 'places';

const CATEGORIES = ['관광', '식사', '카페', '이동', '숙소', '기타'];

/** "HH:mm:ss" | "HH:mm" → "HH:mm" (없으면 빈 문자열) */
function shortTime(t?: string | null): string {
  return t ? t.slice(0, 5) : '';
}

interface ItemForm {
  dayNo: number;
  title: string;
  startTime: string;
  category: string | null;
  memo: string;
  placeId: number | null;
  placeName: string | null;
}

export function TripDetailScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('itinerary');
  const [selectedDay, setSelectedDay] = useState(1);

  // 장소 담기 모달 (장소 탭)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<Place[]>([]);

  // 일정 추가/수정 모달
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TripItem | null>(null);
  const [form, setForm] = useState<ItemForm>({
    dayNo: 1,
    title: '',
    startTime: '',
    category: null,
    memo: '',
    placeId: null,
    placeName: null,
  });
  // 장소 연결 모달 (일정 추가 시)
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCandidates, setLinkCandidates] = useState<Place[]>([]);

  // AI 일정 생성 모달
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPreferences, setAiPreferences] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await tripApi.detail(tripId);
      setDetail(d);
      navigation.setOptions({ title: d.trip.title });
      // 여행 기간이 줄어들면 선택 Day 를 범위 안으로 보정
      setSelectedDay((prev) => Math.min(Math.max(prev, 1), Math.max(d.days.length, 1)));
    } catch (e) {
      toast.error(getErrorMessage(e, '여행을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [tripId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const trip = detail?.trip;
  const days = detail?.days ?? [];
  const places = detail?.places ?? [];
  const currentDay: TripDay | undefined = useMemo(
    () => days.find((d) => d.dayNo === selectedDay) ?? days[0],
    [days, selectedDay],
  );
  const dayItems = currentDay?.items ?? [];
  const totalItems = days.reduce((n, d) => n + d.items.length, 0);

  // 선택한 Day 의 지도 마커 — 목록 순번(no)을 붙여 동선을 나타낸다
  const dayMarkers = dayItems
    .map((it, idx) => ({ it, no: idx + 1 }))
    .filter(({ it }) => it.lat != null && it.lng != null)
    .map(({ it, no }) => ({ id: it.id, lat: it.lat as number, lng: it.lng as number, title: `${no}. ${it.title}` }));
  // 좌표 있는 항목을 일정 순서대로 이어 동선(폴리라인)을 그린다
  const dayPath = dayItems
    .filter((it) => it.lat != null && it.lng != null)
    .map((it) => ({ lat: it.lat as number, lng: it.lng as number }));

  // ---- 장소 담기 (장소 탭) ----
  const openPicker = async () => {
    try {
      const all = await placeApi.list();
      setCandidates(all.filter((p) => p.tripId !== tripId));
      setPickerOpen(true);
    } catch (e) {
      toast.error(getErrorMessage(e, '장소를 불러오지 못했어요.'));
    }
  };

  const onAttach = async (place: Place) => {
    setPickerOpen(false);
    try {
      await tripApi.attachPlace(tripId, place.id);
      haptics.light();
      toast.success(`"${place.name}"을(를) 여행에 담았어요.`);
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    }
  };

  const onDetach = (place: Place) => {
    Alert.alert('장소 빼기', `"${place.name}"을(를) 이 여행에서 뺄까요?\n장소는 맛집 지도에 그대로 남아요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '빼기',
        onPress: async () => {
          try {
            await tripApi.detachPlace(tripId, place.id);
            haptics.light();
            toast.success('장소를 여행에서 뺐어요.');
            load();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  // ---- 일정 추가/수정 ----
  const openAdd = () => {
    setEditingItem(null);
    setForm({
      dayNo: currentDay?.dayNo ?? 1,
      title: '',
      startTime: '',
      category: null,
      memo: '',
      placeId: null,
      placeName: null,
    });
    setEditorOpen(true);
  };

  const openEdit = (item: TripItem) => {
    setEditingItem(item);
    setForm({
      dayNo: item.dayNo,
      title: item.title,
      startTime: shortTime(item.startTime),
      category: item.category ?? null,
      memo: item.memo ?? '',
      placeId: item.placeId ?? null,
      placeName: item.placeName ?? null,
    });
    setEditorOpen(true);
  };

  const openLink = async () => {
    try {
      setLinkCandidates(await placeApi.list());
      setLinkOpen(true);
    } catch (e) {
      toast.error(getErrorMessage(e, '장소를 불러오지 못했어요.'));
    }
  };

  const onLinkPlace = (place: Place) => {
    setLinkOpen(false);
    setForm((f) => ({
      ...f,
      placeId: place.id,
      placeName: place.name,
      title: f.title.trim() ? f.title : place.name,
    }));
  };

  const saveItem = async () => {
    const title = form.title.trim();
    if (!title) {
      toast.error('일정 이름을 입력해주세요.');
      return;
    }
    const startTime = form.startTime.trim();
    if (startTime && !/^\d{1,2}:\d{2}$/.test(startTime)) {
      toast.error('시간은 09:00 형식으로 입력해주세요.');
      return;
    }
    const time = startTime || null;
    try {
      if (editingItem) {
        await tripApi.updateItem(tripId, editingItem.id, {
          title,
          startTime: time,
          category: form.category,
          memo: form.memo.trim() || null,
        });
        // Day 가 바뀌면 대상 Day 맨 뒤로 이동
        if (form.dayNo !== editingItem.dayNo) {
          const target = days.find((d) => d.dayNo === form.dayNo);
          await tripApi.reorderItems(tripId, [
            { itemId: editingItem.id, dayNo: form.dayNo, sortOrder: target ? target.items.length : 0 },
          ]);
        }
        toast.success('일정을 수정했어요.');
      } else {
        await tripApi.addItem(tripId, {
          dayNo: form.dayNo,
          title,
          startTime: time,
          category: form.category,
          memo: form.memo.trim() || null,
          placeId: form.placeId,
        });
        toast.success('일정을 추가했어요.');
      }
      haptics.light();
      setEditorOpen(false);
      setSelectedDay(form.dayNo);
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    }
  };

  const deleteItem = (item: TripItem) => {
    Alert.alert('일정 삭제', `"${item.title}"을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await tripApi.removeItem(tripId, item.id);
            haptics.light();
            toast.success('일정을 삭제했어요.');
            load();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  // 하루 안에서 순서 이동 (↑/↓) — 해당 Day 전체를 0..N-1 로 재배치해 일관성 유지
  const moveItem = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= dayItems.length) return;
    const reordered = [...dayItems];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    // 낙관적 반영
    setDetail((d) =>
      d
        ? { ...d, days: d.days.map((dd) => (dd.dayNo === currentDay?.dayNo ? { ...dd, items: reordered } : dd)) }
        : d,
    );
    try {
      await tripApi.reorderItems(
        tripId,
        reordered.map((it, i) => ({ itemId: it.id, dayNo: currentDay!.dayNo, sortOrder: i })),
      );
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '순서를 바꾸지 못했어요.'));
      load();
    }
  };

  // AI 일정 생성 — 기존 일정을 대체
  const runGenerate = async () => {
    setAiLoading(true);
    try {
      await runBusy('AI가 일정을 짜고 있어요', () =>
        tripApi.generateItinerary(tripId, aiPreferences.trim() || undefined));
      haptics.light();
      toast.success('AI가 일정을 짰어요.');
      setAiOpen(false);
      setAiPreferences('');
      setSelectedDay(1);
      await load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e, 'AI 일정 생성에 실패했어요.'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {trip ? (
          <View>
            {trip.coverImageUrl ? (
              <Image source={{ uri: trip.coverImageUrl }} style={styles.cover} resizeMode="cover" />
            ) : null}
            <View style={styles.headerRow}>
              <View style={styles.statusChip}>
                <Text style={styles.statusText}>{tripStatusLabel(trip)}</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('TripForm', { trip })}>
                <Text style={styles.editLink}>수정</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.dates}>
              {trip.startDate} ~ {trip.endDate} · {days.length}일
            </Text>
            {trip.memo ? <Text style={styles.memo}>{trip.memo}</Text> : null}

            {/* 경비 · 준비물 · 앨범 · 회고 진입 (2×2) */}
            <View style={styles.entryRow}>
              <TouchableOpacity
                style={styles.entryCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('TripExpense', { tripId, title: trip.title })}
              >
                <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.entryText}>경비</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.entryCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('TripChecklist', { tripId, title: trip.title })}
              >
                <MaterialCommunityIcons name="bag-personal-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.entryText}>준비물</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.entryCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('TripAlbum', { tripId, title: trip.title })}
              >
                <MaterialCommunityIcons name="image-multiple-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.entryText}>앨범</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.entryCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('TripRecap', { tripId, title: trip.title })}
              >
                <MaterialCommunityIcons name="text-box-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.entryText}>회고</Text>
              </TouchableOpacity>
            </View>

            {/* 탭 전환 */}
            <View style={styles.tabs}>
              <TabButton label="일정" active={tab === 'itinerary'} onPress={() => setTab('itinerary')} />
              <TabButton label={`장소 ${places.length}`} active={tab === 'places'} onPress={() => setTab('places')} />
            </View>
          </View>
        ) : null}

        {/* 일정 탭 */}
        {trip && tab === 'itinerary' ? (
          <View>
            {/* AI 일정 생성 */}
            <TouchableOpacity
              style={styles.aiButton}
              activeOpacity={0.85}
              onPress={() => {
                setAiPreferences('');
                setAiOpen(true);
              }}
            >
              <MaterialCommunityIcons name="auto-fix" size={18} color={colors.accent} />
              <Text style={styles.aiButtonText}>AI로 일정 짜기</Text>
            </TouchableOpacity>

            {/* Day 선택 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayBar}>
              {days.map((d) => {
                const on = d.dayNo === currentDay?.dayNo;
                return (
                  <TouchableOpacity
                    key={d.dayNo}
                    style={[styles.dayChip, on && styles.dayChipOn]}
                    onPress={() => setSelectedDay(d.dayNo)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dayChipDay, on && styles.dayChipTextOn]}>{d.dayNo}일차</Text>
                    <Text style={[styles.dayChipDate, on && styles.dayChipTextOn]}>{d.date.slice(5)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 선택 Day 동선 지도 */}
            {isKakaoMapConfigured() && dayMarkers.length > 0 ? (
              <View style={styles.mapWrap}>
                <KakaoMap
                  markers={dayMarkers}
                  path={dayPath}
                  height={200}
                  onMarkerPress={(id) => {
                    const it = dayItems.find((i) => i.id === id);
                    if (it?.placeId) navigation.navigate('PlaceDetail', { placeId: it.placeId, name: it.placeName ?? it.title });
                  }}
                />
              </View>
            ) : null}

            {/* 일정 항목 목록 */}
            {dayItems.length === 0 ? (
              <Text style={styles.empty}>이 날의 일정이 아직 없어요.{'\n'}아래 버튼으로 일정을 추가해보세요!</Text>
            ) : (
              dayItems.map((item, idx) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemNo}>{idx + 1}</Text>
                    {shortTime(item.startTime) ? (
                      <Text style={styles.itemTime}>{shortTime(item.startTime)}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity style={styles.itemBody} activeOpacity={0.7} onPress={() => openEdit(item)}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.category ? (
                        <View style={styles.catChip}>
                          <Text style={styles.catChipText}>{item.category}</Text>
                        </View>
                      ) : null}
                    </View>
                    {item.placeName ? <Text style={styles.itemPlace}>{item.placeName}</Text> : null}
                    {item.memo ? <Text style={styles.itemMemo}>{item.memo}</Text> : null}
                  </TouchableOpacity>
                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      onPress={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      hitSlop={8}
                      style={styles.moveBtn}
                    >
                      <Text style={[styles.moveText, idx === 0 && styles.moveDisabled]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveItem(idx, 1)}
                      disabled={idx === dayItems.length - 1}
                      hitSlop={8}
                      style={styles.moveBtn}
                    >
                      <Text style={[styles.moveText, idx === dayItems.length - 1 && styles.moveDisabled]}>▼</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteItem(item)} hitSlop={8} style={styles.moveBtn}>
                      <Text style={styles.delText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            <View style={styles.addWrap}>
              <Button title="＋ 일정 추가" onPress={openAdd} />
            </View>
          </View>
        ) : null}

        {/* 장소 탭 */}
        {trip && tab === 'places' ? (
          <View>
            {isKakaoMapConfigured() && places.some((p) => p.lat != null && p.lng != null) ? (
              <View style={styles.mapWrap}>
                <KakaoMap
                  markers={places
                    .filter((p) => p.lat != null && p.lng != null)
                    .map((p) => ({ id: p.id, lat: p.lat as number, lng: p.lng as number, title: p.name }))}
                  height={200}
                  onMarkerPress={(id) => {
                    const place = places.find((p) => p.id === id);
                    if (place) navigation.navigate('PlaceDetail', { placeId: place.id, name: place.name });
                  }}
                />
              </View>
            ) : null}
            <View style={styles.placesHeader}>
              <Text style={styles.sectionTitle}>담긴 장소 ({places.length})</Text>
              <Button title="＋ 장소 담기" variant="secondary" size="md" onPress={openPicker} />
            </View>
            {places.length === 0 ? (
              <Text style={styles.empty}>아직 담긴 장소가 없어요. 맛집 지도의 장소를 담아보세요! (길게 눌러 빼기)</Text>
            ) : (
              places.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.placeCard}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
                  onLongPress={() => onDetach(item)}
                >
                  <View style={styles.placeHeader}>
                    <Text style={styles.placeName}>{item.name}</Text>
                    <Text style={styles.placeStatus}>{item.status === 'VISITED' ? '다녀옴' : '가보고파'}</Text>
                  </View>
                  {item.address ? <Text style={styles.placeAddress}>{item.address}</Text> : null}
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* 일정 추가/수정 모달 */}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditorOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editingItem ? '일정 수정' : '일정 추가'}</Text>

            {/* Day 선택 */}
            <Text style={styles.fieldLabel}>며칠차</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.formDayBar}>
              {days.map((d) => {
                const on = d.dayNo === form.dayNo;
                return (
                  <TouchableOpacity
                    key={d.dayNo}
                    style={[styles.formDayChip, on && styles.formDayChipOn]}
                    onPress={() => setForm((f) => ({ ...f, dayNo: d.dayNo }))}
                  >
                    <Text style={[styles.formDayText, on && styles.dayChipTextOn]}>{d.dayNo}일차</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>일정 이름</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 성산일출봉 등반"
              placeholderTextColor={colors.textTertiary}
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              maxLength={100}
            />

            <Text style={styles.fieldLabel}>시간 (선택)</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 09:00"
              placeholderTextColor={colors.textTertiary}
              value={form.startTime}
              onChangeText={(t) => setForm((f) => ({ ...f, startTime: t }))}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />

            <Text style={styles.fieldLabel}>종류 (선택)</Text>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => {
                const on = form.category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catSelect, on && styles.catSelectOn]}
                    onPress={() => setForm((f) => ({ ...f, category: on ? null : c }))}
                  >
                    <Text style={[styles.catSelectText, on && styles.dayChipTextOn]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>메모 (선택)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="예약 시간, 준비물 등"
              placeholderTextColor={colors.textTertiary}
              value={form.memo}
              onChangeText={(t) => setForm((f) => ({ ...f, memo: t }))}
              multiline
            />

            {/* 장소 연결 — 추가 시에만 (좌표가 있으면 지도 동선에 표시) */}
            {!editingItem ? (
              <TouchableOpacity style={styles.linkRow} onPress={openLink}>
                <Text style={styles.linkLabel}>장소 연결</Text>
                <Text style={styles.linkValue}>{form.placeName ? form.placeName : '연결 안 함 ›'}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.sheetActions}>
              <Button title="취소" variant="ghost" size="md" onPress={() => setEditorOpen(false)} />
              <Button title={editingItem ? '수정' : '추가'} size="md" onPress={saveItem} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* AI 일정 생성 모달 */}
      <Modal
        visible={aiOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!aiLoading) setAiOpen(false);
        }}
      >
        <Pressable style={styles.backdrop} onPress={() => !aiLoading && setAiOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>AI 여행 일정 생성</Text>
            <Text style={styles.aiDesc}>
              "{trip?.title}" 여행에 맞춰 {days.length}일치 일정을 AI가 짜드려요.
              {totalItems > 0 ? `\n지금 있는 일정 ${totalItems}개는 새 일정으로 대체돼요.` : ''}
            </Text>

            <Text style={styles.fieldLabel}>요청사항 (선택)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="예: 맛집 위주로 느긋하게, 실내 위주로"
              placeholderTextColor={colors.textTertiary}
              value={aiPreferences}
              onChangeText={setAiPreferences}
              editable={!aiLoading}
              maxLength={200}
              multiline
            />

            {aiLoading ? (
              <View style={styles.aiLoading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.aiLoadingText}>AI가 일정을 짜는 중이에요… (최대 1분)</Text>
              </View>
            ) : (
              <View style={styles.sheetActions}>
                <Button title="취소" variant="ghost" size="md" onPress={() => setAiOpen(false)} />
                <Button title="일정 생성" size="md" onPress={runGenerate} />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* 장소 연결 선택 모달 */}
      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setLinkOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>어떤 장소를 연결할까요?</Text>
            <FlatList
              data={linkCandidates}
              keyExtractor={(p) => String(p.id)}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.candidate} activeOpacity={0.7} onPress={() => onLinkPlace(item)}>
                  <Text style={styles.candidateName}>{item.name}</Text>
                  <Text style={styles.candidateInfo}>{item.category ?? item.address ?? ''}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>연결할 장소가 없어요. 맛집 지도에서 먼저 추가해주세요!</Text>
              }
            />
            <Button title="닫기" variant="ghost" size="md" onPress={() => setLinkOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 장소 담기 모달 (장소 탭) */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>어떤 장소를 담을까요?</Text>
            <FlatList
              data={candidates}
              keyExtractor={(p) => String(p.id)}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.candidate} activeOpacity={0.7} onPress={() => onAttach(item)}>
                  <Text style={styles.candidateName}>{item.name}</Text>
                  <Text style={styles.candidateInfo}>
                    {item.tripId != null ? '다른 여행에서 옮겨요' : item.category ?? ''}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>담을 수 있는 장소가 없어요. 맛집 지도에서 먼저 추가해주세요!</Text>
              }
            />
            <Button title="닫기" variant="ghost" size="md" onPress={() => setPickerOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabOn]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.tabText, active && styles.tabTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  cover: { width: '100%', height: 160, borderRadius: radius.lg, marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryBg,
  },
  statusText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  editLink: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  dates: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.sm },
  memo: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 21 },

  entryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  entryCard: {
    flexGrow: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  entryText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
  tabTextOn: { color: '#fff' },

  // Day 선택 바
  dayBar: { gap: spacing.sm, paddingVertical: spacing.md },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    minWidth: 64,
  },
  dayChipOn: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  dayChipDay: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  dayChipDate: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  dayChipTextOn: { color: '#fff' },

  mapWrap: { marginTop: spacing.xs, marginBottom: spacing.md, borderRadius: radius.lg, overflow: 'hidden' },

  // AI 일정 생성
  aiButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  aiButtonText: { fontSize: fontSize.body, fontWeight: '800', color: colors.accent },
  aiDesc: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.sm },
  aiLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  aiLoadingText: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '700' },

  // 일정 항목 카드
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  itemLeft: { width: 44, alignItems: 'center' },
  itemNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: fontSize.caption,
    fontWeight: '800',
    overflow: 'hidden',
  },
  itemTime: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginTop: 4 },
  itemBody: { flex: 1, paddingHorizontal: spacing.sm },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  itemTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  catChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryBg },
  catChipText: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  itemPlace: { fontSize: fontSize.caption, color: colors.secondary, marginTop: spacing.xs, fontWeight: '600' },
  itemMemo: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  itemActions: { alignItems: 'center', justifyContent: 'flex-start', gap: 2 },
  moveBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  moveText: { fontSize: 14, color: colors.textSecondary, fontWeight: '800' },
  moveDisabled: { color: colors.border },
  delText: { fontSize: 14, color: colors.danger, fontWeight: '800', marginTop: 2 },

  addWrap: { marginTop: spacing.md },

  // 장소 탭
  placesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  placeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  placeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeName: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  placeStatus: { fontSize: fontSize.body },
  placeAddress: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },

  empty: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg, lineHeight: 20 },

  // 모달
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.surfaceCard, borderRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  sheetList: { marginBottom: spacing.sm },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  candidate: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  candidateName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  candidateInfo: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },

  fieldLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  formDayBar: { flexGrow: 0 },
  formDayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  formDayChipOn: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  formDayText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textPrimary },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catSelect: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catSelectOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  catSelectText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkLabel: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  linkValue: { fontSize: fontSize.body, color: colors.secondary, fontWeight: '700' },
});
