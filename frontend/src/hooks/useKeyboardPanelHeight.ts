/**
 * 이모티콘·보조 도구 패널의 높이 — <b>키보드와 같은 높이</b>로 맞추기 위한 값.
 *
 * <p><b>왜 필요한가</b>: 카톡 기준에서 이모티콘 패널은 "키보드가 있던 자리를 그대로
 * 이어받는" 물건이다. 높이가 다르면 키보드 ↔ 패널을 오갈 때마다 입력바가 위아래로
 * 튀고, 패널 안 탭(이모지·이모티콘·우리 이모지)을 바꿀 때도 높이가 달라져 화면이
 * 흔들린다. 2026-09-11 이전에는 `maxHeight: 220` 고정이라 실제 키보드(기기마다
 * 260~320)보다 늘 작았다.
 *
 * <p><b>왜 {@link useAndroidKeyboardHeight} 를 못 쓰나</b>: 그 훅은 "지금 키보드가
 * 차지한 높이"라서 키보드가 내려가면 0 이 된다(패딩 계산이 목적이라 그게 맞다).
 * 그런데 패널은 <b>키보드를 내리고</b> 여는 것이라, 여는 순간 그 값이 0 이 되어
 * 높이를 알 수 없다. 그래서 "마지막으로 본 키보드 높이"를 따로 기억한다.
 * 그 훅은 5개 화면이 공유하므로 의미를 바꾸지 않고 이 훅을 새로 둔다.
 *
 * <p>캐시가 모듈 스코프인 이유는 화면을 나갔다 들어와도 첫 패널이 튀지 않게 하기
 * 위해서다. 앱을 껐다 켜면 다시 기본값에서 시작하지만, 채팅방에서 입력창을 한 번만
 * 누르면(대개 그렇다) 실측값으로 교체된다.
 *
 * <p>안드로이드 전용이 아니다 — iOS 도 같은 규칙으로 동작해야 한다.
 */
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** 앱 생명주기 동안 유지되는 마지막 키보드 높이 */
let lastKeyboardHeight = 0;

/**
 * 키보드를 아직 한 번도 안 띄운 상태의 기본값. 안드로이드 기본 키보드가 대체로
 * 이 근처이고, 예전 고정값(220)보다 실제에 가깝다.
 */
const FALLBACK_HEIGHT = 280;

export function useKeyboardPanelHeight(): number {
  const [height, setHeight] = useState(lastKeyboardHeight || FALLBACK_HEIGHT);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates?.height ?? 0;
      // 0 은 무시한다 — 하드웨어 키보드 연결 등으로 높이 없이 이벤트만 오는 경우가 있다
      if (h > 0) {
        lastKeyboardHeight = h;
        setHeight(h);
      }
    });
    return () => onShow.remove();
  }, []);

  return height;
}
