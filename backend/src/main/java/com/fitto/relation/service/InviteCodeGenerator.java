package com.fitto.relation.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** 관계 초대코드 생성 — 커플/트레이너/패밀리 공용. 6자리, 혼동 문자(I,O,0,1) 제외. */
@Component
public class InviteCodeGenerator {

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;

    private final SecureRandom random = new SecureRandom();
    private final RelationRepository relationRepository;

    public InviteCodeGenerator(RelationRepository relationRepository) {
        this.relationRepository = relationRepository;
    }

    public String generate() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
            String code = sb.toString();
            if (!relationRepository.existsByInviteCode(code)) {
                return code;
            }
        }
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, "초대코드 생성에 실패했습니다. 다시 시도해주세요.");
    }
}
