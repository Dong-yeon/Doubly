package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 백그라운드 AI 작업의 수명주기 — Redis 없이(인메모리 폴백) 돌린다.
 *
 * <p>여기서 지키는 것은 "결국 결과가 나온다"보다 <b>사용자가 영원히 기다리는 상태에 빠지지
 * 않는다</b>는 쪽이다. PENDING 에서 벗어나지 못하는 작업은 폴링하는 앱 입장에서 최악이다.
 */
class AiJobServiceTest {

    private final AiJobService service = newService();

    @SuppressWarnings("unchecked")
    private static AiJobService newService() {
        ObjectProvider<StringRedisTemplate> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null); // Redis 없음 → 인메모리 폴백
        return new AiJobService(provider, new ObjectMapper(), new SimpleMeterRegistry());
    }

    /** PENDING 을 벗어날 때까지 기다린다 — 못 벗어나면 그 자체가 실패다. */
    private AiJob awaitSettled(Long userId, String jobId) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(5));
        while (Instant.now().isBefore(deadline)) {
            AiJob job = service.poll(userId, jobId);
            if (job.status() != AiJob.Status.PENDING) {
                return job;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("작업이 PENDING 에서 벗어나지 못했다");
    }

    @Test
    void 제출은_즉시_돌아오고_결과는_나중에_채워진다() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        String jobId = service.submit(1L, "test", () -> {
            try {
                release.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return Map.of("letter", "고마워요");
        });

        // 아직 일이 끝나지 않았는데도 제출은 이미 반환됐다 — 이게 이 클래스의 존재 이유다
        assertThat(service.poll(1L, jobId).status()).isEqualTo(AiJob.Status.PENDING);

        release.countDown();
        AiJob done = awaitSettled(1L, jobId);
        assertThat(done.status()).isEqualTo(AiJob.Status.DONE);
        assertThat(done.resultJson()).contains("고마워요");
    }

    @Test
    void 작업이_실패하면_사용자에게_보여줄_코드와_문구가_남는다() throws Exception {
        String jobId = service.submit(1L, "test",
                () -> { throw new BusinessException(ErrorCode.AI_RATE_LIMITED); });

        AiJob failed = awaitSettled(1L, jobId);
        assertThat(failed.status()).isEqualTo(AiJob.Status.FAILED);
        assertThat(failed.errorCode()).isEqualTo(ErrorCode.AI_RATE_LIMITED.name());
        assertThat(failed.message()).isEqualTo(ErrorCode.AI_RATE_LIMITED.getMessage());
    }

    /*
     * BusinessException 이 아닌 오류(NPE 등)도 반드시 FAILED 로 떨어져야 한다.
     * 여기서 새면 작업이 PENDING 인 채로 남아 앱이 영원히 폴링한다.
     */
    @Test
    void 예상못한_오류도_PENDING_으로_남지_않는다() throws Exception {
        String jobId = service.submit(1L, "test",
                () -> { throw new IllegalStateException("어딘가 깨짐"); });

        AiJob failed = awaitSettled(1L, jobId);
        assertThat(failed.status()).isEqualTo(AiJob.Status.FAILED);
        assertThat(failed.errorCode()).isEqualTo(ErrorCode.AI_ANALYSIS_FAILED.name());
        // 내부 예외 메시지가 사용자에게 새지 않아야 한다
        assertThat(failed.message()).doesNotContain("어딘가 깨짐");
    }

    @Test
    void 남의_작업은_존재_여부조차_알려주지_않는다() {
        String jobId = service.submit(1L, "test", () -> "비밀");

        assertThatThrownBy(() -> service.poll(2L, jobId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_JOB_NOT_FOUND);
    }

    @Test
    void 없는_작업_id_는_찾을_수_없다() {
        assertThatThrownBy(() -> service.poll(1L, "존재하지-않는-id"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_JOB_NOT_FOUND);
    }
}
