package com.fitto.relation.domain;

/** 관계 유형 — 설계서 1.2 / 5.3 relations.relation_type */
public enum RelationType {
    COUPLE,
    TRAINER_MEMBER,
    /** N인 가족 — 멤버십은 relation_members 가 원천 (README "관계 모델") */
    FAMILY
}
