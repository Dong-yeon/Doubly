/** 채팅방 목록 — 미니멀·발랄. 설계서 2.5 / 4.5 CHAT-01
 *  커플 채팅방이 있으면 방 선택 없이 바로 대화로 진입한다(커플 앱 특성상 상대는 한 명).
 *  여러 방(트레이너-회원 등)이 있을 때만 목록을 보여준다. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { Avatar } from '../../components/Avatar';
import { EmptyState } from '../../components/EmptyState';
import { useChatStore } from '../../store/chatStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { ChatRoom } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { messagePreview } from '../../utils/messagePreview';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatRooms'>;

export function ChatScreen({ navigation }: Props) {
  const { rooms, loadingRooms, loadRooms } = useChatStore();
  const enteredRef = useRef(false);
  const [loadError, setLoadError] = useState(false);

  // loadRooms(스토어)는 실패해도 rooms 를 비우지 않는다 — "진짜 빈 목록"과 구분은
  // 이 화면의 loadError 로 한다
  const load = useCallback(async () => {
    setLoadError(false);
    try {
      await loadRooms();
    } catch (e) {
      toast.error(getErrorMessage(e, '채팅방을 불러오지 못했어요.'));
      setLoadError(true);
    }
  }, [loadRooms]);

  useFocusEffect(
    useCallback(() => {
      enteredRef.current = false;
      load();
    }, [load]),
  );

  // 커플 채팅방 — 있으면 방 선택 없이 바로 대화로 진입 (replace 라 뒤로가기 루프 없음)
  const coupleRoom = rooms.find((r) => r.relationType === 'COUPLE');
  useEffect(() => {
    if (coupleRoom && !enteredRef.current) {
      enteredRef.current = true;
      navigation.replace('ChatRoom', {
        relationId: coupleRoom.relationId,
        title: coupleRoom.partner?.name ?? '채팅',
      });
    }
  }, [coupleRoom, navigation]);

  // 커플 방으로 진입 중이거나 최초 로딩 중이면 스피너 (목록 깜빡임 방지)
  if (coupleRoom || (loadingRooms && rooms.length === 0)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const renderRoom = ({ item }: { item: ChatRoom }) => (
    <Pressable
      style={({ pressed }) => [styles.room, pressed && styles.pressed]}
      onPress={() => navigation.navigate('ChatRoom', { relationId: item.relationId, title: item.partner?.name ?? '채팅' })}
    >
      <Avatar name={item.partner?.name} imageUrl={item.partner?.profileImageUrl} size={52} />
      <View style={styles.roomBody}>
        <Text style={styles.partnerName}>{item.partner?.name ?? '채팅방'}</Text>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.lastMessage ? messagePreview(item.lastMessage.messageType, item.lastMessage.content) : '대화를 시작해보세요 '}
        </Text>
      </View>
      {item.unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>채팅</Text>
      <FlatList
        data={rooms}
        keyExtractor={(r) => String(r.relationId)}
        renderItem={renderRoom}
        contentContainerStyle={styles.list}
        refreshing={loadingRooms}
        onRefresh={load}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          !loadingRooms ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="채팅방을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={load}
              />
            ) : (
              <EmptyState icon="chat-outline" title="아직 채팅방이 없어요" description="커플을 연결하면 채팅을 시작할 수 있어요 " />
            )
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, letterSpacing: -0.5 },
  // 좌우 여백을 title 과 맞춘다(24) — 행 자체는 세로 패딩만 갖고, 좌우는 list 가 담당해
  // 아바타가 "채팅" 제목과 같은 세로선에서 시작한다(예전엔 16+16=32 로 8px 밀려 있었다)
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, flexGrow: 1 },
  room: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.lg },
  pressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.99 }] },
  roomBody: { flex: 1, marginLeft: spacing.md },
  partnerName: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  lastMessage: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: 3 },
  badge: { minWidth: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  badgeText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '800' },
  sep: { height: spacing.xs },
}));
