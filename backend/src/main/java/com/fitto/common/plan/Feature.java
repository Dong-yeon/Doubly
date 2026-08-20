package com.fitto.common.plan;

/**
 * 플랜으로 제한되는 기능과 그 한도 — <b>모든 한도 숫자가 여기 한 곳에 있다.</b>
 *
 * <p><b>왜 한 파일인가</b>: 한도를 서비스 곳곳에 흩어놓으면 "무료가 지금 뭘 얼마나 쓸 수
 * 있나"를 아무도 한눈에 못 본다. 가격 정책은 자주 바뀌는데, 바꿀 때마다 20개 파일을
 * 뒤져야 하면 반드시 어긋난다.
 *
 * <p><b>⚠️ 아래 FREE 숫자는 아직 근거가 없는 자리표시자다.</b> 무료 체험 기간
 * ({@code fitto.plan.free-trial=true}) 동안은 전원 PRO 로 판정되므로 이 값들은 쓰이지 않는다.
 * 실사용 분포(p60~p75)를 측정한 뒤에 확정한다 — 그때 고칠 곳은 이 파일 하나다.
 *
 * <p>클라이언트에는 {@code GET /api/v1/plan/me} 로 내려간다. 앱에 한도를 하드코딩하면
 * 숫자를 바꿀 때마다 스토어 심사를 기다려야 하므로, <b>판정도 표시도 서버가 한다.</b>
 */
public enum Feature {

    /* ── AI (Gemini) ──────────────────────────────────────────────────────────
     * 원가는 flash-lite 라 사실상 무시할 수준이다. 여기를 막는 건 비용 방어가 아니라
     * 체감가치 판매다. 그래서 음식 사진 분석처럼 "이 앱을 왜 쓰는지"를 보여주는 훅은
     * 무료에도 남긴다 — 완전히 막으면 PRO 의 가치를 체험할 길이 없어진다. */

    /** 음식 사진 칼로리 분석 — 신규 유입의 대표 훅. 무료에도 반드시 남긴다. */
    AI_FOOD_PHOTO("AI 음식 사진 분석", Quota.perDay(2), Quota.perDay(30)),
    /** 음식 이름 텍스트 분석 — 사진보다 가벼워 한도도 같이 준다. */
    AI_FOOD_TEXT("AI 음식 분석", Quota.perDay(2), Quota.perDay(30)),
    AI_DIET_COACH("AI 식단 코치", Quota.blocked(), Quota.perDay(10)),
    AI_DATE_COURSE("AI 데이트 코스 추천", Quota.perMonth(1), Quota.perDay(10)),
    /**
     * 럽슐랭 취향 기반 새 맛집 추천(Gemini 검색 의도 → 카카오 실존 장소) — 구 AI 총평의 대체.
     * 둘이 검증한 데이터가 쌓일수록 추천이 정교해진다 — 지불 의사와 같은 곡선이라 PRO 전용으로 판다.
     */
    AI_RESTAURANT_RECOMMEND("AI 맛집 추천", Quota.blocked(), Quota.perDay(10)),
    AI_WEEKLY_LETTER("AI 주간 편지", Quota.blocked(), Quota.perDay(5)),
    AI_TRIP_ITINERARY("AI 여행 일정 생성", Quota.blocked(), Quota.perDay(5)),
    AI_WORKOUT_RECOMMEND("AI 운동 추천", Quota.perWeek(1), Quota.perDay(10)),

    /**
     * 플랜과 무관한 <b>전 기능 합산 안전망</b>.
     *
     * <p>Google AI Studio 무료 티어는 <b>프로젝트 단위</b> 일일 한도가 따로 있다.
     * 기능별 한도를 아무리 잘 잡아도 사용자 수가 늘면 프로젝트 쿼터가 먼저 터져
     * <b>전원이</b> AI 를 못 쓴다. 그래서 개인별 총량도 함께 막는다.
     * 값은 {@code fitto.gemini.daily-limit-per-user} 로 덮어쓴다.
     */
    AI_TOTAL("AI 기능 전체", Quota.perDay(10), Quota.perDay(10)),

    /* ── 저장 · 원가형 ────────────────────────────────────────────────────────
     * 여기는 진짜로 돈이 나간다. Cloudinary 무료 티어는 유예가 아니라 절벽이라,
     * 무료 체험 기간에도 상한이 필요하다. */

