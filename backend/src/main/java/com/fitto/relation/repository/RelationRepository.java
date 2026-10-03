package com.fitto.relation.repository;

import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RelationRepository extends JpaRepository<Relation, Long> {

    Optional<Relation> findByInviteCode(String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    /**
     * 코드의 초대자만 먼저 읽는다 — 엔티티를 영속성 컨텍스트에 올리지 않기 위해서다.
     * 연결은 두 사용자를 잠근 <b>뒤에</b> 관계 행을 읽어야 하는데, 잠그기 전에 엔티티로 읽어 두면
     * 잠금 뒤 재조회가 1차 캐시의 낡은 값을 돌려준다.
     */
    @Query("select r.userAId from Relation r where r.inviteCode = :code")
    Optional<Long> findInviterByInviteCode(@Param("code") String code);

    /** 행 잠금 조회 — 커플 연결 직렬화용. 잠금 대기 중 상대가 연결해 코드가 비워졌으면 empty. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Relation r where r.inviteCode = :code")
    Optional<Relation> findByInviteCodeForUpdate(@Param("code") String code);

    /** 이 사용자가 낸 대기 중 커플 초대 — 최신이 앞. 재발급 시 같은 행을 다시 쓰기 위해 본다. */
    @Query("""
            select r from Relation r
            where r.relationType = com.fitto.relation.domain.RelationType.COUPLE
              and r.status = com.fitto.relation.domain.RelationStatus.PENDING
              and r.userAId = :userId
            order by r.id desc
            """)
    List<Relation> findPendingCoupleInvites(@Param("userId") Long userId);

    /**
     * 이 사용자가 낸 대기 중 커플 초대의 코드를 전부 무효화한다({@code keepId} 제외).
     *
     * <p>예전엔 "새 코드 만들기"마다 PENDING 행이 새로 생기고 옛 코드도 24시간 그대로 살아 있어서,
     * 이미 연결된 사람의 옛 코드로 제3자가 연결해 <b>활성 커플 두 개</b>가 생길 수 있었다.
     * 행은 지우지 않는다 — relation_members 가 매달려 있고, 코드만 비우면 다시 쓰일 길이 없다.
     *
     * <p>flushAutomatically: 같은 트랜잭션에서 바뀐 엔티티(재발급한 코드 등)를 먼저 내보낸다.
     * clearAutomatically 는 쓰지 않는다 — 호출자가 들고 있는 관계 엔티티가 분리되면 그 뒤 변경이 사라진다.
     */
    @Modifying(flushAutomatically = true)
    @Query("""
            update Relation r set r.inviteCode = null, r.codeExpiresAt = null
            where r.relationType = com.fitto.relation.domain.RelationType.COUPLE
              and r.status = com.fitto.relation.domain.RelationStatus.PENDING
              and r.userAId = :userId and r.id <> :keepId
            """)
    int clearOtherCoupleInvites(@Param("userId") Long userId, @Param("keepId") Long keepId);

    /**
     * 내가 속한 관계 전체.
     * A/B 슬롯 외에 relation_members 멤버십도 본다 — FAMILY 는 3번째 이후 멤버가
     * A/B 컬럼에 존재하지 않는다. (커플/트레이너는 이중 기록이라 어느 쪽으로도 잡힌다)
     */
    @Query("""
            select r from Relation r
            where r.userAId = :userId or r.userBId = :userId
               or r.id in (select m.relationId from RelationMember m where m.userId = :userId)
            """)
    List<Relation> findAllByUser(@Param("userId") Long userId);

    /** 멤버십 기준 특정 유형·상태의 관계 — FAMILY 소속 조회용 */
    @Query("""
            select r from Relation r
            where r.relationType = :type and r.status = :status
              and r.id in (select m.relationId from RelationMember m where m.userId = :userId)
            """)
    List<Relation> findByMemberAndTypeAndStatus(@Param("userId") Long userId,
                                                @Param("type") RelationType type,
                                                @Param("status") RelationStatus status);

    /** 내가 속한 특정 유형·상태의 관계 (예: 활성 커플 중복 방지) */
    @Query("""
            select r from Relation r
            where r.relationType = :type and r.status = :status
              and (r.userAId = :userId or r.userBId = :userId)
            """)
    List<Relation> findByUserAndTypeAndStatus(@Param("userId") Long userId,
                                              @Param("type") RelationType type,
                                              @Param("status") RelationStatus status);

    /** 요청자(userA) 기준 특정 유형·상태 관계 수 — 트레이너 회원 정원 체크 */
    @Query("""
            select count(r) from Relation r
            where r.relationType = :type and r.status = :status and r.userAId = :userAId
            """)
    long countByUserAAndTypeAndStatus(@Param("userAId") Long userAId,
                                      @Param("type") RelationType type,
                                      @Param("status") RelationStatus status);

    /**
     * 같은 두 사람 사이의 종료된 커플 관계 — 지난 기록 불러오기 대상 (REL-07).
     * A/B 슬롯 순서는 누가 초대했느냐에 따라 달라지므로 양방향으로 찾는다.
     * 여러 번 만나고 헤어졌다면 가장 최근 것이 앞에 온다.
     */
    @Query("""
            select r from Relation r
            where r.relationType = com.fitto.relation.domain.RelationType.COUPLE
              and r.status = com.fitto.relation.domain.RelationStatus.ENDED
              and ((r.userAId = :one and r.userBId = :other)
                or (r.userAId = :other and r.userBId = :one))
            order by r.id desc
            """)
    List<Relation> findEndedCoupleBetween(@Param("one") Long one, @Param("other") Long other);

    /**
     * 불러오기 요청 슬롯 원자적 선점 — 비어 있을 때만 내 id 를 기록한다.
     *
     * <p>읽고-판단하고-쓰는 방식은 양쪽이 동시에 요청하면 둘 다 null 을 읽어 서로를
     * 덮어쓰고 둘 다 WAITING 이 된다(합의가 성립했는데 복원이 실행되지 않음).
     * 조건부 UPDATE 는 DB 가 행 단위로 직렬화하므로 정확히 한 쪽만 1 을 받고,
     * 진 쪽은 0 을 받아 "상대가 이미 요청했음"을 알 수 있다.
     *
     * <p>clearAutomatically: 이 UPDATE 는 영속성 컨텍스트를 우회하므로, 이후 같은
     * 트랜잭션의 재조회가 낡은 1차 캐시 대신 DB 의 최신 값을 읽게 컨텍스트를 비운다.
     */
    @Modifying(clearAutomatically = true)
    @Query("""
            update Relation r set r.restoreRequestedBy = :userId
            where r.id = :id and r.restoreRequestedBy is null
            """)
    int claimRestoreRequest(@Param("id") Long id, @Param("userId") Long userId);

    /**
     * 행 잠금 재조회 (SELECT ... FOR UPDATE) — 복원 실행·완전삭제 직렬화용.
     * 잠금 대기 중 상대 트랜잭션이 행을 지웠으면 empty 를 돌려준다
     * (복원과 삭제가 동시에 돌아 이동·삭제가 뒤섞이는 것을 막는다).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Relation r where r.id = :id")
    Optional<Relation> findByIdForUpdate(@Param("id") Long id);

    /**
     * 활성 커플 전체 — 스케줄러(재방문 리마인드)가 매일 한 번 훑는다.
     * 아직 상대가 연결되지 않은 관계(userBId is null)는 "커플"이 아니라 제외한다.
     */
    @Query("""
            select r from Relation r
            where r.relationType = com.fitto.relation.domain.RelationType.COUPLE
              and r.status = com.fitto.relation.domain.RelationStatus.ACTIVE
              and r.userBId is not null
            """)
    List<Relation> findAllActiveCouples();

    /** 회원 탈퇴 시 본인이 속한 모든 관계 삭제 */
    @Modifying
    @Query("delete from Relation r where r.userAId = :userId or r.userBId = :userId")
    void deleteAllByUser(@Param("userId") Long userId);
}
