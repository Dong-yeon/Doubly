package com.fitto.call.dto;

/** 발신·수락 응답 — 이 자격으로 Stream 콜({@code callId})에 조인한다. */
public record CallJoinResponse(Long callSessionId, String callId, String apiKey, String token) {
}
