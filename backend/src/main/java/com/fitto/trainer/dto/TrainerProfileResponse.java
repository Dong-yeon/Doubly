package com.fitto.trainer.dto;

import com.fitto.trainer.domain.TrainerProfile;

/** 트레이너 프로필 응답 — 설계서 5.4 */
public record TrainerProfileResponse(
        Long id,
        Long userId,
        String specialty,
        String introduction,
        String career,
        String certificate,
        int maxMembers,
        boolean isAccepting
) {
    public static TrainerProfileResponse from(TrainerProfile p) {
        return new TrainerProfileResponse(p.getId(), p.getUserId(), p.getSpecialty(),
                p.getIntroduction(), p.getCareer(), p.getCertificate(),
                p.getMaxMembers(), p.isAccepting());
    }
}
