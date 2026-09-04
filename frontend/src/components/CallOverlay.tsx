/**
 * 통화 전역 오버레이 — PLAN.md "통화·영상통화" 참고.
 *
 * <p>`App.tsx` 최상단에 `Toast`·`UpgradeSheet`와 같은 자리로 마운트한다.
 * {@link useCallStore}의 StreamVideoClient 가 연결돼 있는 한, <b>어느 화면에 있든</b>
 * 상대가 걸어온 통화가 Stream SDK 의 {@code useCalls()}로 즉시 잡힌다 — 우리 소켓
 * (chatSocket 의 CoupleEvent)과 별개로 Stream 자체 연결이 신호를 전달하기 때문에
 * 화면별 구독 없이도 전역에서 동작한다.
 *
 * <p>화면(영상 렌더링·음소거/스피커/카메라 컨트롤)은 Stream 의 검증된 UI 컴포넌트
 * (`RingingCallContent`)를 그대로 쓰고, accept/reject/hangup 콜백에서만 우리 백엔드
 * (`call_sessions`)를 동기화한다 — 콜백은 SDK 가 자체 처리(수락/거절/종료)를 <b>마친 뒤</b>
 * 호출되므로, 우리 쪽은 상태 동기화만 책임진다(실패해도 통화 자체는 계속된다 — 통화
 * 기록·부재중 알림 같은 부가 기능만 어긋날 뿐).
 */
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { RootOverlayModal } from './RootOverlayModal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Call,
  CallContent,
  IncomingCall,
  OutgoingCall,
  RingingCallContent,
  StreamCall,
  StreamVideo,
  useCalls,
} from '@stream-io/video-react-native-sdk';
import { useCallStore } from '../store/callStore';
import { callApi } from '../api/call';

function CallSurface({ call }: { call: Call }) {
  // SDK 가 accept/reject/hangup 을 이미 처리한 뒤 불리는 콜백이다(err 가 있으면 SDK 쪽에서
  // 실패한 것이므로 우리 백엔드는 건드리지 않는다 — 통화가 실제로 시작/종료되지 않았다).
  const onAccept = useCallback((err?: Error) => {
    if (err) return;
    callApi.accept(call.id).catch(() => undefined);
  }, [call.id]);

  const onReject = useCallback((err?: Error) => {
    if (err) return;
    callApi.decline(call.id).catch(() => undefined);
  }, [call.id]);

  // 발신자의 응답 대기 취소(OutgoingCall)와 통화 중 종료(CallContent) 모두 같은 처리다 —
  // 백엔드 end() 가 RINGING 이었으면 MISSED, ONGOING 이었으면 ENDED 로 알아서 나눈다.
  const onHangup = useCallback((err?: Error) => {
    if (err) return;
    callApi.end(call.id).catch(() => undefined);
  }, [call.id]);

  return (
    <RingingCallContent
      IncomingCall={(props) => (
        <IncomingCall {...props} onAcceptCallHandler={onAccept} onRejectCallHandler={onReject} />
      )}
      OutgoingCall={(props) => <OutgoingCall {...props} onHangupCallHandler={onHangup} />}
      CallContent={(props) => <CallContent {...props} onHangupCallHandler={onHangup} />}
    />
  );
}

function CallOverlayInner() {
  // 클라이언트가 아는 모든 콜(수신 벨 포함) — 상대가 걸면 별도 구독 없이 여기 잡힌다.
  const calls = useCalls();
  const call = calls[0] ?? null;
  if (!call) return null;

  return (
    <RootOverlayModal visible transparent={false} animationType="slide" onRequestClose={() => undefined}>
      {/* Modal(또는 iOS 의 FullWindowOverlay)은 별도 네이티브 창이라 바깥의
          GestureHandlerRootView 컨텍스트가 안 이어진다 — Stream 컨텐츠(참가자 뷰
          드래그 등)가 제스처를 쓰므로 여기서 다시 감싼다. */}
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.flex}>
          <StreamCall call={call}>
            <CallSurface call={call} />
          </StreamCall>
        </View>
      </GestureHandlerRootView>
    </RootOverlayModal>
  );
}

export function CallOverlay() {
  const client = useCallStore((s) => s.client);
  if (!client) return null;
  return (
    <StreamVideo client={client}>
      <CallOverlayInner />
    </StreamVideo>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
});
