package com.fitto.relation;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.service.FeedService;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationRecordPurger;
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
    @Autowired RelationRecordPurger relationRecordPurger;
    @Autowired ChatService chatService;
    @Autowired MealService mealService;

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
            case "chat_messages", "streaks", "scheduled_chat_messages", "chat_pinned_messages" -> "relation_id";
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
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null));
        feedService.createPost(me, new CreatePostRequest("기록", "https://res.cloudinary.com/x/image/upload/v1/fitto/a.jpg"));
        tripService.save(partner, new SaveTripRequest(
                "여행", LocalDate.now(), LocalDate.now().plusDays(1), null, null));
        // 예약 전송(V76) — relation_id 를 직접 들고 있어 chat_messages 와 같은 컬럼으로 센다
        em.createNativeQuery("insert into scheduled_chat_messages "
                        + "(relation_id, sender_id, message_type, content, scheduled_at) "
                        + "values (:rid, :sid, 'TEXT', '예약된 메시지', :when)")
                .setParameter("rid", relationId).setParameter("sid", me)
                .setParameter("when", java.time.LocalDateTime.now().plusHours(1)).executeUpdate();
        // 공지 고정(V77) — message_id 가 chat_messages 를 참조하므로 먼저 메시지 하나를 심는다
        em.createNativeQuery("insert into chat_messages (relation_id, sender_id, message_type, content) "
                        + "values (:rid, :sid, 'TEXT', '고정할 메시지')")
                .setParameter("rid", relationId).setParameter("sid", me).executeUpdate();
        Number pinnedMsgId = (Number) em.createNativeQuery(
                        "select max(id) from chat_messages where relation_id = :rid")
                .setParameter("rid", relationId).getSingleResult();
        em.createNativeQuery("insert into chat_pinned_messages (relation_id, message_id, pinned_by, pinned_at) "
                        + "values (:rid, :mid, :sid, current_timestamp)")
                .setParameter("rid", relationId).setParameter("mid", pinnedMsgId.longValue())
                .setParameter("sid", me).executeUpdate();

        assertThat(count("places", relationId)).isEqualTo(1);
        assertThat(count("feed_posts", relationId)).isEqualTo(1);
        assertThat(count("trips", relationId)).isEqualTo(1);
        assertThat(count("scheduled_chat_messages", relationId)).isEqualTo(1);
        assertThat(count("chat_pinned_messages", relationId)).isEqualTo(1);

        relationService.endRelation(me, relationId);
        relationService.purgeRecords(me, relationId);
        em.flush();
        em.clear();

        assertThat(count("places", relationId)).isZero();
        assertThat(count("feed_posts", relationId)).isZero();
        assertThat(count("trips", relationId)).isZero();
        assertThat(count("scheduled_chat_messages", relationId)).isZero();
        assertThat(count("chat_pinned_messages", relationId)).isZero();
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

    /**
     * 관계 삭제가 돌려주는 목록에 음성 메시지·예약 전송 사진·운동 부스터 녹음이 들어 있어야 한다 —
     * 예전에는 빠져 있어 행만 지워지고 파일은 Cloudinary 에 남았다. 음성 메시지는 URL 이
     * image_url 이 아니라 content("{audioUrl}|{초}")에 있어서 컬럼만 훑어서는 안 보인다.
     */
    @Test
    @Transactional
    void 기록을_삭제하면_음성_메시지와_예약_사진과_부스터_녹음도_삭제_목록에_오른다() {
        Long me = register("purge-media-a@fitto.com");
        Long partner = register("purge-media-b@fitto.com");
        Long relationId = connect(me, partner);

        String voice = "https://res.cloudinary.com/demo/video/upload/v1/fitto/chat-voice/a.m4a";
        String scheduledImage = "https://res.cloudinary.com/demo/image/upload/v1/fitto/scheduled.jpg";
        String booster = "https://res.cloudinary.com/demo/video/upload/v1/fitto/voice/boost.m4a";
        em.createNativeQuery("insert into chat_messages (relation_id, sender_id, message_type, content) "
                        + "values (:rid, :sid, 'VOICE_MESSAGE', :content)")
                .setParameter("rid", relationId).setParameter("sid", me)
                .setParameter("content", voice + "|12").executeUpdate();
        em.createNativeQuery("insert into scheduled_chat_messages "
                        + "(relation_id, sender_id, message_type, image_url, scheduled_at) "
                        + "values (:rid, :sid, 'IMAGE', :url, :when)")
                .setParameter("rid", relationId).setParameter("sid", me).setParameter("url", scheduledImage)
                .setParameter("when", java.time.LocalDateTime.now().plusHours(1)).executeUpdate();
        em.createNativeQuery("insert into workout_boosters (relation_id, sender_id, receiver_id, audio_url) "
                        + "values (:rid, :sid, :recv, :url)")
                .setParameter("rid", relationId).setParameter("sid", me).setParameter("recv", partner)
                .setParameter("url", booster).executeUpdate();

        assertThat(relationRecordPurger.purge(relationId)).contains(voice, scheduledImage, booster);
    }

    /** 오디오는 /video/upload 자산이라 image/destroy 로 보내면 지워지지 않는다. */
    @Test
    void Cloudinary_URL_에서_리소스_종류를_읽는다() {
        assertThat(imageDeleter.extractResourceType(
                "https://res.cloudinary.com/demo/video/upload/v1/fitto/voice/a.m4a")).isEqualTo("video");
        assertThat(imageDeleter.extractResourceType(
                "https://res.cloudinary.com/demo/image/upload/v1/fitto/a.jpg")).isEqualTo("image");
        // 종류가 생략된 짧은 형식은 Cloudinary 기본값(image)
        assertThat(imageDeleter.extractResourceType(
                "https://res.cloudinary.com/demo/upload/fitto/a.jpg")).isEqualTo("image");
        assertThat(imageDeleter.extractPublicId(
                "https://res.cloudinary.com/demo/video/upload/v1712345678/fitto/voice/a.m4a"))
                .isEqualTo("fitto/voice/a");
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

    /**
     * 채팅 사진 → 식단 기록(LOVEBODY_REVIEW §2-5) 이후의 관계 영구 삭제 — 채팅 이미지는 전부 지울 대상으로
     * 넘어오지만, 식단(개인 데이터라 관계가 끝나도 남는다)이 쓰는 파일은 남고 <b>관계 안에서만</b> 쓰이던 파일만 지워진다.
     */
    @Test
    @Transactional
    void 관계를_영구_삭제해도_식단이_쓰는_채팅_사진은_남고_채팅에만_있던_사진만_지운다() {
        Long me = register("purge-c2m-a@fitto.com");
        Long partner = register("purge-c2m-b@fitto.com");
        Long relationId = connect(me, partner);
        String usedByMeal = "https://res.cloudinary.com/demo/image/upload/v1/fitto/purge-meal.jpg";
        String chatOnly = "https://res.cloudinary.com/demo/image/upload/v1/fitto/purge-chat-only.jpg";
        chatService.send(me, relationId, new SendMessageRequest(MessageType.IMAGE, null, usedByMeal, null, null, null));
        chatService.send(me, relationId, new SendMessageRequest(MessageType.IMAGE, null, chatOnly, null, null, null));
        mealService.save(me, new SaveMealRequest(LocalDate.now(), MealType.LUNCH, null, usedByMeal, 500,
                null, null, null, null, null, null, null));

        relationService.endRelation(me, relationId);
        java.util.List<String> returned = relationRecordPurger.purge(relationId);
        em.flush();

        assertThat(returned).contains(usedByMeal, chatOnly);
        assertThat(imageDeleter.deletable(java.util.List.of(usedByMeal, chatOnly))).containsExactly(chatOnly);
    }
}
