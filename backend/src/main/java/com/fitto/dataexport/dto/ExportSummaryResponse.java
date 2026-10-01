package com.fitto.dataexport.dto;

import java.util.List;

/**
 * 내보내기 전 요약.
 *
 * @param coupled        연결된 커플이 있는가 — 없으면 개인 기록만 나간다
 * @param mediaCount     받을 파일 수(사진+음성)
 * @param estimatedBytes 예상 용량 — 장당 평균으로 잡은 어림값(저장공간 확인용)
 * @param remaining      이번 기간에 새로 시작할 수 있는 횟수(이어받기는 세지 않는다)
 * @param limit          기간당 횟수
 * @param period         한도 주기 — WEEK
 */
public record ExportSummaryResponse(boolean coupled, List<SectionCount> sections, long mediaCount,
                                    long estimatedBytes, Integer remaining, int limit, String period) {
}
