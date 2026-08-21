package com.fitto.common.time;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * "오늘"은 <b>한국 시간(KST)</b> 기준이어야 한다.
 *
 * <p>서버(Railway)는 UTC 로 돈다. 타임존을 지정하지 않은 {@code LocalDate.now()} 를 그대로
 * 쓰면 자정~오전 9시(KST) 사이에는 서버가 아직 "어제"라고 판단한다 — 사용자가 그 시간대에
 * 무언가를 기록해도(운동/식단 등) "오늘 기록"으로 잡히지 않고, 방금 저장한 게 아직 없는 것처럼
 * 보이는 버그로 이어진다. {@link com.fitto.common.plan.UsageCounter} 가 AI/사진 한도의 "오늘"에
 * 대해 이미 이 문제를 겪고 KST 로 고정해뒀던 것과 같은 이유로, "오늘 기록" 판정을 하는 모든
 * 서비스가 여기 한 곳을 통해 날짜를 얻는다.
 */
public final class KstClock {

    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private KstClock() {
    }

    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    /**
     * {@code fitto.storage-zone} 설정값 → 저장 TZ. 비어 있으면 JVM 기본 TZ.
     *
     * <p>{@code created_at} 류 {@code @CreatedDate} 컬럼은 {@code hibernate.jdbc.time_zone} 도
     * 컨테이너 {@code TZ} 도 지정된 곳이 없어 <b>JVM 기본 TZ 의 벽시계 그대로</b> 저장된다
     * (운영 Railway=UTC, 로컬 Windows=KST). "가입일로부터 D+N" 처럼 KST 날짜 경계와
     * 그 컬럼을 비교해야 하는 모든 곳이 같은 규칙으로 풀어야 어긋나지 않는다.
     */
    public static ZoneId storageZoneOf(String configured) {
        return (configured == null || configured.isBlank())
                ? ZoneId.systemDefault()
                : ZoneId.of(configured);
    }

    /**
     * KST 기준 하루의 시작을, {@code storage} TZ 벽시계 값(= DB 에 저장된 형태)과
     * 비교할 수 있는 {@link LocalDateTime} 으로 바꾼다. {@code MemoryDates.storageStartOfDay}
     * 와 같은 계산이다 — 추억 리마인드가 처음 겪은 문제를 여기로 옮겨 재사용한다.
     */
    public static LocalDateTime startOfKstDayInStorageZone(LocalDate kstDate, ZoneId storage) {
        return kstDate.atStartOfDay(ZONE).withZoneSameInstant(storage).toLocalDateTime();
    }
}
