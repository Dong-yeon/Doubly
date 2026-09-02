package com.fitto.voice.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
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
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    public VoiceClipService(VoiceClipRepository voiceClipRepository, RelationRepository relationRepository,
                             UserRepository userRepository, NotificationService notificationService) {
        this.voiceClipRepository = voiceClipRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
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
        boolean rerecord = clip != null;
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
        notifyPartner(userId, request.phrase(), rerecord);
        return VoiceClipResponse.of(clip);
    }

    @Transactional
    public void delete(Long userId, VoicePhrase phrase) {
        voiceClipRepository.deleteByUserIdAndPhrase(userId, phrase);
    }

    /**
     * 녹음 사실을 상대에게 알린다 — 지금까지는 이 경로에 알림이 전혀 없었다. 애인이 5개
     * 문구를 다 녹음해둬도 상대는 우연히 운동 세션에서 소리가 나기 전까지 알 방법이
     * 없었다({@code docs/WORKOUT_UX_ANALYSIS_2026-09-01.md} 진단 2번 — 부스터는 알림이
     * 있어서 인지되는데 상설 클립만 조용했다).
     *
     * <p>커플이 아직 연결 전이면 조용히 넘어간다 — 이 시점엔 알릴 상대가 없다.
     * 실패해도(알림 발송 오류 등) 녹음 저장 자체는 이미 커밋된 뒤이므로 클라이언트에는
     * 영향이 없다 — 알림은 부가 정보다.
     */
    private void notifyPartner(Long userId, VoicePhrase phrase, boolean rerecord) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return;
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return;
        }
        String name = userRepository.findById(userId).map(User::getName).orElse("애인");
        String verb = rerecord ? "다시 녹음했어요" : "녹음했어요";
        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                "응원 목소리가 도착했어요 🎤",
                name + "님이 '" + phrase.label() + "' 응원을 " + verb,
                PushLinks.WORKOUT_VOICE_CLIPS);
    }
}
