package com.fitto.common.policy;

/**
 * 약관 버전 — AUTH-09.
 *
 * <p>약관 본문을 개정하면 <b>반드시 여기 버전도 올려야 한다.</b>
 * 버전이 올라가면 기존 동의는 무효가 되고, 사용자에게 재동의를 받아야 한다
 * ({@code User.hasAgreedTo}).
 *
 * <p>본문은 앱에 내장되어 있다 — {@code frontend/src/constants/legal.ts}.
 * 본문을 고칠 때 이 상수를 함께 올리지 않으면 개정 사실이 추적되지 않는다.
 */
public final class PolicyVersion {

    /** 이용약관 버전 */
    public static final String TERMS = "1.0";

    /** 개인정보처리방침 버전 — 1.1: 처리 위탁에 Sentry(오류 수집) 추가 */
    public static final String PRIVACY = "1.1";

    private PolicyVersion() {
    }
}
