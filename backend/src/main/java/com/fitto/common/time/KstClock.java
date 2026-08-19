package com.fitto.common.time;

import java.time.LocalDate;
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
}
