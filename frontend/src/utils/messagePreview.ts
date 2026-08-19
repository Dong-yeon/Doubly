/**
 * 채팅 메시지 한 줄 미리보기 — 방 목록 lastMessage / 답장·수정 배너 공용.
 *
 * 백엔드 ChatService.preview()(알림·답장 인용용)와 같은 규칙을 프론트에서 쓴다.
 * 특히 TOUCH 는 content 가 'HAND_HOLD' 같은 제스처 코드라 그대로 보여주면 안 되고
 * 라벨('손잡기')로 바꿔야 한다.
 */
import type { MessageType } from '../types';
import { touchGestureOf } from '../constants/touchGestures';

export function messagePreview(type: MessageType, content?: string | null): string {
  switch (type) {
    case 'IMAGE':
      return '사진';
    // 스티커는 이모지 자체가 가장 좋은 미리보기다
    case 'STICKER':
      return content ?? '스티커';
    case 'WORKOUT_CARD':
      return '운동 기록';
    case 'MEAL_CARD':
      return '식단';
    case 'ROUTINE_CARD':
      return '루틴';
    case 'TOUCH':
      return touchGestureOf(content)?.label ?? '터치';
    default:
      return content ?? '';
  }
}
