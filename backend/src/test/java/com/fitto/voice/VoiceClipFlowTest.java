package com.fitto.voice;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.voice.domain.VoicePhrase;
import com.fitto.voice.dto.PartnerVoiceClipsResponse;
import com.fitto.voice.dto.SaveVoiceClipRequest;
import com.fitto.voice.dto.VoiceClipResponse;
import com.fitto.voice.service.VoiceClipService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/** 커플 음성 응원 통합 플로우 — 저장/재녹음/삭제/상대방 클립 조회. H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class VoiceClipFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    VoiceClipService voiceClipService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    @Test
    void 클립을_저장하고_조회한다() {
        Long user = register("v1@fitto.com");

        VoiceClipResponse saved = voiceClipService.save(user,
                new SaveVoiceClipRequest(VoicePhrase.REST_END, "https://res.cloudinary.com/x/video/upload/rest.m4a"));

        assertThat(saved.phrase()).isEqualTo(VoicePhrase.REST_END);
        assertThat(saved.phraseLabel()).isEqualTo("휴식 끝났을 때");
        assertThat(voiceClipService.mine(user)).hasSize(1);
    }

    @Test
    void 같은_문구를_다시_저장하면_교체된다() {
        Long user = register("v2@fitto.com");
        voiceClipService.save(user, new SaveVoiceClipRequest(VoicePhrase.PR, "https://res.cloudinary.com/x/video/upload/v1.m4a"));

        voiceClipService.save(user, new SaveVoiceClipRequest(VoicePhrase.PR, "https://res.cloudinary.com/x/video/upload/v2.m4a"));

        assertThat(voiceClipService.mine(user)).hasSize(1);
        assertThat(voiceClipService.mine(user).get(0).audioUrl()).endsWith("v2.m4a");
    }

    @Test
    void 문구_세_개를_따로_저장할_수_있다() {
        Long user = register("v3@fitto.com");
        voiceClipService.save(user, new SaveVoiceClipRequest(VoicePhrase.REST_END, "https://res.cloudinary.com/x/video/upload/a.m4a"));
        voiceClipService.save(user, new SaveVoiceClipRequest(VoicePhrase.PR, "https://res.cloudinary.com/x/video/upload/b.m4a"));
        voiceClipService.save(user, new SaveVoiceClipRequest(VoicePhrase.WORKOUT_COMPLETE, "https://res.cloudinary.com/x/video/upload/c.m4a"));

        assertThat(voiceClipService.mine(user)).hasSize(3);
    }

    @Test
    void 삭제하면_목록에서_빠진다() {
        Long user = register("v4@fitto.com");
        voiceClipService.save(user, new SaveVoiceClipRequest(VoicePhrase.REST_END, "https://res.cloudinary.com/x/video/upload/a.m4a"));

        voiceClipService.delete(user, VoicePhrase.REST_END);

        assertThat(voiceClipService.mine(user)).isEmpty();
    }

    @Test
    void 커플이면_상대방_클립을_조회할_수_있다() {
        long[] c = couple("v5@fitto.com", "v6@fitto.com");
        voiceClipService.save(c[1], new SaveVoiceClipRequest(VoicePhrase.WORKOUT_COMPLETE,
                "https://res.cloudinary.com/x/video/upload/complete.m4a"));

        PartnerVoiceClipsResponse partner = voiceClipService.partnerClips(c[0]);

        assertThat(partner.connected()).isTrue();
        assertThat(partner.clips()).hasSize(1);
        assertThat(partner.clips().get(0).phrase()).isEqualTo(VoicePhrase.WORKOUT_COMPLETE);
    }

    @Test
    void 상대방이_안_녹음했으면_빈_목록이다() {
        long[] c = couple("v7@fitto.com", "v8@fitto.com");

        PartnerVoiceClipsResponse partner = voiceClipService.partnerClips(c[0]);

        assertThat(partner.connected()).isTrue();
        assertThat(partner.clips()).isEmpty();
    }

    @Test
    void 커플이_아니면_연결_안됨으로_돌아온다() {
        Long solo = register("v9@fitto.com");

        PartnerVoiceClipsResponse partner = voiceClipService.partnerClips(solo);

        assertThat(partner.connected()).isFalse();
        assertThat(partner.clips()).isEmpty();
    }

    @Test
    void 내가_녹음한_클립은_상대방_조회에_안_섞인다() {
        long[] c = couple("v10@fitto.com", "v11@fitto.com");
        voiceClipService.save(c[0], new SaveVoiceClipRequest(VoicePhrase.PR, "https://res.cloudinary.com/x/video/upload/mine.m4a"));

        PartnerVoiceClipsResponse partner = voiceClipService.partnerClips(c[0]);

        // c[0] 본인이 녹음한 클립이지 c[1] 상대방 것이 아니므로 비어있어야 한다
        assertThat(partner.clips()).isEmpty();
    }
}
