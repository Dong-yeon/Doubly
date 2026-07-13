package com.fitto.place.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 커플 맛집/장소 핀 — PLAN.md Place Map. 커플(relations) 단위 공유.
 */
@Entity
@Table(name = "places")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Place {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(columnDefinition = "text")
    private String address;

    /** 좌표 — 지도 SDK(좌표 선택 UI) 도입 전까지 null 허용 */
    @Column(precision = 10, scale = 7)
    private BigDecimal lat;

    @Column(precision = 10, scale = 7)
    private BigDecimal lng;

    @Column(length = 30)
    private String category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PlaceStatus status;

    @Column(name = "added_by", nullable = false)
    private Long addedBy;

    /** 담긴 여행 (PLAN.md Trip) — 미연결 시 null */
    @Column(name = "trip_id")
    private Long tripId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private Place(Long coupleId, String name, String address, BigDecimal lat, BigDecimal lng,
                  String category, PlaceStatus status, Long addedBy) {
        this.coupleId = coupleId;
        this.name = name;
        this.address = address;
        this.lat = lat;
        this.lng = lng;
        this.category = category;
        this.status = status != null ? status : PlaceStatus.WISHLIST;
        this.addedBy = addedBy;
    }

    /** 부분 수정 — null 이 아닌 값만 반영 (커플 둘 다 수정 가능) */
    public void update(String name, String address, BigDecimal lat, BigDecimal lng,
                       String category, PlaceStatus status) {
        if (name != null) this.name = name;
        if (address != null) this.address = address;
        if (lat != null) this.lat = lat;
        if (lng != null) this.lng = lng;
        if (category != null) this.category = category;
        if (status != null) this.status = status;
    }

    /** 방문 기록이 생기면 자동으로 방문완료 전환 */
    public void markVisited() {
        this.status = PlaceStatus.VISITED;
    }

    /** 여행에 담기 / 빼기(null) */
    public void assignTrip(Long tripId) {
        this.tripId = tripId;
    }
}
