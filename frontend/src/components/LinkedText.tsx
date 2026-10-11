/**
 * 링크가 섞인 본문 — 링크 부분만 밑줄을 긋고 탭하면 연다. 채팅 말풍선용.
 *
 * <p>글자색은 <b>바깥 style 을 그대로 쓴다</b>(밑줄·굵기만 더한다). 말풍선 배경 20종의
 * 대비가 텍스트색 기준으로 검증돼 있어서(verify-chat-theme-contrast), 링크에 다른 색을
 * 얹으면 그 검증 밖으로 나간다.
 *
 * <p>링크 Text 에 {@code onPress} 가 붙으면 그 조각이 터치를 가져가 바깥 Pressable 의
 * 길게 누르기가 안 온다 — 그래서 {@code onLongPress} 를 받아 링크 조각에도 같이 단다.
 */
import React from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { toast } from '../store/toastStore';
import { splitLinks } from '../utils/linkify';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  onLongPress?: () => void;
  numberOfLines?: number;
}

export function openLink(url: string): void {
  Linking.openURL(url).catch(() => toast.error('링크를 열 수 없어요.'));
}

export function LinkedText({ text, style, onLongPress, numberOfLines }: Props) {
  const segments = splitLinks(text);
  if (!segments.some((s) => s.url)) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((s, i) =>
        s.url ? (
          <Text
            key={i}
            style={styles.link}
            onPress={() => openLink(s.url as string)}
            onLongPress={onLongPress}
            accessibilityRole="link"
          >
            {s.text}
          </Text>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </Text>
  );
}

const styles = {
  link: { textDecorationLine: 'underline', fontWeight: '700' } as TextStyle,
};
