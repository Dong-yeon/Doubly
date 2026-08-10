package com.fitto.relation.domain;

/**
 * 관계 안에서의 멤버 역할 — relation_members.member_role.
 *
 * <p>COUPLE 은 양쪽 다 PARTNER, TRAINER_MEMBER 는 TRAINER/MEMBER,
 * FAMILY 는 GUARDIAN(보호자)/CHILD(아이). CHILD 는 아이 프로필(계정 승격) 단계에서 사용한다.
 */
public enum MemberRole {
    PARTNER,
    TRAINER,
    MEMBER,
    GUARDIAN,
    CHILD
}
