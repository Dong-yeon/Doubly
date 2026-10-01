/**
 * 서버 배포 움직이는 이모티콘 말풍선 — 네이티브(2026-10-01, store/remoteStickerStore 주석).
 *
 * <p>번들 이모티콘(AnimatedSticker)과 같은 재생 규칙이다 — 한 번 재생하고 멈추고, 누르면 처음부터.
 * 다른 점은 <b>파일이 아직 기기에 없을 수 있다</b>는 것뿐이다. 받는 동안은 썸네일을 보여 준다 —
 * 빈 칸보다 정지 그림이 낫고, 크기가 같아 받은 뒤 말풍선이 출렁이지 않는다.
 *
 * <p>카탈로그에 아직 없는 코드(새 팩을 상대가 먼저 보냄)는 카탈로그 항목 없이 온다 — 같은 크기의
 * 자리만 잡아 두고 카탈로그를 다시 묻는다. 오면 스토어 구독으로 다시 그려진다.
 *
 * <p>웹은 RemoteAnimatedSticker.web.tsx — lottie-react-native 를 웹 번들에 넣지 않는다(AnimatedSticker 주석).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, type ImageStyle, type StyleProp } from 'react-native';
import LottieView, { type AnimationObject } from 'lottie-react-native';
import { CachedImage } from './CachedImage';
import { cachedRemoteLottie, loadRemoteLottie } from '../utils/remoteStickerFiles';
import { useRemoteStickerStore, type RemoteSticker } from '../store/remoteStickerStore';

interface Props {
  code: string;
  style?: StyleProp<ImageStyle>;
  onLongPress?: () => void;
  /**
   * 카탈로그를 다시 받아 봐도 모르는 코드일 때 대신 그릴 것(내린 캐릭터의 옛 코드 등).
   * 카탈로그를 한 번도 못 받은 상태(오프라인 첫 실행)에선 쓰지 않고 자리만 잡는다.
   */
  fallback?: React.ReactNode;
}

export function RemoteAnimatedSticker({ code, style, onLongPress, fallback }: Props) {
  const sticker: RemoteSticker | undefined = useRemoteStickerStore((s) => s.byCode[code]);
  const catalogKnown = useRemoteStickerStore((s) => s.version !== null);
  // 모르는 코드로 카탈로그를 다시 물어본 뒤인가 — 그래도 모르면 fallback 으로
  const [rechecked, setRechecked] = useState(false);
  const [source, setSource] = useState<AnimationObject | undefined>(() =>
    sticker ? cachedRemoteLottie(sticker.url) : undefined,
  );
  const ref = useRef<LottieView>(null);
  const url = sticker?.url;

  useEffect(() => {
    let alive = true;
    if (!url) {
      // 모르는 코드 — 새 팩일 수 있다. 짧은 간격 제한은 스토어가 건다
      void useRemoteStickerStore
        .getState()
        .refresh(true)
        .finally(() => alive && setRechecked(true));
      return () => {
        alive = false;
      };
    }
    loadRemoteLottie(url)
      .then((s) => alive && setSource(s))
      .catch(() => {
        // 못 받으면 썸네일로 남는다 — 다음에 이 말풍선이 다시 그려질 때 또 시도한다
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const replay = () => {
    ref.current?.reset();
    ref.current?.play();
  };

  if (!sticker && rechecked && catalogKnown && fallback !== undefined) return <>{fallback}</>;

  const label = sticker ? `${sticker.label} 이모티콘, 누르면 다시 움직입니다` : '이모티콘';
  return (
    <Pressable
      onPress={source ? replay : undefined}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {source ? (
        <LottieView ref={ref} source={source} style={style} autoPlay loop={false} />
      ) : sticker ? (
        <CachedImage uri={sticker.thumbUrl} style={style} />
      ) : (
        <View style={style} />
      )}
    </Pressable>
  );
}
