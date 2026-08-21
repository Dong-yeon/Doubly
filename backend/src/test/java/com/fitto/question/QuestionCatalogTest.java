package com.fitto.question;

import com.fitto.question.domain.QuestionCatalog;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 오늘의 질문 콘텐츠 — 2026-08 진단 리포트가 지목한 "30개 순환(한 달이면 소진)" 해소.
 *
 * <p>스프링 컨텍스트가 필요 없는 순수 계산이라 단위 테스트로 둔다.
 */
class QuestionCatalogTest {

    @Test
    void 질문은_200개_이상이다() {
        assertThat(QuestionCatalog.size()).isGreaterThanOrEqualTo(200);
    }

    @Test
    void 같은_날짜에는_항상_같은_질문이_나온다() {
        LocalDate date = LocalDate.of(2026, 8, 21);
        assertThat(QuestionCatalog.questionFor(date)).isEqualTo(QuestionCatalog.questionFor(date));
    }

    /** 순환 주기 안에서는 같은 질문이 두 번 나오지 않아야 한다 — 목록에 중복이 없다는 뜻. */
    @Test
    void 한_주기_동안_질문이_반복되지_않는다() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < QuestionCatalog.size(); i++) {
            assertThat(seen.add(QuestionCatalog.questionFor(start.plusDays(i))))
                    .as("%d일째 질문이 중복", i)
                    .isTrue();
        }
    }

    @Test
    void 다음_주기의_같은_자리는_같은_질문이다() {
        LocalDate day = LocalDate.of(2026, 1, 1);
        assertThat(QuestionCatalog.questionFor(day.plusDays(QuestionCatalog.size())))
                .isEqualTo(QuestionCatalog.questionFor(day));
    }
}
