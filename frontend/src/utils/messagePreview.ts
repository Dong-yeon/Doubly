/**
 * 채팅 메시지 한 줄 미리보기 — 방 목록 lastMessage / 답장·수정 배너 공용.
 *
 * 백엔드 ChatService.preview()(알림·답장 인용용)와 같은 규칙을 프론트에서 쓴다.
 * 특히 TOUCH 는 content 가 'HAND_HOLD' 같은 제스처 코드라 그대로 보여주면 안 되고
 * 라벨('손잡기')로 바꿔야 한다.
 */
import type { MessageType } from '../types';
import { touchGestureOf } from '../constants/touchGestures';
import { animatedStickerOf } from '../constants/animatedStickers';
import { stickerImageOf } from '../constants/stickerImages';
import { callCardLabel, parseCallCard } from './callCard';
import { formatVoiceDuration, parseVoiceContent } from './chatVoice';

export function messagePreview(type: MessageType, content?: string | null): string {
  switch (type) {
    case 'IMAGE':
      return '사진';
    // 이모지 스티커는 이모지 자체가 가장 좋은 미리보기다. 이미지 스티커는 content 가
    // 'LOVE_BEAR' 같은 코드라 라벨로 바꿔야 한다(TOUCH 와 같은 이유).
    case 'STICKER':
      return (
        animatedStickerOf(content)?.label ?? stickerImageOf(content)?.label ?? content ?? '스티커'
      );
    case 'WORKOUT_CARD':
      return '운동 기록';
    case 'MEAL_CARD':
      return '식단';
    case 'ROUTINE_CARD':
      return '루틴';
    case 'TOUCH':
      return touchGestureOf(content)?.label ?? '터치';
    case 'CALL_CARD': {
      const info = parseCallCard(content);
      return info ? callCardLabel(info) : '통화';
    }
    // content 가 couple_emojis.id 라 그대로 쓰면 "12" 가 노출된다(TOUCH 와 같은 이유).
    // 감정 라벨을 붙이려면 트레이 목록을 조회해야 하는데, 방 목록 미리보기는 그 목록을
    // 들고 있지 않다 — 서버 preview() 도 같은 이유로 "[우리 이모지]" 한 문구다.
    case 'COUPLE_EMOJI':
      return '우리 이모지';
    case 'VOICE_MESSAGE': {
      const parsed = parseVoiceContent(content);
      return parsed ? `음성 메시지 ${formatVoiceDuration(parsed.durationSec)}` : '음성 메시지';
    }
    default:
      return content ?? '';
  }
}
