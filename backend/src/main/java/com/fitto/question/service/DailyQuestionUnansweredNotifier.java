package com.fitto.question.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.question.repository.DailyAnswerRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 오늘의 질문 미답변 저녁 리마인드 — 재방문 리마인드 3종 중 2번(2026-08 진단 리포트).
 * 즉시형 "오늘의 질문"(상대가 먼저 답했을 때 가는 알림, {@link DailyQuestionService#answer})
 * 과 달리, 아무도 먼저 답을 안 남긴 채 하루가 저물어갈 때 앱이 먼저 챙겨준다.
 *
 * <p>같은 제목("오늘의 질문")을 쓰면 상대가 방금 답해서 이미 알림을 받은 사람에게
 * 비슷한 문구가 또 가는 것처럼 보일 수 있어, 리마인드는 제목을 다르게 둔다.
 */
@Component
public class DailyQuestionUnansweredNotifier {

    private static final Logger log = LoggerFactory.getLogger(DailyQuestionUnansweredNotifier.class);

    private final RelationRepository relationRepository;
    private final DailyAnswerRepository answerRepository;
    private final NotificationService notificationService;

    public DailyQuestionUnansweredNotifier(RelationRepository relationRepository,
                                           DailyAnswerRepository answerRepository,
                                           NotificationService notificationService) {
        this.relationRepository = relationRepository;
        this.answerRepository = answerRepository;
        this.notificationService = notificationService;
    }

    /** 매일 20:00 KST — 21시 스트릭 위기 리마인드와 겹치지 않게 한 시간 앞에 둔다. */
    @Scheduled(cron = "0 0 20 * * *", zone = "Asia/Seoul")
    public void notifyUnanswered() {
        notifyUnanswered(KstClock.today());
    }

    /** 기준일을 받는 형태 — 테스트가 실제 날짜에 의존하지 않도록 분리했다. */
    @Transactional(readOnly = true)
    public void notifyUnanswered(LocalDate today) {
        List<Relation> couples = relationRepository.findAllActiveCouples();
        if (couples.isEmpty()) return;

        Set<Long> answered = new HashSet<>(answerRepository.findAnsweredUserIdsOn(today));

        int sent = 0;
        for (Relation couple : couples) {
            sent += notifyIfUnanswered(couple.getUserAId(), answered);
            sent += notifyIfUnanswered(couple.getUserBId(), answered);
        }
        log.info("오늘의 질문 미답변 리마인드 — 대상 커플 {}건, 발송 {}건", couples.size(), sent);
    }

    private int notifyIfUnanswered(Long userId, Set<Long> answered) {
        if (userId == null || answered.contains(userId)) return 0;
        notificationService.notify(userId, NotificationCategory.REMINDER,
                "오늘의 질문, 아직이에요", "답하면 서로의 마음을 볼 수 있어요 💬",
                Map.of("type", "question"));
        return 1;
    }
}