    /**
     * 사진 업로드(피드·앨범·맛집·식단·체중·프로필 공통) — 서명 발급 시점에 센다.
     *
     * <p>PRO 의 1000장은 판매 문구가 아니라 <b>사고 방지선</b>이다. 앱 버그나 자동화로
     * 무한 업로드가 돌면 요금이 그대로 청구되므로, "무제한"이라도 절대 상한은 둔다.
     */
    PHOTO_UPLOAD("사진 업로드", Quota.perMonth(30), Quota.perMonth(1000)),

    /* ── 저장 · 개수형 (DB 개수로 판정) ───────────────────────────────────── */

    /** 아직 끝나지 않은 여행 (지난 여행은 세지 않는다 — 지워야 새로 만들 수 있으면 안 된다) */
    TRIP_ACTIVE("진행 중인 여행", Quota.upTo(1), Quota.unlimited()),
    PLACE_PIN("맛집 핀", Quota.upTo(20), Quota.unlimited()),
    /** PRO 의 30은 기존 {@code MAX_ROUTINES} 를 옮겨온 것 — 상한의 단일 출처를 여기로 모았다. */
    WORKOUT_ROUTINE("내 운동 루틴", Quota.upTo(3), Quota.upTo(30)),
    CALENDAR_EVENT("커플 캘린더 일정", Quota.perMonth(10), Quota.unlimited()),
    /** PRO 의 50은 기존 {@code MAX_FAVORITES} 를 옮겨온 것. */
    FAVORITE_FOOD("즐겨찾는 음식", Quota.upTo(10), Quota.upTo(50)),

    /* ── 깊이형 (기능 자체를 여닫는다) ────────────────────────────────────── */

    /** 작년 오늘 — 데이터가 쌓인 커플일수록 가치가 커진다(= 지불 의사와 같은 곡선). */
    MEMORIES("추억 리마인드", Quota.blocked(), Quota.unlimited()),
    /** 전체 기간 통계 — 무료는 최근 구간만 (구간은 화면에서 결정) */
    FULL_STATS("전체 기간 통계", Quota.blocked(), Quota.unlimited()),
    WEEKLY_RECAP("주간 결산", Quota.blocked(), Quota.unlimited()),
    TRIP_EXPENSE("여행 경비 정산", Quota.blocked(), Quota.unlimited()),
    TRIP_CHECKLIST("여행 준비물 체크리스트", Quota.blocked(), Quota.unlimited()),

    /* ── 꾸미기 (원가 0, 마진 100%) ───────────────────────────────────────── */

    CUSTOM_BACKGROUND("커플 배경 꾸미기", Quota.blocked(), Quota.unlimited()),
    PREMIUM_STICKER("프리미엄 스티커", Quota.blocked(), Quota.unlimited()),
    /**
     * 가상 터치 프리미엄 제스처(포옹·뽀뽀) — PREMIUM_STICKER 와 판정 근거가 같다(원가 0).
     * 기본 3종(손잡기·토닥임·콕찌르기)은 게이팅 없이 전부 무료. PLAN.md "가상 터치" 참고.
     */
    TOUCH_GESTURE_PREMIUM("프리미엄 터치 제스처", Quota.blocked(), Quota.unlimited());

    private final String displayName;
    private final Quota free;
    private final Quota pro;

    Feature(String displayName, Quota free, Quota pro) {
        this.displayName = displayName;
        this.free = free;
        this.pro = pro;
    }

    public String displayName() {
        return displayName;
    }

    public Quota quotaFor(Plan plan) {
        return plan == Plan.PRO ? pro : free;
    }

    /**
     * 커플 공간의 기능인가 — 판정을 관계 단위(둘 중 높은 플랜)로 해야 하는 것들.
     *
     * <p>공동 콘텐츠는 {@code couple_id} 에 매달려 있어서 개인 단위로 판정하면
     * 같은 여행을 한 명은 보고 한 명은 못 보는 상태가 된다.
     */
    public boolean isCoupleScoped() {
        return switch (this) {
            case AI_DATE_COURSE, AI_RESTAURANT_RECOMMEND, AI_TRIP_ITINERARY, AI_WEEKLY_LETTER,
                 TRIP_ACTIVE, TRIP_EXPENSE, TRIP_CHECKLIST,
                 PLACE_PIN, CALENDAR_EVENT, MEMORIES, WEEKLY_RECAP,
                 CUSTOM_BACKGROUND, PREMIUM_STICKER, TOUCH_GESTURE_PREMIUM,
                 // 사진은 서명 발급 시점에 용도를 알 수 없다(피드=커플, 체중=개인).
                 // 물량의 대부분이 커플 콘텐츠라 커플 단위로 본다 — "커플당 결제 1건" 모델과도 맞는다.
                 PHOTO_UPLOAD -> true;
            default -> false;
        };
    }
}
