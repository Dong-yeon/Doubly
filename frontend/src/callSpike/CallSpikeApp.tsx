/**
 * 통화 벨/웨이크업 스파이크 — 독립 루트 컴포넌트.
 *
 * <p>메인 앱(App.tsx/AppNavigator)에 전혀 연결되지 않는다 — index.ts 가
 * {@code EXPO_PUBLIC_CALL_SPIKE=1} 일 때만 이걸 부팅한다. 검증할 것은 딱 하나:
 * <b>상대 폰 앱을 강제 종료해도 벨이 울리는가</b>. UI는 그 목적에 필요한 만큼만 있다
 * (로그인 → 상대 userId 입력 → 걸기/받기). PLAN.md "통화·영상통화" 참고.
 *
 * <p>기존 Doubly 로그인(authApi)을 그대로 쓴다 — Stream user_id 로 Doubly userId 를
 * 재사용하므로, 커플 두 사람 계정으로 로그인하면 그대로 서로에게 걸 수 있다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Call,
  CallContent,
  CallingState,
  RingingCallContent,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCalls,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';
import { authApi } from '../api/auth';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../constants/config';
import { callSpikeApi } from './api';
import { saveStreamToken } from './tokenCache';

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await authApi.login(email.trim(), password);
      await storage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
      await storage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.center}>
      <Text style={styles.title}>통화 스파이크 — 로그인</Text>
      <Text style={styles.desc}>기존 Doubly 계정으로 로그인하세요(커플 두 사람 각각).</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="이메일"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="비밀번호"
        secureTextEntry
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator /> : <Button title="로그인" onPress={onSubmit} disabled={!email || !password} />}
    </View>
  );
}

function Dialer({
  client,
  myUserId,
  onCall,
}: {
  client: StreamVideoClient;
  myUserId: string;
  onCall: (call: Call) => void;
}) {
  const [peerId, setPeerId] = useState('');
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPressCall = async () => {
    if (!client || !peerId.trim()) return;
    setCalling(true);
    setError(null);
    try {
      // 콜 id — 스파이크라 두 사람+시각으로만 충돌을 피한다(운영용 규칙 아님)
      const callId = `spike-${myUserId}-${peerId.trim()}-${Date.now()}`;
      const call = client.call('default', callId);
      await call.getOrCreate({
        ring: true,
        data: { members: [{ user_id: myUserId }, { user_id: peerId.trim() }] },
      });
      onCall(call);
    } catch (e) {
      setError(e instanceof Error ? e.message : '통화 생성 실패');
    } finally {
      setCalling(false);
    }
  };

  return (
    <View style={styles.center}>
      <Text style={styles.title}>내 Stream userId</Text>
      <Text style={styles.myId} selectable>
        {myUserId}
      </Text>
      <Text style={styles.desc}>이 값을 상대 기기에 알려주세요(반대로도).</Text>
      <TextInput
        style={styles.input}
        value={peerId}
        onChangeText={setPeerId}
        placeholder="상대 userId"
        autoCapitalize="none"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {calling ? <ActivityIndicator /> : <Button title="전화 걸기" onPress={onPressCall} disabled={!peerId.trim()} />}
      <Text style={styles.hint}>
        다음 검증: 상대 기기에서 앱을 최근 앱 목록에서 완전히 지운 뒤 걸어보세요.
      </Text>
    </View>
  );
}

function CallUI({ call, onLeave }: { call: Call; onLeave: () => void }) {
  return (
    <StreamCall call={call}>
      <CallStateView onLeave={onLeave} />
    </StreamCall>
  );
}

function CallStateView({ onLeave }: { onLeave: () => void }) {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  if (callingState === CallingState.RINGING) {
    return <RingingCallContent />;
  }
  return <CallContent onHangupCallHandler={onLeave} />;
}

function Home({ client, myUserId }: { client: StreamVideoClient; myUserId: string }) {
  // useCalls() 는 클라이언트가 아는 모든 콜(수신 벨 포함)을 반환한다 —
  // 상대가 걸어오면 여기 자동으로 잡힌다(별도 알림 리스너를 안 붙여도 됨)
  const knownCalls = useCalls();
  const [outgoingCall, setOutgoingCall] = useState<Call | null>(null);
  const activeCall = outgoingCall ?? knownCalls[0] ?? null;

  const onLeave = useCallback(() => {
    activeCall?.leave().catch(() => undefined);
    setOutgoingCall(null);
  }, [activeCall]);

  if (activeCall) {
    return <CallUI call={activeCall} onLeave={onLeave} />;
  }
  return <Dialer client={client} myUserId={myUserId} onCall={setOutgoingCall} />;
}

export function CallSpikeApp() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); // null = 확인 중
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkLogin = useCallback(async () => {
    const token = await storage.getItem(STORAGE_KEYS.accessToken);
    setLoggedIn(!!token);
  }, []);

  useEffect(() => {
    checkLogin();
  }, [checkLogin]);

  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      try {
        const data = await callSpikeApi.streamToken();
        await saveStreamToken(data);
        const c = StreamVideoClient.getOrCreateInstance({
          apiKey: data.apiKey,
          user: { id: data.userId },
          token: data.token,
        });
        setClient(c);
        setMyUserId(data.userId);
      } catch (e) {
        setError(e instanceof Error ? e.message : '토큰 발급 실패 — STREAM_API_KEY/SECRET 설정을 확인하세요.');
      }
    })();
  }, [loggedIn]);

  if (loggedIn === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={styles.center} />
      </SafeAreaView>
    );
  }

  if (!loggedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        <LoginForm onLoggedIn={() => setLoggedIn(true)} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!client || !myUserId) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={styles.center} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StreamVideo client={client}>
        <Home client={client} myUserId={myUserId} />
      </StreamVideo>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  desc: { color: '#aaa', fontSize: 13, textAlign: 'center' },
  myId: { color: '#7CFC98', fontSize: 16, fontWeight: '700' },
  hint: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 24 },
  error: { color: '#ff6b6b', fontSize: 13, textAlign: 'center' },
  input: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1c1c1e',
    color: '#fff',
    paddingHorizontal: 12,
  },
});
