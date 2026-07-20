package com.fitto.common.security;

import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import io.jsonwebtoken.Claims;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.List;

/**
 * STOMP 인증/인가 인터셉터.
 * <ul>
 *   <li>CONNECT: Authorization 헤더의 JWT 를 검증해 세션 Principal 을 설정한다.
 *       이후 @MessageMapping 에서 Principal 로 발신자를 식별한다.</li>
 *   <li>SUBSCRIBE: 관계별 채널(/sub/rooms/{id} 채팅, /sub/couple/{id} 커플 이벤트) 구독 시
 *       해당 관계의 <b>활성</b> 구성원인지 검증한다.
 *       (구성원 검사가 없으면 아무 로그인 사용자나 임의 relationId 를 구독해 남의 채팅·활동을 도청 가능,
 *        활성 검사가 없으면 연결을 끊은 상대가 계속 실시간 수신 가능)</li>
 * </ul>
 */
@Component
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    /**
     * 관계 소속을 강제해야 하는 구독 destination 접두어.
     * 두 채널 모두 relationId 로 스코프되므로 동일한 인가(구성원 + 활성)를 적용한다.
     * 여기 없는 destination(예: 개인 알림)은 이 인터셉터의 관심사가 아니다.
     */
    private static final List<String> RELATION_SCOPED_PREFIXES =
            List.of("/sub/rooms/", "/sub/couple/");

    private final JwtTokenProvider tokenProvider;
    private final RelationRepository relationRepository;

    public StompAuthChannelInterceptor(JwtTokenProvider tokenProvider,
                                       RelationRepository relationRepository) {
        this.tokenProvider = tokenProvider;
        this.relationRepository = relationRepository;
    }

    @Override
    public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticate(accessor);
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscription(accessor);
        }
        return message;
    }

    /** CONNECT — JWT 검증 후 세션 Principal 설정. */
    private void authenticate(StompHeaderAccessor accessor) {
        String token = resolveToken(accessor);
        if (token == null || !tokenProvider.isValidAccessToken(token)) {
            throw new IllegalArgumentException("유효하지 않은 인증 토큰입니다.");
        }
        Claims claims = tokenProvider.parse(token);
        AuthUser principal = tokenProvider.toAuthUser(claims);
        accessor.setUser(new StompPrincipal(principal.id(), principal.role().name()));
    }

    /** SUBSCRIBE — 관계 스코프 채널 구독 시 활성 구성원인지 검증. */
    private void authorizeSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        String prefix = relationScopedPrefix(destination);
        if (prefix == null) {
            return; // 관계 스코프 채널이 아니면 이 인터셉터의 관심사가 아니다.
        }
        Long userId = currentUserId(accessor);
        if (userId == null) {
            throw new IllegalArgumentException("인증되지 않은 구독 요청입니다.");
        }
        Long relationId = parseRelationId(destination, prefix);
        if (relationId == null) {
            throw new IllegalArgumentException("잘못된 구독 경로입니다.");
        }
        Relation relation = relationRepository.findById(relationId).orElse(null);
        if (relation == null || !relation.involves(userId)) {
            throw new IllegalArgumentException("이 채널을 구독할 권한이 없습니다.");
        }
        // 연결이 끊긴 뒤에도 구독이 유지되면 종료된 관계의 실시간 이벤트를 계속 수신할 수 있다.
        if (!relation.isActive()) {
            throw new IllegalArgumentException("연결이 끊긴 관계입니다.");
        }
    }

    /** destination 이 관계 스코프 채널이면 매칭된 접두어를, 아니면 null 을 돌려준다. */
    private String relationScopedPrefix(String destination) {
        if (destination == null) {
            return null;
        }
        return RELATION_SCOPED_PREFIXES.stream()
                .filter(destination::startsWith)
                .findFirst()
                .orElse(null);
    }

    private Long currentUserId(StompHeaderAccessor accessor) {
        Principal user = accessor.getUser();
        return (user instanceof StompPrincipal p) ? p.userId() : null;
    }

    /** "{prefix}{relationId}" 에서 relationId 파싱. 형식이 아니면 null. */
    private Long parseRelationId(String destination, String prefix) {
        String raw = destination.substring(prefix.length());
        // 하위 경로가 붙어 오는 경우 첫 세그먼트만 취한다.
        int slash = raw.indexOf('/');
        if (slash >= 0) {
            raw = raw.substring(0, slash);
        }
        try {
            return Long.valueOf(raw);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String resolveToken(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader(HEADER);
        if (header != null && header.startsWith(PREFIX)) {
            return header.substring(PREFIX.length());
        }
        return null;
    }
}
