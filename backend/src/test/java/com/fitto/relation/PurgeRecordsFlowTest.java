package com.fitto.relation;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.service.FeedService;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.service.TripService;
import com.fitto.workout.repository.WorkoutRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 지난 기록 완전 삭제 (AUTH-10) — H2 + 실제 마이그레이션 스키마 기반.
 */
@SpringBootTest
@ActiveProfiles("test")
class PurgeRecordsFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired FeedService feedService;
    @Autowired TripService tripService;
    @Autowired RelationRepository relationRepository;
    @Autowired WorkoutRepository workoutRepository;
    @Autowired CloudinaryImageDeleter imageDeleter;

    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    private Long connect(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        return relationService.connectCouple(b, invite.code()).id();
    }

    private long count(String table, Long relationId) {
        String column = switch (table) {
            case "chat_messages", "streaks" -> "relation_id";
            default -> "couple_id";
        };
        Number n = (Number) em.createNativeQuery(
                        "select count(*) from " + table + " where " + column + " = :rid")
                .setParameter("rid", relationId).getSingleResult();
        return n.longValue();
    }

    @Test
    @Transactional
    void 연결을_끊은_뒤_기록을_완전히_삭제하면_모든_커플_콘텐츠가_사라진다() {
        Long me = register("purge-a@fitto.com");
        Long partner = register("purge-b@fitto.com");
        Long relationId = connect(me, partner);

        placeService.save(me, new SavePlaceRequest(
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null, null));
        feedService.createPost(me, new CreatePostRequest("기록", "https://res.cloudinary.com/x/image/upload/v1/fitto/a.jpg"));
        tripService.save(partner, new SaveTripRequest(
                "여행", LocalDate.now(), LocalDate.now().plusDays(1), null, null));

        assertThat(count("places", relationId)).isEqualTo(1);
        assertThat(count("feed_posts", relationId)).isEqualTo(1);
        assertThat(count("trips", relationId)).isEqualTo(1);

        relationService.endRelation(me, relationId);
        relationService.purgeRecords(me, relationId);
        em.flush();
        em.clear();

        assertThat(count("places", relationId)).isZero();
        assertThat(count("feed_posts", relationId)).isZero();
        assertThat(count("trips", relationId)).isZero();
        assertThat(relationRepository.findById(relationId)).isEmpty();
    }

    /**
     * 연결된 상태에서 삭제되면 사용 중인 기록이 통째로 날아간다.
     * 반드시 연결을 먼저 끊게 강제해야 한다.
     */
    @Test
    void 활성_관계의_기록은_삭제할_수_없다() {
        Long me = register("purge-active-a@fitto.com");
        Long partner = register("purge-active-b@fitto.com");
        Long relationId = connect(me, partner);

        assertThatThrownBy(() -> relationService.purgeRecords(me, relationId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.RELATION_STILL_ACTIVE);
    }

    @Test
    void 관계에_속하지_않은_사람은_기록을_삭제할_수_없다() {
        Long me = register("purge-out-a@fitto.com");
        Long partner = register("purge-out-b@fitto.com");
        Long outsider = register("purge-out-c@fitto.com");
        Long relationId = connect(me, partner);
        relationService.endRelation(me, relationId);

        assertThatThrownBy(() -> relationService.purgeRecords(outsider, relationId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    /** 개인 운동 기록은 커플 기록이 아니다 — 삭제되지 않고 관계 참조만 끊겨야 한다. */
    @Test
    @Transactional
    void 개인_운동_기록은_삭제되지_않는다() {
        Long me = register("purge-workout-a@fitto.com");
        Long partner = register("purge-workout-b@fitto.com");
        Long relationId = connect(me, partner);

        em.createNativeQuery("insert into workouts (user_id, relation_id, workout_date) "
                        + "values (:uid, :rid, :d)")
                .setParameter("uid", partner).setParameter("rid", relationId)
                .setParameter("d", LocalDate.now()).executeUpdate();

        relationService.endRelation(me, relationId);
        relationService.purgeRecords(me, relationId);
        em.flush();
        em.clear();

        Number remaining = (Number) em.createNativeQuery(
                        "select count(*) from workouts where user_id = :uid and relation_id is null")
                .setParameter("uid", partner).getSingleResult();
        assertThat(remaining.longValue()).isEqualTo(1);
    }

    /** Cloudinary URL 에서 public_id 를 뽑지 못하면 이미지가 영영 남는다. */
    @Test
    void Cloudinary_URL_에서_publicId_를_추출한다() {
        assertThat(imageDeleter.extractPublicId(
                "https://res.cloudinary.com/demo/image/upload/v1712345678/fitto/abc123.jpg"))
                .isEqualTo("fitto/abc123");
        assertThat(imageDeleter.extractPublicId(
                "https://res.cloudinary.com/demo/image/upload/fitto/abc123.png"))
                .isEqualTo("fitto/abc123");
        assertThat(imageDeleter.extractPublicId("https://example.com/photo.jpg")).isNull();
        assertThat(imageDeleter.extractPublicId(null)).isNull();
    }
}
