/**
 * 구글 로그인 버튼 — expo-auth-session 의 Google provider 사용.
 *
 * 별도 컴포넌트인 이유: useIdTokenAuthRequest 는 훅이라 조건부로 부를 수 없다.
 * 미설정 환경에서는 이 컴포넌트 자체를 렌더하지 않는 것으로 비활성화한다
 * (LoginScreen 이 isGoogleLoginConfigured() 로 판단).
 */
import React, { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Button } from './Button';
import { GOOGLE_AUTH } from '../constants/config';
import { useAuthStore } from '../store/authStore';
import { getErrorMessage } from '../utils/error';

// 브라우저에서 돌아왔을 때 인증 세션을 마무리한다 (모듈 로드 시 1회)
WebBrowser.maybeCompleteAuthSession();

export function GoogleLoginButton({ onError }: { onError: (message: string) => void }) {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_AUTH.webClientId,
    androidClientId: GOOGLE_AUTH.androidClientId || undefined,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params.id_token;
      if (!idToken) {
        onError('구글 인증 응답에 토큰이 없어요. 다시 시도해주세요.');
        return;
      }
      setLoading(true);
      loginWithGoogle(idToken)
        .catch((e) => onError(getErrorMessage(e, '구글 로그인에 실패했어요.')))
        .finally(() => setLoading(false));
    } else if (response.type === 'error') {
      onError('구글 로그인에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
    // dismiss/cancel 은 사용자가 닫은 것 — 오류 아님
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return (
    <Button
      title="Google 로 계속하기"
      variant="secondary"
      onPress={() => promptAsync()}
      disabled={!request || loading}
      loading={loading}
    />
  );
}
