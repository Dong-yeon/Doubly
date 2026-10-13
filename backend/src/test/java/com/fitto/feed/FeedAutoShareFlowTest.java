package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.UpdatePostRequest;
import com.fitto.feed.service.FeedService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 일상 자동 공유 — 올리는 순간 커플 채팅에 FEED_CARD(첫 사진 + 글)가 남고, 고치면 따라 바뀌고, 지우면 삭제 표시된다.
 * 식단(MealAutoShareFlowTest)과 같은 결정이다.
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedAutoShareFlowTest {

    private static final String P1 = "https://res.cloudinary.com/demo/image/upload/day1.jpg";
    private static final String P2 = "https://res.cloudinary.com/demo/image/upload/day2.jpg";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired FeedService feedService;
    @Autowired ChatService chatService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private RelationResponse connect(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        return relationService.connectCouple(b, invite.code());
    }

    @Test
    void 올리면_채팅에_첫_사진과_글이_카드로_남는다() {
        Long a = register("fs1@fitto.com");
        Long b = register("fs2@fitto.com");
        RelationResponse couple = connect(a, b);

        feedService.createPost(a, new CreatePostRequest("한강 다녀왔어", null, List.of(P1, P2), null));

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        ChatMessageResponse card = messages.get(0);
        assertThat(card.messageType()).isEqualTo(MessageType.FEED_CARD);
        assertThat(card.senderId()).isEqualTo(a);
        assertThat(card.imageUrl()).isEqualTo(P1);
        assertThat(card.content()).isEqualTo("한강 다녀왔어");
    }

    @Test
    void 사진만_올리면_본문은_사진_장수다() {
        Long a = register("fs3@fitto.com");
        Long b = register("fs4@fitto.com");
        RelationResponse couple = connect(a, b);

        feedService.createPost(a, new CreatePostRequest(null, null, List.of(P1, P2), null));

        assertThat(chatService.getMessages(b, couple.id(), null).get(0).content()).isEqualTo("사진 2장");
    }

    @Test
    void 고치면_카드의_글과_사진이_따라_바뀐다() {
        Long a = register("fs5@fitto.com");
        Long b = register("fs6@fitto.com");
        RelationResponse couple = connect(a, b);

        FeedItemResponse post = feedService.createPost(a, new CreatePostRequest("처음 글", null, List.of(P1), null));
        feedService.updatePost(a, post.refId(), new UpdatePostRequest("고친 글", List.of(), null));

        ChatMessageResponse card = chatService.getMessages(b, couple.id(), null).get(0);
        assertThat(card.content()).isEqualTo("고친 글");
        // 뺀 사진을 카드가 들고 있으면 삭제기가 파일을 남긴다
        assertThat(card.imageUrl()).isNull();
        assertThat(card.edited()).isFalse();
    }

    @Test
    void 지우면_카드는_삭제_표시되고_삭제가_막히지_않는다() {
        Long a = register("fs7@fitto.com");
        Long b = register("fs8@fitto.com");
        RelationResponse couple = connect(a, b);

        FeedItemResponse post = feedService.createPost(a, new CreatePostRequest("지울 글", null, List.of(P1), null));
        // chat_messages.feed_post_id → feed_posts FK(V141) — 카드를 정리하지 않으면 여기서 위반이 난다
        feedService.deletePost(a, post.refId());

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).deleted()).isTrue();
        assertThat(messages.get(0).imageUrl()).isNull();
    }

    @Test
    void 기록_삭제가_카드가_있어도_막히지_않는다() {
        Long a = register("fs9@fitto.com");
        Long b = register("fs10@fitto.com");
        RelationResponse couple = connect(a, b);

        feedService.createPost(a, new CreatePostRequest("남길 글", null, List.of(P1), null));
        relationService.endRelation(a, couple.id());
        // RelationRecordPurger 는 feed_posts 를 chat_messages 보다 먼저 지운다 — 참조를 먼저 끊지 않으면 FK 위반
        assertThatCode(() -> relationService.purgeRecords(a, couple.id())).doesNotThrowAnyException();
    }
}
