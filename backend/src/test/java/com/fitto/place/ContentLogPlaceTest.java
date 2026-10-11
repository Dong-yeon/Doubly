package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.notification.NotificationService;
import com.fitto.content.domain.ContentType;
import com.fitto.content.dto.ContentLogResponse;
import com.fitto.content.dto.RecordContentLogRequest;
import com.fitto.content.dto.SaveContentRequest;
import com.fitto.content.dto.WatchedHereResponse;
import com.fitto.content.repository.ContentLogRepository;
import com.fitto.content.service.ContentService;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.service.RelationRecordPurger;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 관람 장소 연결(V133) — "어디서 봤어요?"와 장소 상세 "여기서 본 것". docs/LOVELICHELIN_AI_COURSE_2026-10-07.md §5.
 * 목 구성은 MealVisitTest 와 같다(알림 목만) — 스프링 컨텍스트를 늘리지 않는다(CLAUDE.md §6).
 */
@SpringBootTest
@ActiveProfiles("test")
class ContentLogPlaceTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired ContentService contentService;
    @Autowired ContentLogRepository contentLogRepository;
    @Autowired RelationRecordPurger relationRecordPurger;

    @MockitoBean
    NotificationService notificationService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private long[] couple(String tag) {
        Long a = register("clp-" + tag + "a@fitto.com");
        Long b = register("clp-" + tag + "b@fitto.com");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        return new long[]{a, b};
    }

    private Long place(Long userId, String name) {
        return placeService.save(userId, new SavePlaceRequest(name, null, null, null, null)).id();
    }

    private Long content(Long userId, String title) {
        return contentService.save(userId, new SaveContentRequest(title, ContentType.MOVIE, null)).id();
    }

    @Test
    void 어디서_봤는지_남기면_관람_기록과_장소_상세_양쪽에_보인다() {
        long[] u = couple("1");
        Long cgv = place(u[0], "CGV 연남");
        Long movie = content(u[0], "듄: 파트2");

        ContentLogResponse log = contentService.recordLog(u[0], movie,
                new RecordContentLogRequest(LocalDate.of(2026, 10, 3), 5, "최고", null, cgv));
        assertThat(log.placeId()).isEqualTo(cgv);
        assertThat(log.placeName()).isEqualTo("CGV 연남");

        // 상대도 같은 이름으로 본다(관람 기록 목록은 장소 이름을 한 번에 붙인다)
        assertThat(contentService.logs(u[1], movie)).extracting(ContentLogResponse::placeName).containsExactly("CGV 연남");

        List<WatchedHereResponse> here = contentService.watchedAt(u[1], cgv);
        assertThat(here).hasSize(1);
        assertThat(here.get(0).title()).isEqualTo("듄: 파트2");
        assertThat(here.get(0).type()).isEqualTo("MOVIE");
        assertThat(here.get(0).rating()).isEqualTo(5);
    }

    @Test
    void 장소는_선택이고_옛_요청은_그대로_된다() {
        long[] u = couple("2");
        Long movie = content(u[0], "인사이드 아웃 2");
        ContentLogResponse log = contentService.recordLog(u[0], movie,
                new RecordContentLogRequest(null, 4, null, null));
        assertThat(log.placeId()).isNull();
        assertThat(log.placeName()).isNull();
    }

    @Test
    void 남의_장소로는_남길_수_없고_남의_장소_목록도_못_본다() {
        long[] mine = couple("3");
        long[] others = couple("4");
        Long theirs = place(others[0], "남의 극장");
        Long movie = content(mine[0], "베테랑2");

        assertThatThrownBy(() -> contentService.recordLog(mine[0], movie,
                new RecordContentLogRequest(null, null, null, null, theirs)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> contentService.watchedAt(mine[0], theirs)).isInstanceOf(BusinessException.class);
    }

    @Test
    void 장소를_지워도_관람_기록은_남고_장소만_비운다() {
        long[] u = couple("5");
        Long hall = place(u[0], "세종문화회관");
        Long show = content(u[0], "레미제라블");
        Long logId = contentService.recordLog(u[0], show,
                new RecordContentLogRequest(null, 5, null, null, hall)).id();

        placeService.delete(u[0], hall);

        var left = contentLogRepository.findById(logId).orElseThrow();
        assertThat(left.getPlaceId()).isNull();
        assertThat(contentService.logs(u[0], show)).extracting(ContentLogResponse::placeName).containsOnlyNulls();
    }

    @Test
    void 관계를_지우면_장소를_가리키는_관람_기록까지_FK_위반_없이_지워진다() {
        long[] u = couple("6");
        Long cgv = place(u[0], "CGV 용산");
        Long movie = content(u[0], "파묘");
        Long logId = contentService.recordLog(u[0], movie,
                new RecordContentLogRequest(null, null, null, null, cgv)).id();
        Long relationId = relationService.findMyRelations(u[0]).get(0).id();

        relationService.endRelation(u[1], relationId);
        relationRecordPurger.purge(relationId);

        assertThat(contentLogRepository.findById(logId)).isEmpty();
    }
}
