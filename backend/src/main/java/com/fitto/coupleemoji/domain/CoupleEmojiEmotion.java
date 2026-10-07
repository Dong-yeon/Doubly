package com.fitto.coupleemoji.domain;

/**
 * 우리 이모지 감정 23종(표정 6 + 자주 하는 말 6 + 상황 11) — 사진 한 장으로 여러 번 나눠 만든다.
 *
 * <p><b>2026-09-29: "자주 하는 말" 6종 추가</b>(미안해·고마워·보고싶어·잘자·배고파·화이팅). 커플 대화에서 가장 자주
 * 쓰는 말인데 17종에 없었다 — 스티커 추천 키워드를 짤 때 맞는 그림이 없던 말들이다(docs/STICKER_SUGGEST_REVIVE_2026-09-28.md).
 * 표정 바로 뒤에 둬서, "아직 없는 것부터" 기본값으로 두 번째 세트(6장)가 정확히 이 여섯이 된다.
 *
 * <p>앞의 <b>표정 6종</b>은 기존 무드 12종({@code moodEmojis.ts})과 겹치는 결로 골랐고
 * (빡침·행복·신남·슬픔·졸림 + 사랑), 뒤의 <b>상황 11종</b>은 커플 대화에서 실제로 자주 쓰는
 * 말을 그림으로 대신한다(2026-09-10 추가). 2단계 무드 연동 때 이 순서대로 무드 선택지에
 * 붙는다. 감정별 변주 문구(영문)는 공통 앵커 뒤에 붙어 프롬프트가 된다 —
 * docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §5-2, 실측 §12-4.
 *
 * <p><b>여기에 하나 추가할 때마다 세트 원가와 대기 시간이 같이 오른다.</b> 세트 = 이 enum 전체를
 * 순차 생성하는 것이라(장당 약 0.04 USD · 약 13초), 6종 0.23 USD·80초가 17종에서 0.68 USD·
 * 약 220초가 됐다. 늘리기 전에 {@code AI_COUPLE_EMOJI} 월 한도(docs/PRO_PLAN_DESIGN.md)를
 * 같이 본다 — 원가가 0이 아닌 유일한 기능이다.
 */
public enum CoupleEmojiEmotion {
    ANGRY("화남", "😤",
            "furious: red flushed cheeks, puffed face, steam clouds rising from the head, furrowed brows, tightly closed mouth"),
    HAPPY("기쁨", "😊",
            "happy and content: warm closed-eye smile, rosy cheeks, small sparkles around the face"),
    EXCITED("신남", "🥳",
            "super excited: both arms raised high, wide open mouth cheering, confetti and stars flying around"),
    SAD("슬픔", "😢",
            "sad: drooping eyebrows, big teary eyes, a single tear rolling down, small rain cloud above the head"),
    SLEEPY("졸림", "😴",
            "sleepy: eyes closed, yawning, head tilted, \"zzz\" letters floating above"),
    LOVE("사랑", "🥰",
            "in love: heart-shaped eyes, blushing, hands making a finger heart, small hearts floating around"),

    /*
     * 자주 하는 말 6종(2026-09-29) — 표정만으로는 안 되는, 말을 대신하는 그림. 상황과 같은 규칙으로
     * 소품은 가슴 위로 들어오는 것만, 옷은 사진 그대로(앵커 OUTFIT) — 수면 모자처럼 덧붙이는 것만 쓴다.
     * moodEmoji 는 무료 12종 안에서 고른다(아래 moodEmoji 주석). 무드 피커에는 기본으로 올리지 않는다.
     */
    SORRY("미안해", "😔",
            "apologizing: both palms pressed together in front of the chest, eyebrows drawn up in apology, a small guilty smile, a single sweat drop on the temple"),
    THANKS("고마워", "🥰",
            "grateful: a small polite bow with both hands placed over the heart, warm closed-eye smile, a few tiny sparkles"),
    MISS_YOU("보고싶어", "😔",
            "missing someone: hugging a small heart-shaped cushion to the chest, wistful longing eyes looking slightly upward, a little pout"),
    GOOD_NIGHT("잘자", "😴",
            "saying good night: wearing a soft sleeping cap, holding a small pillow under one arm, gentle sleepy smile, one hand giving a small wave"),
    HUNGRY("배고파", "🫠",
            "starving: holding a spoon and chopsticks up in both hands, sparkling eager eyes, mouth watering with a tiny drool, a small rice bowl floating beside the face"),
    CHEER("화이팅", "🥳",
            "cheering you on: one fist raised high in a 'fighting!' pose, bright determined grin, small starburst lines around"),

