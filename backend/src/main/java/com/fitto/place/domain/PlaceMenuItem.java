package com.fitto.place.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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

import java.time.LocalDateTime;

/**
 * 장소 메뉴 한 줄(V131) — 메뉴판을 찍어 AI 가 읽고 사람이 확인한 이름·가격. 저장은 통째로 바꾸기라 행을 고치지 않는다.
 */
@Entity
@Table(name = "place_menu_items")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaceMenuItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "place_id", nullable = false)
    private Long placeId;

    @Column(nullable = false, length = 100)
    private String name;

    /** 원 단위. 메뉴판에 없거나 "시가"면 null */
    private Integer price;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** 마지막으로 목록을 저장한 사람 */
    @Column(name = "updated_by", nullable = false)
    private Long updatedBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private PlaceMenuItem(Long placeId, String name, Integer price, int sortOrder, Long updatedBy) {
        this.placeId = placeId;
        this.name = name;
        this.price = price;
        this.sortOrder = sortOrder;
        this.updatedBy = updatedBy;
    }
}
