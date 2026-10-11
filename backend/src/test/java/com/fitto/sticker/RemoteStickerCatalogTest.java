package com.fitto.sticker;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.AnimatedSticker;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.domain.StickerImage;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.sticker.domain.StickerPack;
import com.fitto.sticker.repository.StickerPackRepository;
import com.fitto.sticker.service.RemoteStickerCatalog;
import com.fitto.sticker.service.RemoteStickerCatalog.RemoteSticker;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 서버 배포 스티커(2026-10-01) — 카탈로그·파일·판정·미리보기가 서로 맞는지.
 *
 * <p>번들 카탈로그는 tsc 와 StickerPackSyncTest 가 지키지만, 서버 카탈로그는 JSON 파일이라
 * 어긋나도 아무것도 안 깨진다. 어긋나면 조용히 둘 중 하나가 된다: 앱에 <b>빈 말풍선</b>(파일 없음)이
 * 뜨거나, 팩이 시드에 없어 서버가 <b>판정 없이 통과</b>시킨다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RemoteStickerCatalogTest {

    @Autowired
    RemoteStickerCatalog catalog;
    @Autowired
    StickerPackRepository packRepository;
    @Autowired
    MockMvc mockMvc;
    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    ChatService chatService;

    private List<RemoteSticker> all() {
        return catalog.packs().stream().flatMap(p -> p.items().stream()).toList();
    }

    @Test
    void 카탈로그가_실린다() {
        assertThat(catalog.packs()).extracting(RemoteStickerCatalog.RemotePack::id)
                .containsExactly("ANIM_ALL", "ANIM_ANIMALS");
        assertThat(all()).isNotEmpty();
        assertThat(catalog.version()).hasSize(12);
    }

    @Test
    void 모든_파일이_있고_이름의_해시가_내용과_맞다() throws IOException {
        for (RemoteSticker s : all()) {
            for (String f : List.of(s.file(), s.thumb())) {
                ClassPathResource r = new ClassPathResource("sticker-assets/" + f);
                assertThat(r.exists()).as(s.code() + " → " + f).isTrue();
                // 이름의 해시가 내용과 다르면 1년 immutable 캐시가 낡은 그림을 계속 내준다
                String hash = sha256(r.getContentAsByteArray()).substring(0, 8);
                assertThat(f).as(s.code()).contains("." + hash + ".");
            }
            assertThat(s.label()).as(s.code()).isNotBlank();
        }
    }

    @Test
    void 번들_코드와_겹치지_않는다() {
        // 겹치면 앱·서버가 번들 쪽을 먼저 집어 서버 카탈로그 항목은 영영 안 쓰인다
        for (RemoteSticker s : all()) {
            assertThat(AnimatedSticker.from(s.code())).as(s.code()).isEmpty();
            assertThat(StickerImage.from(s.code())).as(s.code()).isEmpty();
        }
    }

    @Test
    void 팩은_전부_시드에_있고_지금은_무료다() {
        for (RemoteStickerCatalog.RemotePack p : catalog.packs()) {
            StickerPack pack = packRepository.findById(p.id()).orElse(null);
            assertThat(pack).as("시드에 없는 팩 — 서버가 판정 없이 통과시킨다: " + p.id()).isNotNull();
            // 움직이는 이모티콘은 전부 무료(AnimatedStickerTest 와 같은 결정). 유료를 올리면 여기를 고친다
            assertThat(pack.isProOnly()).as(p.id()).isFalse();
            assertThat(pack.getPrice()).as(p.id()).isZero();
        }
    }

    @Test
    void 파일은_인증_없이_1년_캐시로_내려간다() throws Exception {
        RemoteSticker s = all().get(0);
        mockMvc.perform(get(s.thumbUrl()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("immutable")));
        mockMvc.perform(get(s.url()))
                .andExpect(status().isOk());
        mockMvc.perform(get("/sticker-assets/없는파일.json"))
                .andExpect(status().isNotFound());
    }

    @Test
    void 카탈로그_API_는_경로와_라벨을_준다() throws Exception {
        String token = "Bearer " + authService.register(
                new RegisterRequest("rsc-api@fitto.com", "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").accessToken();
        RemoteSticker s = catalog.find("FRIEND_COUPLE_BEAR").orElseThrow();
        mockMvc.perform(get("/api/v1/stickers/catalog").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(catalog.version()))
                .andExpect(jsonPath("$.data.packs[?(@.id=='ANIM_ANIMALS')].items[0].code").value("FRIEND_COUPLE_BEAR"))
                .andExpect(jsonPath("$.data.packs[?(@.id=='ANIM_ANIMALS')].items[0].url").value(s.url()));
    }

    @Test
    void 서버_팩_스티커를_보내면_알림_미리보기에_라벨이_뜬다() {
        Long a = authService.register(new RegisterRequest("rsc-a@fitto.com", "password123", "가가", null, null, true, true, false),
                "127.0.0.1").user().id();
        Long b = authService.register(new RegisterRequest("rsc-b@fitto.com", "password123", "나나", null, null, true, true, false),
                "127.0.0.1").user().id();
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        Long relationId = relationService.connectCouple(b, invite.code()).id();

        ChatMessageResponse sent = chatService.send(a, relationId,
                new SendMessageRequest(MessageType.STICKER, "FRIEND_HI_BEAR", null, null, null, null));
        assertThat(sent.content()).isEqualTo("FRIEND_HI_BEAR");

        // 인용 미리보기는 알림 미리보기와 같은 preview() 를 쓴다 — 코드 글자가 새면 안 된다
        ChatMessageResponse reply = chatService.send(b, relationId,
                new SendMessageRequest(null, "귀엽다", null, null, null, sent.id()));
        assertThat(reply.replyTo().content()).isEqualTo("[이모티콘] 안녕 곰");
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