    /*
     * 상황 11종(2026-09-10 추가) — 위 6종이 순수한 "표정"이라면 이쪽은 <b>소품이 있는 상황</b>이다.
     * 커플 대화에서 실제로 자주 쓰는 말("씻고 왔어", "퇴근", "방전")을 그림 한 장으로 대신한다.
     *
     * <p>앵커의 {@code FRAMING: upper body only (head and shoulders to chest)} 안에서 표현돼야
     * 하므로 소품은 <b>가슴 위로 들어오는 것만</b> 쓴다 — 꽃다발·화장 붓·손거울은 되고 책상·노트북은
     * 안 된다. 앵커의 {@code OUTFIT}(사진과 같은 옷)도 그대로 지켜야 해서, 꽃단장·출근은 옷을
     * 바꾸는 대신 액세서리·가방끈처럼 <b>덧붙이는</b> 것으로 표현한다.
     *
     * <p>moodEmoji 는 앞의 6종과 겹쳐도 된다 — 이 값은 키가 아니라 {@code mood_statuses.emoji}
     * 에 저장되는 유니코드 대역일 뿐이다. 다만 <b>무료 12종 안에서만</b> 골라야 한다(위 주석 참고).
     */
    FRESHLY_WASHED("씻고왔다", "😊",
            "freshly washed: a soft towel wrapped around the head, dewy clean skin, a few soap bubbles floating, refreshed relaxed smile"),
    BOUQUET("꽃다발", "🥰",
            "holding up a small bouquet of flowers in front of the chest with both hands, shy proud smile, flower petals floating around"),
    KISS("뽀뽀", "🥰",
            "blowing a kiss: lips puckered forward, one eye winking, a small heart floating away from the mouth"),
    HARD_AT_WORK("열일", "🤔",
            "fired up and working hard: sleeves rolled up, one fist clenched in front of the chest, determined focused eyes, a small flame of motivation behind"),
    COMMUTING("출근", "😮‍💨",
            "heading out to work: a bag strap over one shoulder, one hand raised in a small wave, a slightly tired but resolute half-smile"),
    OFF_WORK("퇴근", "😊",
            "finally off work: both arms stretched up in a big satisfying stretch, eyes closed, relieved happy smile"),
    DRAINED("방전", "🫠",
            "completely drained: slumped shoulders, blank half-closed eyes, mouth slightly open, a faint wisp of soul escaping upward, a small empty battery symbol above the head"),
    SHOWING_OFF("멋진척", "😎",
            "acting cool: dark sunglasses, chin tilted up, smug little smirk, one hand adjusting the sunglasses, sparkles around"),
    DRESSED_UP("꽃단장", "🥰",
            "all dressed up: hair neatly styled with a small flower accessory, light blush and glossy lips, sparkles around the face, pleased smile"),
    FACE_MASK("마스크팩", "😊",
            "wearing a white sheet face mask, with the eyes, eyebrows and hair still clearly visible and unchanged, relaxed content eyes, small sparkles"),
    DOING_MAKEUP("화장", "🥰",
            "doing makeup: holding a makeup brush up to one cheek, a small compact mirror in the other hand, lips slightly parted in concentration");

    private final String label;
    private final String moodEmoji;
    private final String expressionPrompt;

    CoupleEmojiEmotion(String label, String moodEmoji, String expressionPrompt) {
        this.label = label;
        this.moodEmoji = moodEmoji;
        this.expressionPrompt = expressionPrompt;
    }

    /**
     * 무드로 쓸 때 함께 저장하는 유니코드 대역 — {@code mood_statuses.emoji} 는 NOT NULL 이고
     * 푸시 미리보기가 그 값을 그대로 읽는다(V81 주석). 이미지를 못 그리는 자리에서도 감정이
     * 읽히도록 <b>기본 무드 12종 중에서</b> 골랐다({@code MOOD_EMOJIS} 의 빡침·좋음·신남·슬픔·졸림·행복).
     *
     * <p><b>확장팩(PRO) 이모지를 쓰면 안 된다</b> — {@code MoodService.set} 이 {@code MoodPack.isPremium}
     * 으로 PRO 판정을 하므로, 무료 사용자가 자기 우리 이모지를 무드로 걸 때 402 가 난다.
     *
     * <p><b>같은 뜻은 표정 6종({@link #isFace})뿐이다.</b> 나머지는 12종 안에 맞는 게 없어 가장 가까운 것을
     * 고른 대역이라(배고파 → 🫠 녹음, 열일 → 🤔 고민) 이 값을 사람에게 "이 기분"이라고 보여 주면 어긋난다 —
     * 글자로 보여 줄 자리는 {@link #moodText} 를 쓴다.
     */
    public String moodEmoji() {
        return moodEmoji;
    }

    /**
     * 무드 기본 12종과 <b>같은 뜻</b>인 표정인가 — 표정 6종만. 앱의 {@code isFaceEmotion}
     * (constants/coupleEmojiEmotions.ts)과 같은 집합이고, 무드 시트에서 기본 칸을 덮는 것도 이것뿐이다.
     */
    public boolean isFace() {
        return switch (this) {
            case ANGRY, HAPPY, EXCITED, SAD, SLEEPY, LOVE -> true;
            default -> false;
        };
    }

    /**
     * 이 감정을 무드로 걸었을 때 글자 자리(푸시 본문)에 쓸 말 — 표정이면 대역 이모지, 아니면 이름.
     * 예전엔 늘 대역을 실어서 "배고파"를 건 사람의 상대가 "지금 기분: 🫠"을 받았다(2026-10-07).
     */
    public String moodText() {
        return isFace() ? moodEmoji : label;
    }

    /** 한국어 라벨 — 알림 미리보기·트레이 툴팁용 */
    public String label() {
        return label;
    }

    /** 프롬프트의 "Expression:" 뒤에 붙는 감정별 변주 */
    public String expressionPrompt() {
        return expressionPrompt;
    }

    /**
     * 새로 만든 장을 무드 피커에 바로 올릴 것인가 — {@code couple_emojis.mood_visible} 의 초기값.
     *
     * <p><b>표정 6종만 켜고 자주 하는 말 6종·상황 11종은 끈다.</b> 무드는 "지금 내 기분"인데 출근·마스크팩·화장은
     * 기분이 아니라 활동이고, 전부 올리면 무드 선택지가 기본 12 + 17 = 29개가 된다 —
     * {@code moodEmojis.ts} 의 12종 원칙이 "처음부터 다 만들면 선택 마비만 생긴다"에서 나왔다.
     * 쓰고 싶으면 켜서 올린다(트레이에서 길게 눌러 토글).
     */
    public boolean defaultMoodVisible() {
        return isFace();
    }
}
