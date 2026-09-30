package com.fitto.auth.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.security.RefreshTokenStore;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.notification.repository.DeviceTokenRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationMemberRepository;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 회원 탈퇴 — 유예기간을 둔 2단계 삭제 (AUTH-06, 2026-09-30).
 *
 * <p><b>왜 바로 지우지 않나</b>: 커플 공동 기록(피드·여행·채팅·사진)은 두 사람의 것인데,
 * 예전에는 한 명의 탈퇴가 상대에게 아무 예고 없이 그 전부를 즉시 영구 삭제했다.
 * 이제 탈퇴 요청은 삭제 예정 시각만 남기고, 상대에게 알려 남기고 싶은 것을 저장할 시간을 준다.
 *
 * <ul>
 *   <li>{@link #request} — 삭제 예정 표시 + 모든 세션·푸시 토큰 폐기 + 상대에게 알림</li>
 *   <li>{@link #cancelIfPending} — 유예기간 중 다시 로그인하면 탈퇴가 취소된다</li>
 *   <li>{@link #purgeIfDue} — 유예기간이 지나면 {@link AccountWithdrawalSweeper} 가 호출.
 *       실제 삭제는 예전 즉시 탈퇴와 같은 {@link #purge} 경로다</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class AccountWithdrawalService {

    private static final Logger log = LoggerFactory.getLogger(AccountWithdrawalService.class);

    private final UserRepository userRepository;
    private final UserDataPurger userDataPurger;
    private final CloudinaryImageDeleter imageDeleter;
    private final RefreshTokenStore refreshTokenStore;
    private final DeviceTokenRepository deviceTokenRepository;
    private final RelationRepository relationRepository;
    private final RelationMemberRepository relationMemberRepository;
    private final NotificationService notificationService;
    private final Duration gracePeriod;

    public AccountWithdrawalService(UserRepository userRepository,
                                    UserDataPurger userDataPurger,
                                    CloudinaryImageDeleter imageDeleter,
                                    RefreshTokenStore refreshTokenStore,
                                    DeviceTokenRepository deviceTokenRepository,
                                    RelationRepository relationRepository,
                                    RelationMemberRepository relationMemberRepository,
                                    NotificationService notificationService,
                                    @Value("${fitto.withdrawal.grace-period:P14D}") Duration gracePeriod) {
        this.userRepository = userRepository;
        this.userDataPurger = userDataPurger;
        this.imageDeleter = imageDeleter;
        this.refreshTokenStore = refreshTokenStore;
        this.deviceTokenRepository = deviceTokenRepository;
        this.relationRepository = relationRepository;
        this.relationMemberRepository = relationMemberRepository;
        this.notificationService = notificationService;
        this.gracePeriod = gracePeriod;
    }

    /**
     * 탈퇴 요청 — 삭제 예정 시각을 남기고 세션을 전부 끊는다.
     *
     * @return 삭제 예정일 (KST)
     */
    @Transactional
    public LocalDate request(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        boolean firstRequest = !user.isWithdrawalPending();
        user.scheduleWithdrawal(LocalDateTime.now().plus(gracePeriod));
        LocalDate scheduledDate = user.withdrawalScheduledDate();

        // 다시 로그인하기 전까지는 어느 기기에서도 이 계정으로 남아 있으면 안 된다
        refreshTokenStore.revokeAll(userId);
        // 떠난 사람에게 "상대가 기록을 남겼어요" 같은 푸시가 계속 가지 않게 — 로그인하면 앱이 다시 등록한다
        deviceTokenRepository.deleteAllByUserId(userId);

        if (firstRequest) {
            String when = scheduledDate.getMonthValue() + "월 " + scheduledDate.getDayOfMonth() + "일";
            notifyPartners(userId, user.getName() + "님이 탈퇴를 요청했어요",
                    when + "에 계정과 함께한 기록이 삭제돼요. 남기고 싶은 사진이 있다면 그 전에 저장해 두세요.");
        }
        return scheduledDate;
    }

    /**
     * 유예기간 중 로그인했으면 탈퇴를 취소한다. 로그인 경로(이메일·구글)가 발급 직전에 부른다.
     *
     * @return 취소했으면 true — 앱이 "탈퇴 요청을 취소했어요"를 알린다
     */
    @Transactional
    public boolean cancelIfPending(User user) {
        if (!user.cancelWithdrawal()) return false;
        userRepository.save(user);
        notifyPartners(user.getId(), user.getName() + "님이 탈퇴를 취소했어요",
                "함께한 기록은 그대로 남아 있어요.");
        return true;
    }

    /**
     * 유예기간이 끝난 계정을 영구 삭제한다 — 스위퍼 전용.
     *
     * <p>조회와 삭제 사이에 사용자가 로그인해 취소했을 수 있으므로 여기서 다시 확인한다.
     * 다중 인스턴스가 같은 계정을 동시에 집어도 두 번째는 사용자를 못 찾고 조용히 끝난다.
     *
     * @return 삭제했으면 true
     */
    @Transactional
    public boolean purgeIfDue(Long userId, LocalDateTime now) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null || !user.isWithdrawalPending()
                || user.getWithdrawalScheduledAt().isAfter(now)) {
            return false;
        }
        purge(user);
        return true;
    }

    /**
     * 계정 영구 삭제 — 예전의 즉시 탈퇴 본체. 테스트는 이걸로 FK 정리 순서를 검증한다.
     */
    @Transactional
    public void purgeNow(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        purge(user);
    }

    // ---- helpers ----

    private void purge(User user) {
        Long userId = user.getId();
        // 의존 데이터 정리 — 삭제 순서와 대상은 UserDataPurger 에 모여 있다.
        // (커플 콘텐츠까지 지우지 않으면 relations 삭제가 외래키 위반으로 실패한다)
        List<String> imageUrls = userDataPurger.purgeFor(userId);
        userRepository.delete(user);
        // 업로드된 이미지는 커밋 이후에 지운다 — DB 롤백이 나도 파일은 되돌릴 수 없기 때문
        imageDeleter.deleteAllAfterCommit(imageUrls);
        // 탈퇴 후에는 남은 리프레시 토큰으로 재로그인할 수 없도록 전부 폐기
        refreshTokenStore.revokeAll(userId);
        log.info("탈퇴 계정 영구 삭제: userId={}", userId);
    }

    /** 지금 연결된(ACTIVE) 관계의 상대 전원 — 커플·트레이너는 상대 1명, 패밀리는 나를 뺀 구성원. */
    private void notifyPartners(Long userId, String title, String body) {
        Set<Long> recipients = new LinkedHashSet<>();
        for (Relation relation : relationRepository.findAllByUser(userId)) {
            if (!relation.isActive()) continue;
            Long partner = relation.partnerOf(userId);
            if (partner != null) {
                recipients.add(partner);
            } else {
                relationMemberRepository.findByRelationIdOrderByJoinedAtAscIdAsc(relation.getId())
                        .forEach(m -> recipients.add(m.getUserId()));
            }
        }
        recipients.remove(userId);
        recipients.remove(null);
        for (Long recipient : recipients) {
            notificationService.notify(recipient, NotificationCategory.PARTNER, title, body, PushLinks.HOME);
        }
    }
}
