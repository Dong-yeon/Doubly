package com.fitto.voice.dto;

import java.util.List;

/** 상대방이 녹음해둔 음성 응원 클립 — 운동 중 재생용. 커플 미연결이면 connected=false */
public record PartnerVoiceClipsResponse(
        boolean connected,
        List<VoiceClipResponse> clips
) {
    public static PartnerVoiceClipsResponse notConnected() {
        return new PartnerVoiceClipsResponse(false, List.of());
    }
}
