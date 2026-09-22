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

    /**
     * 이용약관 버전 — 1.2: 유료 구독(PRO) 도입 반영.
     * 제2조에 무료/유료 구성, 제8~10조에 유료 서비스·청약철회·환불·약관 변경 절차를 넣고,
     * "무료로 제공됩니다"(구 제7조 ②)를 걷어냈다.
     */
    public static final String TERMS = "1.2";

    /**
     * 개인정보처리방침 버전 — 1.3: 구매 기록(스토어·상품 id·거래 식별자·구독 기간) 수집 항목과
     * 전자상거래법 보존 기간(5년·5년·3년), 수탁사 Apple·Google 추가.
     * 종전의 "유상 거래 기능을 제공하지 않으므로 보존 의무가 없다"는 문장은 사실이 아니게 됐다.
     */
    public static final String PRIVACY = "1.3";

    private PolicyVersion() {
    }
}
