# CLAUDE.md

## 개발 워크플로우

- Doubly는 1인 개발 프로젝트입니다. **PR(Pull Request)을 생성하지 않습니다.** `gh pr create` 등을 제안하거나 실행하지 마세요.
- 작업 브랜치가 완료되면 `main`에 직접 병합합니다 (예: `git merge --no-ff <브랜치>`).
- 병합이 끝난 브랜치는 정리합니다 — 로컬 브랜치와 원격 브랜치(있다면)를 삭제하세요 (`git branch -d <브랜치>`, 필요 시 `git push origin --delete <브랜치>`).
