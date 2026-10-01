package com.fitto.dataexport;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.dto.CreateEventRequest;
import com.fitto.calendar.service.CalendarService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.time.KstClock;
import com.fitto.dataexport.dto.ExportMedia;
import com.fitto.dataexport.dto.ExportPageResponse;
import com.fitto.dataexport.dto.ExportSummaryResponse;
import com.fitto.dataexport.dto.SectionCount;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.service.FeedService;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 기록 내보내기 — 섹션 SQL 이 실제 스키마(Flyway)에서 도는지, 남의 기록이 섞이지 않는지. */
@SpringBootTest
@ActiveProfiles("test")
class DataExportFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired RelationRepository relationRepository;
    @Autowired CalendarService calendarService;
    @Autowired FeedService feedService;
    @Autowired ChatService chatService;
    @Autowired DataExportService exportService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private Long[] couple(String a, String b) {
        Long ua = register(a);
        Long ub = register(b);
        InviteCodeResponse invite = relationService.createCoupleInvite(ua);
        relationService.connectCouple(ub, invite.code());
        return new Long[]{ua, ub};
    }

    private Long relationOf(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .get(0).getId();
    }

    /** 섹션 하나를 끝까지 — 앱이 하는 그대로 cursor 를 따라간다. */
    private List<Map<String, Object>> all(Long userId, ExportSection section, int limit, List<ExportMedia> media) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Long cursor = null;
        do {
            ExportPageResponse page = exportService.page(userId, section.key(), cursor, limit);
            rows.addAll(page.items());
            media.addAll(page.media());
            cursor = page.nextCursor();
        } while (cursor != null);
        return rows;
    }

    @Test
    void 모든_섹션이_실제_스키마에서_돌고_공동_기록은_둘_다_받는다() {
        Long[] c = couple("exp1a@fitto.com", "exp1b@fitto.com");
        Long rid = relationOf(c[0]);
        calendarService.create(c[1], new CreateEventRequest(
                "첫 데이트", KstClock.today(), null, EventType.DATE, false, null));
        feedService.createPost(c[0], new CreatePostRequest("바다", null,
                List.of("https://res.cloudinary.com/x/image/upload/a.jpg",
                        "https://res.cloudinary.com/x/image/upload/b.jpg")));
        chatService.postSystemCard(c[0], rid, MessageType.VOICE_MESSAGE,
                "https://res.cloudinary.com/x/video/upload/v.m4a|12");

        // 모든 섹션 — SQL 하나라도 스키마와 어긋나면 여기서 터진다
        for (ExportSection section : ExportSection.values()) {
            all(c[1], section, 50, new ArrayList<>());
        }

        List<ExportMedia> media = new ArrayList<>();
        assertThat(all(c[1], ExportSection.COUPLE_EVENTS, 50, media))
                .extracting(r -> r.get("title")).containsExactly("첫 데이트");
        all(c[1], ExportSection.FEED_POST_PHOTOS, 50, media);
        all(c[1], ExportSection.CHAT_MESSAGES, 50, media);
        assertThat(media).extracting(ExportMedia::url).contains(
                "https://res.cloudinary.com/x/image/upload/a.jpg",
                "https://res.cloudinary.com/x/image/upload/b.jpg",
                "https://res.cloudinary.com/x/video/upload/v.m4a");
        assertThat(media).filteredOn(m -> m.url().endsWith(".m4a"))
                .extracting(ExportMedia::kind).containsExactly("AUDIO");

        ExportSummaryResponse summary = exportService.summary(c[1]);
        assertThat(summary.coupled()).isTrue();
        assertThat(summary.sections()).filteredOn(s -> s.key().equals("chat_messages"))
                .extracting(SectionCount::mediaCount).containsExactly(1L);
        assertThat(summary.mediaCount()).isGreaterThanOrEqualTo(3);
    }

    @Test
    void 다른_커플의_기록과_상대의_개인_기록은_섞이지_않는다() {
        Long[] c1 = couple("exp2a@fitto.com", "exp2b@fitto.com");
        Long[] c2 = couple("exp2c@fitto.com", "exp2d@fitto.com");
        calendarService.create(c1[0], new CreateEventRequest(
                "우리만의 약속", KstClock.today(), null, EventType.DATE, false, null));

        assertThat(all(c2[0], ExportSection.COUPLE_EVENTS, 50, new ArrayList<>())).isEmpty();

        // 개인 섹션은 나 하나 — 상대 프로필이 PROFILE 로 나가지 않는다
        List<Map<String, Object>> profile = all(c1[0], ExportSection.PROFILE, 50, new ArrayList<>());
        assertThat(profile).extracting(r -> r.get("id")).containsExactly(c1[0]);
        // 비밀번호·소셜 id 는 컬럼을 지정해 막았다
        assertThat(profile.get(0)).doesNotContainKeys("password", "social_id", "role");

        // 멤버 이름표는 둘
        assertThat(all(c1[0], ExportSection.MEMBERS, 50, new ArrayList<>()))
                .extracting(r -> ((Number) r.get("id")).longValue())
                .containsExactlyInAnyOrder(c1[0], c1[1]);
    }

    @Test
    void 페이지를_나눠도_빠짐도_겹침도_없다() {
        Long[] c = couple("exp3a@fitto.com", "exp3b@fitto.com");
        for (int i = 0; i < 5; i++) {
            calendarService.create(c[0], new CreateEventRequest(
                    "일정" + i, KstClock.today().plusDays(i), null, EventType.DATE, false, null));
        }
        assertThat(all(c[0], ExportSection.COUPLE_EVENTS, 2, new ArrayList<>()))
                .extracting(r -> r.get("title"))
                .containsExactly("일정0", "일정1", "일정2", "일정3", "일정4");
    }

    @Test
    void 커플이_없으면_개인_기록만_나간다() {
        Long solo = register("exp4@fitto.com");
        ExportSummaryResponse summary = exportService.summary(solo);
        assertThat(summary.coupled()).isFalse();
        assertThat(summary.sections()).extracting(SectionCount::scope).containsOnly("PERSONAL");
        assertThatThrownBy(() -> exportService.page(solo, "chat_messages", null, null))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 모르는_섹션은_400이다() {
        Long solo = register("exp5@fitto.com");
        assertThatThrownBy(() -> exportService.page(solo, "users", null, null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    /** 한도를 넘겨도 결제를 권하지 않는다 — FREE 도 429, PRO 와 같은 한도. */
    @Test
    void 무료도_주_2회_넘기면_결제_안내가_아니라_429다() {
        Long solo = register("exp6@fitto.com");
        exportService.start(solo);
        ExportSummaryResponse second = exportService.start(solo);
        assertThat(second.remaining()).isZero();
        assertThatThrownBy(() -> exportService.start(solo))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.USAGE_LIMIT_EXCEEDED);
        // 이어받기(섹션 조회)는 한도와 무관하다
        assertThat(exportService.page(solo, "profile", null, null).items()).hasSize(1);
    }

    @Test
    void 음성_메시지_본문에서_URL만_꺼낸다() {
        assertThat(DataExportService.voiceUrlOf("https://a/b.m4a|12")).isEqualTo("https://a/b.m4a");
        assertThat(DataExportService.voiceUrlOf("https://a/b.m4a")).isEqualTo("https://a/b.m4a");
        assertThat(DataExportService.voiceUrlOf("그냥 글")).isNull();
        assertThat(DataExportService.voiceUrlOf(null)).isNull();
    }
}
