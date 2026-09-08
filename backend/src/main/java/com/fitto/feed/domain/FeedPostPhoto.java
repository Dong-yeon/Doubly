package com.fitto.feed.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 일상 포스트의 사진 한 장 — {@link FeedPost} 는 여러 장을 가질 수 있다.
 *
 * <p>{@link FeedPost#getImageUrl()}(대표/첫 사진)은 그대로 두고, 이 테이블은
 * <b>전체 목록</b>만 추가로 담는다 — {@code order_no} 0번이 항상 대표 사진과 같은 URL이다
 * (중복 저장이지만, 기존 쿼리를 하나도 안 건드리려고 의도한 것 — V79 참고).
 *
 * <p>포스트는 수정 API가 없다(작성 후 삭제만 가능) — 그래서 이 엔티티도 생성 시점에만
 * 쓰고 이후 갱신하지 않는다. {@link FeedPost} 와 JPA 연관관계로 묶지 않은 이유도 같다 —
 * 양방향 컬렉션이 필요한 건 "수정 시 통째로 교체"할 때뿐이다.
 */
@Entity
@Table(name = "feed_post_photos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FeedPostPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @Column(nullable = false, length = 500)
    private String url;

    @Column(name = "order_no", nullable = false)
    private int orderNo;

    @Builder
    private FeedPostPhoto(Long postId, String url, int orderNo) {
        this.postId = postId;
        this.url = url;
        this.orderNo = orderNo;
    }
}
