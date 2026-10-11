package com.fitto.place.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 채팅 링크 해석 요청 — POST /places/resolve-link */
public record ResolvePlaceLinkRequest(
        @NotBlank(message = "링크가 비어 있어요.")
        @Size(max = 2000, message = "링크가 너무 길어요.")
        String url,

        /**
         * 링크가 붙어 온 메시지 본문(선택) — 지도 앱의 "공유하기"는 이름·주소를 링크 위에 함께 싣는다
         * (「[네이버 지도] / 가게 이름 / 주소 / https://naver.me/…」 여러 줄). 페이지를 못 읽었을 때(네이버는 미리보기 봇이
         * 아닌 UA 에 429) 이름을 여기서 꺼낸다. 서버는 저장하지 않는다.
         */
        @Size(max = 2000, message = "메시지가 너무 길어요.")
        String messageText
) {
    /** url 만 보내던 호출부(테스트 등) 호환 */
    public ResolvePlaceLinkRequest(String url) {
        this(url, null);
    }
}
