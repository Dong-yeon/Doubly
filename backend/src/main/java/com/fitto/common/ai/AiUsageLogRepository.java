package com.fitto.common.ai;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@link AiUsageLog} 저장소. 지금은 <b>쓰기 전용</b>이다 — 집계는 운영에서 직접 질의한다
 * (어떤 축으로 볼지가 아직 굳지 않아 API 를 먼저 만들면 그 모양에 갇힌다).
 */
public interface AiUsageLogRepository extends JpaRepository<AiUsageLog, Long> {
}
