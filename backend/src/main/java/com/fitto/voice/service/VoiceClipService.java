package com.fitto.voice.service;

import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.voice.domain.VoiceClip;
import com.fitto.voice.domain.VoicePhrase;
import com.fitto.voice.dto.PartnerVoiceClipsResponse;
import com.fitto.voice.dto.SaveVoiceClipRequest;
import com.fitto.voice.dto.VoiceClipResponse;
import com.fitto.voice.repository.VoiceClipRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 커플 음성 응원 — 애인이 녹음한 짧은 문구를 저장/조회하고, 운동 중 재생할 상대방
 * 클립을 내려준다. 짐워크·플랜핏 조사에서 확인되지 않은, 커플 앱만의 기능.
 */
@Service
@Transactional(readOnly = true)
public class VoiceClipService {

    private final VoiceClipRepository voiceClipRepository;
    private final RelationRepository relationRepository;

    public VoiceClipService(VoiceClipRepository voiceClipRepository, RelationRepository relationRepository) {
        this.voiceClipRepository = voiceClipRepository;
        this.relationRepository = relationRepository;
    }

    public List<VoiceClipResponse> mine(Long userId) {
        return voiceClipRepository.findByUserIdOrderByPhraseAsc(userId).stream()
                .map(VoiceClipResponse::of)
                .toList();
    }

    /** 상대방이 녹음해둔 클립 — 운동 세션 시작 시 한 번 받아 재생에 쓴다. */
    public PartnerVoiceClipsResponse partnerClips(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return PartnerVoiceClipsResponse.notConnected();
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return PartnerVoiceClipsResponse.notConnected();
        }
        List<VoiceClipResponse> clips = voiceClipRepository.findByUserIdOrderByPhraseAsc(partnerId).stream()
                .map(VoiceClipResponse::of)
                .toList();
        return new PartnerVoiceClipsResponse(true, clips);
    }

    /** 저장 — 같은 문구가 이미 있으면 교체(재녹음), 없으면 새로 만든다. */
    @Transactional
    public VoiceClipResponse save(Long userId, SaveVoiceClipRequest request) {
        VoiceClip clip = voiceClipRepository.findByUserIdAndPhrase(userId, request.phrase()).orElse(null);
        if (clip != null) {
            clip.updateUrl(request.audioUrl());
        } else {
            clip = VoiceClip.builder()
                    .userId(userId)
                    .phrase(request.phrase())
                    .audioUrl(request.audioUrl())
                    .build();
            voiceClipRepository.save(clip);
        }
        return VoiceClipResponse.of(clip);
    }

    @Transactional
    public void delete(Long userId, VoicePhrase phrase) {
        voiceClipRepository.deleteByUserIdAndPhrase(userId, phrase);
    }
}
