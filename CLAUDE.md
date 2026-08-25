# CLAUDE.md

## 1. 개발 워크플로우 (1인 개발)
- PR(Pull Request)을 생성하지 않습니다 (`gh pr create` 절대 금지)[cite: 4, 8].
- 완료된 작업은 `main`에 직접 병합(`git merge --no-ff`) 후 브랜치를 즉시 삭제합니다[cite: 4, 8].

## 2. 에이전트(AI) 작업 및 보고 규칙
- **Git Clean State**: 에이전트 실행 전 워킹 디렉토리는 항상 커밋되어 비워져 있어야 합니다[cite: 4].
- **논리적 커밋**: 한 번에 거대한 커밋을 남기지 말고, 클린하고 논리적인 단계로 나누어 커밋합니다[cite: 4].
- **리포트 작성**: 대규모 작업 완료 후에는 항상 작업 요약 리포트(예: `PROGRESS_REPORT.md`)를 남겨 리뷰를 돕습니다[cite: 4].

## 3. 명명 규칙 (Naming Boundaries)
- 사용자 노출 UI 및 문서는 **Dubly (더블리)**를 사용합니다[cite: 8].
- 인프라 단절 방지를 위해 앱 식별자(`com.doubly.app`) 및 백엔드 시스템 식별자(`com.fitto`, `fitto.*`)는 절대 변경하지 않습니다[cite: 8].

## 4. 백엔드 및 DB 필수 규칙 (CRITICAL)
- **Flyway 호환성**: PostgreSQL과 H2 환경 모두에서 동작하도록 `JSONB`, `ON CONFLICT` 등 특정 DB 전용 문법 사용을 금지합니다[cite: 4, 7, 8].
- **FK 무결성 (Purger)**: DB 테이블(엔티티) 추가 시 `UserDataPurger.java`와 `RelationRecordPurger.java`의 삭제 순서를 반드시 업데이트하여 회원 탈퇴 에러를 방지합니다[cite: 4, 7, 8].
- **상태 필터링**: `WorkoutRepository` 등 기록 조회 쿼리 작성 시, 진행 중인 데이터가 반영되지 않도록 반드시 `status = 'COMPLETED'` 조건 필터링을 포함해야 합니다[cite: 4, 7].