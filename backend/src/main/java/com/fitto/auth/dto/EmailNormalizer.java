package com.fitto.auth.dto;

import java.util.Locale;

/**
 * 이메일 정규화 — 앞뒤 공백을 떼고 소문자로.
 *
 * <p>예전엔 trim 만 해서 {@code A@x.com} 과 {@code a@x.com} 이 별개 계정이 됐고(PostgreSQL UNIQUE 는
 * 대소문자를 구분한다), 가입 때와 다른 대소문자로 로그인하면 "비밀번호가 올바르지 않습니다"가 떴다
 * (docs/first-experience-audit.md #12). 이메일이 들어오는 요청 DTO 가 모두 생성 시점에 이걸 거친다 —
 * 서비스마다 기억해서 부르는 방식은 새 경로가 생길 때 빠진다.
 *
 * <p>Locale.ROOT: 터키어 로케일의 'I' → 'ı' 같은 변환을 막는다.
 */
public final class EmailNormalizer {

    private EmailNormalizer() {
    }

    public static String normalize(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
