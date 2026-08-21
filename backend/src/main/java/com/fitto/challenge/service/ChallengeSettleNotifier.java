package com.fitto.challenge.service;

import com.fitto.challenge.domain.CoupleChallenge;
import com.fitto.challenge.repository.CoupleChallengeRepository;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.repository.RelationRepository;
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
import java.util.List;

/**
 * 대결 종료 자동 판정 — 기간이 끝난 대결의 승자를 확정하고 양쪽에 결과를 알린다.
 *
 * <p><b>왜 필요한가</b>: 대결이 끝나도 아무 일도 일어나지 않아 클라이맥스가 없었다.
 * 시작(신청 푸시)만 있고 끝이 없으니 다시 붙자는 흐름도 생기지 않는다.
 *
 * <p>중복 발송은 {@code settled_at} 이 막는다 — 확정된 대결은 다음 실행에서 후보에
 * 들지 않는다. {@code CalendarDdayNotifier}·{@code MemoriesNotifier} 와 마찬가지로
 * <b>단일 인스턴스</b>를 가정한다(스케일아웃 시 세 스케줄러를 함께 잠금으로 감싸야 한다).
 *
 * <p>09:30 인 이유: 09:00 캘린더 D-day, 10:00 추억 리마인드 사이를 피해 아침 알림이
 * 한꺼번에 쏟아지지 않게 한다.
 */
@Component
public class ChallengeSettleNotifier {

    private static final Logger log = LoggerFactory.getLogger(ChallengeSettleNotifier.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final CoupleChallengeRepository challengeRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final ChallengeScorer scorer;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public ChallengeSettleNotifier(CoupleChallengeRepository challengeRepository,
                                   RelationRepository relationRepository,
                                   UserRepository userRepository,
                                   ChallengeScorer scorer,
                                   NotificationService notificationService,
                                   CoupleEventPublisher coupleEventPublisher) {
        this.challengeRepository = challengeRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.scorer = scorer;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /**
     * 매일 09:30 KST.
     *
     * <p>{@code @Transactional} 이 <b>여기에도</b> 필요하다. 아래 메서드를 같은 객체에서
     * 직접 부르면 프록시를 타지 않아 트랜잭션이 열리지 않고, 그러면 {@code settle()} 로
     * 바꾼 엔티티가 아무 데도 반영되지 않는다 — 매일 아침 같은 대결을 다시 알리게 된다.
     * (테스트는 프록시를 통해 아래 메서드를 부르므로 이 결함을 재현하지 못한다)
     */
    @Scheduled(cron = "0 30 9 * * *", zone = "Asia/Seoul")
    @Transactional
    public void settleEndedChallenges() {
        settleEndedChallenges(LocalDate.now(KST));
    }

    /** 기준일을 받는 형태 — 테스트가 실제 날짜에 의존하지 않도록 분리했다. */
    @Transactional
    public int settleEndedChallenges(LocalDate today) {
        List<CoupleChallenge> due = challengeRepository.findBySettledAtIsNullAndEndDateBefore(today);
        int settled = 0;
        for (CoupleChallenge challenge : due) {
            if (settle(challenge)) settled++;
        }
        if (settled > 0) {
            log.info("대결 종료 판정 — 대상 {}건, 발표 {}건 (기준일 {})", due.size(), settled, today);
        }
        return settled;
    }

    private boolean settle(CoupleChallenge challenge) {
        Relation couple = relationRepository.findById(challenge.getCoupleId()).orElse(null);
        /*
         * 헤어진 커플의 대결은 화면에서도 보이지 않는다 — 결과 발표도 하지 않는다.
         * 다만 settled_at 은 찍어 둔다. 안 그러면 이 행이 매일 후보로 다시 올라온다.
         */
        boolean active = couple != null && couple.getStatus() == RelationStatus.ACTIVE
                && couple.getUserBId() != null;
        if (!active) {
            challenge.settle(null, LocalDateTime.now());
            return false;
        }

        Long a = couple.getUserAId();
        Long b = couple.getUserBId();
        int scoreA = scorer.score(challenge, a);
        int scoreB = scorer.score(challenge, b);
        Long winner = scoreA == scoreB ? null : (scoreA > scoreB ? a : b);

        if (!challenge.settle(winner, LocalDateTime.now())) return false;

        notifyResult(challenge, a, b, scoreA, scoreB, winner);
        notifyResult(challenge, b, a, scoreB, scoreA, winner);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CHALLENGE);
        return true;
    }

    /**
     * 한 사람 시점의 결과 문구.
     *
     * <p>진 쪽에도 보낸다. 결과를 숨기면 이긴 쪽만 아는 대결이 되어 다시 붙을 이유가
     * 사라진다. 대신 문구에서 <b>패배를 나무라지 않는다</b> — 점수를 나란히 적고
     * 다시 하자는 말로 끝낸다(앱 전체의 강박 방지 원칙과 같은 선).
     */
    private void notifyResult(CoupleChallenge challenge, Long me, Long other,
                              int myScore, int otherScore, Long winner) {
        String scoreLine = challenge.getTitle() + " · " + myScore + " : " + otherScore
                + " (" + userName(other) + ")";
        String title;
        String body;
        if (winner == null) {
            title = "대결 무승부! 🤝";
            body = scoreLine + " — 비겼어요. 다시 한 판 어때요?";
        } else if (winner.equals(me)) {
            title = "대결 승리! 🏆";
            body = scoreLine + " — 이겼어요"
                    + (challenge.getStake() != null && !challenge.getStake().isBlank()
                    ? ". 내기: " + challenge.getStake() : "!");
        } else {
            title = "대결이 끝났어요";
            body = scoreLine + " — 이번엔 아쉬웠어요. 리매치 신청해볼까요?";
        }
        notificationService.notify(me, NotificationCategory.PARTNER, title, body,
                PushLinks.WORKOUT_CHALLENGE);
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
