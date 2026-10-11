package com.fitto.journal.dto;

import jakarta.validation.constraints.Size;

/**
 * 우리 기록에 공유 — 본문은 <b>공유본에서만</b> 고칠 수 있다(원본 기록은 그대로).
 * 비우면 원본 본문을 그대로 쓴다. 기분은 싣지 않는다 — 무드는 이미 상대에게 보이는 별도 채널이다.
 */
public record ShareJournalRequest(
        @Size(max = 2000, message = "글은 2000자 이내로 작성해주세요.")
        String content
) {
}
