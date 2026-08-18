package com.fitto.voice.dto;

import com.fitto.voice.domain.VoiceClip;
import com.fitto.voice.domain.VoicePhrase;

/** 음성 응원 클립 응답 */
public record VoiceClipResponse(
        VoicePhrase phrase,
        String phraseLabel,
        String audioUrl
) {
    public static VoiceClipResponse of(VoiceClip c) {
        return new VoiceClipResponse(c.getPhrase(), c.getPhrase().label(), c.getAudioUrl());
    }
}
