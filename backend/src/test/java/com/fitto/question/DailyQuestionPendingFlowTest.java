package com.fitto.question;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.time.KstClock;
import com.fitto.question.domain.DailyAnswer;
import com.fitto.question.dto.AnswerRequest;
import com.fitto.question.dto.DailyQuestionResponse;
import com.fitto.question.dto.PendingQuestionResponse;
import com.fitto.question.repository.DailyAnswerRepository;
import com.fitto.question.service.DailyQuestionService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 한쪽만 답한 질문은 날이 바뀌어도 남는다 — 상대가 답한 날을 내가 넘겨도
 * "답을 기다리는 질문"으로 계속 보이고, 답하면 히스토리로 옮겨 간다.
 *
 * <p>지난 날짜는 KstClock 을 돌릴 수 없으므로 상대 답변 행을 저장소로 직접 심는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class DailyQuestionPendingFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    DailyQuestionService questionService;
    @Autowired
    DailyAnswerRepository answerRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false), "127.0.0.1").user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse rel = relationService.connectCouple(b, invite.code());
        return rel.id();
    }

    private void seed(Long coupleId, Long userId, LocalDate date, String question, String answer) {
        answerRepository.save(DailyAnswer.builder()
                .coupleId(coupleId).questionDate(date).userId(userId)
                .questionText(question).answer(answer).build());
    }

    @Test
    void 상대가_답한_지난_질문은_내게_기다리는_질문으로_남는다() {
        Long me = register("dq-a@fitto.com");
        Long partner = register("dq-b@fitto.com");
        Long coupleId = connectCouple(me, partner);
        LocalDate yesterday = KstClock.today().minusDays(1);
        LocalDate longAgo = KstClock.today().minusDays(10);
        seed(coupleId, partner, yesterday, "어제의 질문", "상대의 어제 답");
        seed(coupleId, partner, longAgo, "열흘 전 질문", "상대의 열흘 전 답");
        // 둘 다 답한 날은 기다리는 질문이 아니다
        LocalDate both = KstClock.today().minusDays(3);
        seed(coupleId, partner, both, "사흘 전 질문", "상대 답");
        seed(coupleId, me, both, "사흘 전 질문", "내 답");

        List<PendingQuestionResponse> pending = questionService.pending(me);
        assertThat(pending).extracting(PendingQuestionResponse::questionDate).containsExactly(yesterday, longAgo);
        assertThat(pending.get(0).question()).isEqualTo("어제의 질문");

        // 먼저 답한 쪽에게는 기다리는 질문이 아니다(상대를 기다리는 중)
        assertThat(questionService.pending(partner)).isEmpty();
        // 아직 히스토리에는 없다
        assertThat(questionService.history(me)).extracting(h -> h.questionDate()).containsExactly(both);
    }

    @Test
    void 지난_질문에_답하면_서로_공개되고_히스토리로_옮겨_간다() {
        Long me = register("dq-c@fitto.com");
        Long partner = register("dq-d@fitto.com");
        Long coupleId = connectCouple(me, partner);
        LocalDate yesterday = KstClock.today().minusDays(1);
        seed(coupleId, partner, yesterday, "어제의 질문", "상대의 어제 답");

        DailyQuestionResponse res = questionService.answer(me, new AnswerRequest("  늦었지만 내 답  ", yesterday));

        assertThat(res.questionDate()).isEqualTo(yesterday);
        assertThat(res.question()).isEqualTo("어제의 질문");   // 카탈로그가 아니라 상대 행의 스냅샷
        assertThat(res.myAnswer()).isEqualTo("늦었지만 내 답");
        assertThat(res.partnerAnswer()).isEqualTo("상대의 어제 답");
        assertThat(res.bothAnswered()).isTrue();
        assertThat(questionService.pending(me)).isEmpty();
        assertThat(questionService.history(partner)).singleElement()
                .satisfies(h -> assertThat(h.partnerAnswer()).isEqualTo("늦었지만 내 답"));
        // 오늘의 질문은 건드리지 않는다
        assertThat(questionService.today(me).myAnswer()).isNull();
    }

    @Test
    void 기다리는_질문이_아닌_지난_날짜에는_답할_수_없다() {
        Long me = register("dq-e@fitto.com");
        Long partner = register("dq-f@fitto.com");
        Long coupleId = connectCouple(me, partner);
        LocalDate yesterday = KstClock.today().minusDays(1);

        // 둘 다 안 답한 날
        assertThatThrownBy(() -> questionService.answer(me, new AnswerRequest("답", yesterday)))
                .isInstanceOf(BusinessException.class);
        // 미래
        assertThatThrownBy(() -> questionService.answer(me, new AnswerRequest("답", KstClock.today().plusDays(1))))
                .isInstanceOf(BusinessException.class);
        // 이미 답한 지난 날 — 상대가 읽은 답을 몰래 바꾸지 않는다
        seed(coupleId, partner, yesterday, "어제의 질문", "상대 답");
        questionService.answer(me, new AnswerRequest("첫 답", yesterday));
        assertThatThrownBy(() -> questionService.answer(me, new AnswerRequest("고친 답", yesterday)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 날짜를_보내지_않거나_오늘이면_예전처럼_오늘_질문에_답한다() {
        Long me = register("dq-g@fitto.com");
        Long partner = register("dq-h@fitto.com");
        connectCouple(me, partner);

        assertThat(questionService.answer(me, new AnswerRequest("오늘 답", null)).questionDate())
                .isEqualTo(KstClock.today());
        // 오늘 답은 고칠 수 있다(기존 동작)
        assertThat(questionService.answer(me, new AnswerRequest("고친 오늘 답", KstClock.today())).myAnswer())
                .isEqualTo("고친 오늘 답");
    }
}
