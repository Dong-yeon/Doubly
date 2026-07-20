package com.fitto.relation.dto;

/**
 * 지난 기록 불러오기 결과 (REL-07).
 *
 * @param status    WAITING_PARTNER = 내 요청만 접수됨(상대 동의 대기) / RESTORED = 복원 완료
 * @param movedCount 복원된 기록 수 (WAITING_PARTNER 이면 0)
 */
public record RestoreRecordsResponse(Status status, int movedCount) {

    public enum Status {
        /** 내 요청은 접수됐고, 상대가 동의하면 복원된다 */
        WAITING_PARTNER,
        /** 양쪽 동의가 모여 복원이 완료됐다 */
        RESTORED
    }

    public static RestoreRecordsResponse waiting() {
        return new RestoreRecordsResponse(Status.WAITING_PARTNER, 0);
    }

    public static RestoreRecordsResponse restored(int movedCount) {
        return new RestoreRecordsResponse(Status.RESTORED, movedCount);
    }
}
