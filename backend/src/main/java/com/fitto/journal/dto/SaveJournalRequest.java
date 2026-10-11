package com.fitto.journal.dto;

import com.fitto.journal.domain.JournalSource;
import jakarta.validation.constraints.Size;

/**
 * 그날 기록 통째로 저장(PUT) — 보내지 않은 칸은 비운다는 뜻이다.
 *
 * <p>무드·본문·사진 중 하나는 있어야 한다("셋 다 비움"은 삭제로 한다) — 필드 하나로 표현되지 않아
 * 서비스에서 검증한다. {@code source} 는 계측용이고 저장하지 않는다.
 */
public record SaveJournalRequest(
        @Size(max = 10, message = "이모지 형식이 올바르지 않아요.")
        String moodEmoji,
        @Size(max = 2000, message = "기록은 2000자까지 쓸 수 있어요.")
        String body,
        @Size(max = 500, message = "사진 주소가 올바르지 않아요.")
        String photoUrl,
        JournalSource source
) {
}
