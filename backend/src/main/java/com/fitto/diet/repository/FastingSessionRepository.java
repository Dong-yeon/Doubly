package com.fitto.diet.repository;

import com.fitto.diet.domain.FastingSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FastingSessionRepository extends JpaRepository<FastingSession, Long> {

    Optional<FastingSession> findByUserIdAndEndedAtIsNull(Long userId);

    boolean existsByUserIdAndEndedAtIsNull(Long userId);

    /** 가장 최근 단식(진행 중 포함) — 되돌리기·시작 시각 겹침 판정·다음 플랜 제안 */
    Optional<FastingSession> findFirstByUserIdOrderByIdDesc(Long userId);

    /** 가장 최근에 끝난 단식 — 리포트의 "지난 단식 결과" */
    Optional<FastingSession> findFirstByUserIdAndEndedAtIsNotNullOrderByEndedAtDesc(Long userId);

    /** 이력 — 시작 시각이 from 이후인 단식, 최근 것부터 */
    List<FastingSession> findByUserIdAndStartedAtGreaterThanEqualOrderByStartedAtDesc(Long userId, LocalDateTime from);

    /** "최근에 단식해 본 적 있나" — 저녁 기록 뒤 시작 제안 대상 판정 */
    boolean existsByUserIdAndStartedAtGreaterThanEqual(Long userId, LocalDateTime from);

    /** 목표 도달 푸시 후보 — 진행 중이고 아직 안 보낸 단식. 진행 중 단식은 사람당 1개라 전체 수가 작다. */
    List<FastingSession> findByEndedAtIsNullAndTargetNotifiedAtIsNull();
}
