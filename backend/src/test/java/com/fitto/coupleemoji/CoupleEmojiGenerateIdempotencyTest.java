package com.fitto.coupleemoji;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.ai.AiJobService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.security.AuthUser;
import com.fitto.user.domain.Role;
import com.fitto.coupleemoji.controller.CoupleEmojiController;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import com.fitto.coupleemoji.dto.GenerateCoupleEmojiRequest;
import com.fitto.coupleemoji.service.CoupleEmojiService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 같은 요청 키로 두 번 와도 <b>한 번만 차감</b>한다(docs/EMOJI_12_REGEN_2026-10-13.md §1-3).
 *
 * <p>회귀 방지: 생성 요청에 멱등키가 없어 더블탭·네트워크 재시도가 서버에 두 번 닿으면 세트가 두 번 차감되고 두 번 그려졌다.
 * 서비스는 목, {@link AiJobService} 는 진짜(Redis 없이 인메모리 폴백)로 컨트롤러의 접수 순서를 본다.
 */
class CoupleEmojiGenerateIdempotencyTest {

    private static final String SOURCE = "https://res.cloudinary.com/demo/image/upload/v1/fitto/emoji-source/a.jpg";
    private static final AuthUser USER = new AuthUser(7L, Role.USER);

    private final CoupleEmojiService service = mock(CoupleEmojiService.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<StringRedisTemplate> noRedis = mock(ObjectProvider.class);
    private final AiJobService jobs = new AiJobService(noRedis, new ObjectMapper(), new SimpleMeterRegistry());
    private final CoupleEmojiController controller = new CoupleEmojiController(service, jobs);

    private GenerateCoupleEmojiRequest request(String requestId) {
        return new GenerateCoupleEmojiRequest(SOURCE, null, List.of(CoupleEmojiEmotion.HAPPY), requestId);
    }

    private CoupleEmojiService.GenerationTicket ticket() {
        return new CoupleEmojiService.GenerationTicket(1L, 7L, 8L, SOURCE, List.of(CoupleEmojiEmotion.HAPPY),
                PlanGuard.Charge.CREDIT);
    }

    @Test
    void 같은_요청_키는_한_번만_차감하고_같은_작업을_돌려준다() {
        when(service.prepare(eq(7L), any())).thenReturn(ticket());

        String first = controller.generate(USER, request("req-abcdef12")).data().jobId();
        String second = controller.generate(USER, request("req-abcdef12")).data().jobId();

        assertThat(second).isEqualTo(first);
        verify(service, times(1)).prepare(eq(7L), any());
        // 같은 본문을 다시 보낸 것 — 원본은 먼저 온 작업의 것이라 건드리지 않는다
        verify(service, never()).discardSource(any());
    }

    /** 앱은 누를 때마다 사진을 새로 올린다 — 두 번째가 올린 원본은 쓰이지 않으니 치운다("사진은 저장하지 않아요"). */
    @Test
    void 두_번째_요청이_새로_올린_원본은_치운다() {
        when(service.prepare(eq(7L), any())).thenReturn(ticket());
        String second = SOURCE.replace("a.jpg", "b.jpg");

        String first = controller.generate(USER, request("req-twice-001")).data().jobId();
        String again = controller.generate(USER,
                new GenerateCoupleEmojiRequest(second, null, List.of(CoupleEmojiEmotion.HAPPY), "req-twice-001"))
                .data().jobId();

        assertThat(again).isEqualTo(first);
        verify(service).discardSource(second);
        verify(service, never()).discardSource(SOURCE);
    }

    @Test
    void 거절된_요청은_같은_키로_다시_시도할_수_있다() {
        when(service.prepare(eq(7L), any()))
                .thenThrow(new BusinessException(ErrorCode.PLAN_UPGRADE_REQUIRED))
                .thenReturn(ticket());

        assertThatThrownBy(() -> controller.generate(USER, request("req-retry-0001")))
                .isInstanceOf(BusinessException.class);
        // 크레딧을 사고 다시 누르면 같은 키라도 접수된다
        assertThat(controller.generate(USER, request("req-retry-0001")).data().jobId()).isNotBlank();
        verify(service, times(2)).prepare(eq(7L), any());
    }

    @Test
    void 키가_다르거나_없으면_각각_접수한다() {
        when(service.prepare(eq(7L), any())).thenReturn(ticket());

        String a = controller.generate(USER, request("req-aaaaaaaa")).data().jobId();
        String b = controller.generate(USER, request("req-bbbbbbbb")).data().jobId();
        controller.generate(USER, request(null));
        controller.generate(USER, request(null));

        assertThat(a).isNotEqualTo(b);
        verify(service, times(4)).prepare(eq(7L), any());
    }

    /** 다시 그리기도 같은 키면 세트 잔량을 한 번만 쓴다 — 세 번뿐인 횟수가 더블탭에 날아가면 안 된다. */
    @Test
    void 다시_그리기도_같은_키는_한_번만_쓴다() {
        CoupleEmojiService.RegenTicket ticket = new CoupleEmojiService.RegenTicket(
                1L, 7L, "batch-1", CoupleEmojiEmotion.HAPPY, 10L, 8L, SOURCE, "facts", true);
        when(service.prepareRegen(7L, "batch-1", CoupleEmojiEmotion.HAPPY)).thenReturn(ticket);
        var request = new com.fitto.coupleemoji.dto.RegenerateCoupleEmojiRequest(CoupleEmojiEmotion.HAPPY, "regen-key-01");

        String first = controller.regenerate(USER, "batch-1", request).data().jobId();
        String second = controller.regenerate(USER, "batch-1", request).data().jobId();

        assertThat(second).isEqualTo(first);
        verify(service, times(1)).prepareRegen(7L, "batch-1", CoupleEmojiEmotion.HAPPY);
    }

    @Test
    void 접수_중인_같은_키는_409() {
        assertThat(jobs.claimRequest(7L, "couple-emoji", "req-pending-1", "other-source")).isEmpty();

        assertThatThrownBy(() -> controller.generate(USER, request("req-pending-1")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_REQUEST_IN_PROGRESS);
    }
}
