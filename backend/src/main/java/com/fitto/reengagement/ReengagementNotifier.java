package com.fitto.reengagement;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.question.domain.DailyAnswer;
import com.fitto.question.repository.DailyAnswerRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.streak.domain.Streak;
import com.fitto.streak.domain.StreakType;
import com.fitto.streak.repository.StreakRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 재방문 리마인드 — 앱이 먼저 부르는 저녁 알림 3종.
 *
 * <p><b>왜 필요한가</b>: 즉시형 푸시는 20종이 넘는데 <b>앱이 먼저 부르는</b> 스케줄
 * 푸시는 캘린더 D-day 와 추억 리마인드 둘뿐이었다. 즉시형은 상대가 무언가 해야만
 * 울리므로, 둘 다 조용한 날에는 앱이 영영 자기 존재를 알리지 못한다.
 *
 * <p><b>하루에 한 사람당 최대 한 통.</b> 세 리마인드를 각각 스케줄러로 두면 어떤 날은
 * 세 통이 몰려 오는데, 그게 정확히 "알림 피로 → 전부 끄기 → 이탈"의 경로다. 그래서
 * 하나의 실행 안에서 우선순위대로 훑고 <b>이미 보낸 사람은 건너뛴다</b>.
 *
 * <table border="1">
 *   <caption>우선순위와 조건</caption>
 *   <tr><th>순위</th><th>리마인드</th><th>조건</th></tr>
 *   <tr><td>1</td><td>스트릭 위기</td><td>3일 이상 쌓였고 마지막 기록이 어제 (오늘 하면 이어짐)</td></tr>
 *   <tr><td>2</td><td>오늘의 질문 미답변</td><td>커플이 최근에 쓰던 기능인데 오늘 아직 안 답함</td></tr>
 *   <tr><td>3</td><td>혼자 가입자 초대 유도</td><td>커플 미연결 · 가입 1일차/3일차 (평생 최대 2회)</td></tr>
 * </table>
 *
 * <p><b>벌점은 없다.</b> 문구는 전부 응원·안내이고, 못 지킨 것을 지적하지 않는다
 * (앱 전체의 강박 방지 원칙과 같은 선). "끊겼습니다" 대신 "오늘 하면 이어져요"다.
 *
 * <p>21:00 인 이유: 아침 알림(캘린더 09:00 · 대결 09:30 · 추억 10:00)과 겹치지 않으면서,
 * 스트릭 위기는 <b>아직 오늘이 남아 있을 때</b> 알려야 의미가 있다.
 *
 * <p>{@code CalendarDdayNotifier}·{@code MemoriesNotifier} 와 마찬가지로 <b>단일 인스턴스</b>
 * 를 가정한다 — 스케일아웃 시 스케줄러들을 함께 잠금으로 감싸야 한다.
 */
@Component
public class ReengagementNotifier {

