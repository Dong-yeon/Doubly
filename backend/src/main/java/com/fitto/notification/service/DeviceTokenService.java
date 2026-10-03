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

    /** 토큰 등록 — 동일 토큰이 있으면 현재 사용자로 재할당. */
    @Transactional
    public void register(Long userId, String token, String platform) {
        deviceTokenRepository.deleteByToken(token);
        deviceTokenRepository.save(DeviceToken.builder()
                .userId(userId)
                .token(token)
                .platform(platform)
                .build());
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
