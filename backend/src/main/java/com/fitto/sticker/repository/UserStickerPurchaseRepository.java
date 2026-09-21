package com.fitto.sticker.repository;

import com.fitto.sticker.domain.UserStickerPurchase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserStickerPurchaseRepository extends JpaRepository<UserStickerPurchase, Long> {

    boolean existsByUserIdAndStickerPackId(Long userId, String stickerPackId);

    Optional<UserStickerPurchase> findByUserIdAndStickerPackId(Long userId, String stickerPackId);

    /**
     * 이 사람들이 가진 팩 id 전부 — 커플 두 명을 한 번에 본다(N+1 방지).
     *
     * <p>스티커 한 장 보낼 때마다 도는 질의라 팩 id 만 뽑는다. {@code (user_id, pack_id)}
     * unique 인덱스를 그대로 타므로 행을 읽지 않고 인덱스만으로 끝난다.
     */
    @Query("select p.stickerPackId from UserStickerPurchase p where p.userId in :userIds")
    List<String> findPackIdsByUserIds(@Param("userIds") List<Long> userIds);

    void deleteByUserId(Long userId);
}