    private static final Logger log = LoggerFactory.getLogger(ReengagementNotifier.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /** 이 정도는 쌓여야 "지키고 있는 것"이 된다 — 1~2일에 알리면 그냥 잔소리다. */
    private static final int STREAK_AT_RISK_MIN = 3;

    /** 최근 이 기간 안에 답한 적 있는 커플에게만 질문 리마인드를 보낸다. */
    private static final int QUESTION_ENGAGED_DAYS = 14;

    /** 초대 유도를 보내는 가입 후 일수 — 이 둘뿐이라 평생 최대 2회다. */
    private static final int[] SOLO_NUDGE_DAYS = {1, 3};

    private final StreakRepository streakRepository;
    private final RelationRepository relationRepository;
    private final DailyAnswerRepository answerRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    public ReengagementNotifier(StreakRepository streakRepository,
                                RelationRepository relationRepository,
                                DailyAnswerRepository answerRepository,
                                UserRepository userRepository,
                                NotificationService notificationService) {
        this.streakRepository = streakRepository;
        this.relationRepository = relationRepository;
        this.answerRepository = answerRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    /** 매일 21:00 KST. */
    @Scheduled(cron = "0 0 21 * * *", zone = "Asia/Seoul")
    public void remind() {
        remind(LocalDate.now(KST), LocalDateTime.now());
    }

    /**
     * 기준 시각을 받는 형태 — 테스트가 실제 날짜에 의존하지 않도록 분리했다.
     *
     * @param today 오늘(KST) — 스트릭·질문 판정용
     * @param now   서버 벽시계 — 가입 경과 시간 판정용({@code created_at} 과 같은 시계여야 한다)
     * @return 발송한 사람 수
     */
    @Transactional(readOnly = true)
    public int remind(LocalDate today, LocalDateTime now) {
        Set<Long> sent = new HashSet<>();
        remindStreakAtRisk(today, sent);
        remindUnansweredQuestion(today, sent);
        remindSoloNewcomers(now, sent);
        if (!sent.isEmpty()) {
            log.info("재방문 리마인드 — 발송 {}명 (기준일 {})", sent.size(), today);
        }
        return sent.size();
    }

    /** ① 오늘 하면 이어지는 스트릭 — 운동을 먼저, 같은 사람이면 더 긴 쪽 하나만. */
    private void remindStreakAtRisk(LocalDate today, Set<Long> sent) {
        List<Streak> atRisk = streakRepository.findPersonalAtRisk(
                List.of(StreakType.PERSONAL, StreakType.PERSONAL_MEAL),
                today.minusDays(1), STREAK_AT_RISK_MIN);
        // 쿼리가 currentCount 내림차순이라, 한 사람에게 여러 건이 걸리면 가장 긴 것이 먼저 온다
        for (Streak streak : atRisk) {
            if (!sent.add(streak.getUserId())) continue;
            boolean workout = streak.getStreakType() == StreakType.PERSONAL;
            notificationService.notify(streak.getUserId(), NotificationCategory.REMINDER,
                    streak.getCurrentCount() + "일 연속 이어가는 중 🔥",
                    "오늘 " + (workout ? "운동을" : "식단을") + " 기록하면 "
                            + (streak.getCurrentCount() + 1) + "일째예요. 가볍게라도 남겨볼까요?",
                    workout ? PushLinks.WORKOUT : PushLinks.DIET);
        }
    }

    /**
     * ② 오늘의 질문 미답변.
     *
     * <p><b>쓰던 커플에게만 보낸다.</b> 한 번도 안 열어본 커플에게 매일 "질문에 답해보세요"
     * 를 보내면 그건 광고지 리마인드가 아니다. 상대가 오늘 이미 답했거나(=기다리는 중),
     * 최근 2주 안에 답한 적이 있으면 "쓰던 기능"으로 본다.
     */
    private void remindUnansweredQuestion(LocalDate today, Set<Long> sent) {
        for (Relation couple : relationRepository.findAllActiveCouples()) {
            List<DailyAnswer> answers = answerRepository
                    .findByCoupleIdAndQuestionDate(couple.getId(), today);
            if (answers.size() >= 2) continue;   // 둘 다 답함

            boolean recentlyEngaged = !answers.isEmpty()
                    || answerRepository.existsByCoupleIdAndQuestionDateGreaterThanEqual(
                    couple.getId(), today.minusDays(QUESTION_ENGAGED_DAYS));
            if (!recentlyEngaged) continue;

            Set<Long> answered = answers.stream().map(DailyAnswer::getUserId).collect(Collectors.toSet());
            for (Long userId : List.of(couple.getUserAId(), couple.getUserBId())) {
                if (answered.contains(userId) || !sent.add(userId)) continue;
                boolean partnerWaiting = !answers.isEmpty();
                notificationService.notify(userId, NotificationCategory.REMINDER,
                        "오늘의 질문이 남아 있어요",
                        partnerWaiting
                                ? "상대가 먼저 답했어요. 답하면 서로 볼 수 있어요!"
                                : "오늘 질문에 한 줄만 남겨볼까요?",
                        PushLinks.QUESTION);
            }
        }
    }

    /**
     * ③ 혼자 가입한 사람에게 "함께하면 열리는 것"을 알린다 — 가입 1일차·3일차 두 번뿐.
     *
     * <p>Doubly 는 둘이 연결돼야 대부분의 기능이 열리는데, 혼자 남은 사용자에게는
     * 그 사실을 알려줄 통로가 아예 없었다(K-factor 의 최대 공백).
     */
    private void remindSoloNewcomers(LocalDateTime now, Set<Long> sent) {
        for (int day : SOLO_NUDGE_DAYS) {
            // [가입 후 day일 ~ day+1일) 구간 — 하루에 정확히 한 구간에만 걸린다
            List<User> newcomers = userRepository.findSoloJoinedBetween(
                    now.minusDays(day + 1L), now.minusDays(day));
            for (User user : newcomers) {
                if (!sent.add(user.getId())) continue;
                notificationService.notify(user.getId(), NotificationCategory.REMINDER,
                        day == 1 ? "둘이 되면 열리는 것들 💌" : "아직 혼자 쓰고 계시네요",
                        "커플을 연결하면 함께 기록·오늘의 질문·커플 스트릭이 열려요. "
                                + "초대 링크 한 번이면 끝!",
                        PushLinks.COUPLE_CONNECT);
            }
        }
    }
}
