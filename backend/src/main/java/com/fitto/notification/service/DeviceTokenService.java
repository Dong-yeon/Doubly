package com.fitto.notification.service;

import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 디바이스 토큰 등록 관리 */
@Service
public class DeviceTokenService {

    private final DeviceTokenRepository deviceTokenRepository;

    public DeviceTokenService(DeviceTokenRepository deviceTokenRepository) {
        this.deviceTokenRepository = deviceTokenRepository;
    }

    /**
     * 사용자당 남겨 둘 토큰 수. 한 사람이 동시에 쓰는 기기(폰·태블릿·예비 폰)는 이보다 적다.
     * 넘는 것은 재설치·dev 빌드가 남긴 죽은 토큰이라 오래된 것부터 지운다.
     */
    static final int MAX_TOKENS_PER_USER = 5;

    /**
     * 토큰 등록 — 같은 토큰이 있으면 그 행을 현재 사용자로 갱신하고, 없으면 새로 넣는다.
     *
     * <p>예전엔 지우고 다시 넣었다. 그러면 같은 토큰의 등록이 동시에 들어올 때(권한 허용 직후와 로그인 직후가
     * 겹칠 때) 둘 다 지운 뒤 둘 다 넣다가 unique 위반이 났다. 갱신이면 한쪽만 넣는다.
     *
     * <p>등록 뒤 이 사용자의 토큰이 {@link #MAX_TOKENS_PER_USER} 개를 넘으면 오래 등록되지 않은 것부터 지운다
     * (docs/first-experience-audit.md #28 — 운영에서 한 사람에게 52개가 쌓였다). 기간으로 지우지 않는 건
     * 오래 접속하지 않은 사람에게 가는 재방문 알림까지 끊기 때문이다.
     */
    @Transactional
    public void register(Long userId, String token, String platform) {
        deviceTokenRepository.findByToken(token).ifPresentOrElse(
                existing -> existing.reRegister(userId, platform),
                () -> deviceTokenRepository.save(DeviceToken.builder()
                        .userId(userId)
                        .token(token)
                        .platform(platform)
                        .build()));
        deviceTokenRepository.flush();

        List<DeviceToken> mine = deviceTokenRepository.findByUserIdOrderByLastRegisteredAtDescIdDesc(userId);
        if (mine.size() > MAX_TOKENS_PER_USER) {
            deviceTokenRepository.deleteAll(mine.subList(MAX_TOKENS_PER_USER, mine.size()));
        }
    }

    /**
     * 로그아웃한 기기의 토큰을 지운다 — 그 기기로 이 계정 알림이 더 가지 않게.
     *
     * <p>토큰만으로 지우지 않고 사용자를 함께 건다. 토큰 값을 아는 다른 사람이 남의 기기 알림을
     * 끊을 수 없게 하기 위해서다. 그 사이 다른 계정이 같은 기기에 등록해 토큰이 넘어갔다면
     * 지울 행이 없어 아무 일도 일어나지 않는다(그게 맞다).
     */
    @Transactional
    public void unregister(Long userId, String token) {
        deviceTokenRepository.deleteByUserIdAndToken(userId, token);
    }

    /**
     * Expo 가 <b>DeviceNotRegistered</b> 로 거절한 토큰을 지운다.
     *
     * <p>앱 삭제·재설치·기기 교체를 하면 APNs/FCM 이 기존 토큰을 폐기하는데, 그 사실은
     * 발송을 해 봐야만 알 수 있다(등록 시점엔 멀쩡한 토큰이었다). 지우지 않으면 죽은
     * 토큰이 계정에 계속 쌓이고, 매 알림마다 무의미한 발송을 반복한다.
     *
     * <p>발송 스레드에서 트랜잭션 없이 불리므로 여기서 직접 연다 — 삭제 실패가 알림
     * 흐름을 막으면 안 되니 호출부가 예외를 삼킨다.
     */
    @Transactional
    public void removeDeadTokens(List<String> tokens) {
        tokens.forEach(deviceTokenRepository::deleteByToken);
    }
}
