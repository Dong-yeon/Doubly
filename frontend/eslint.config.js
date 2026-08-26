// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const doublyA11y = require('./eslint-rules/icon-button-a11y-label');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // QA_CHECKLIST.md 패턴 5 재발 방지 — 2026-08-26에 아이콘 전용 버튼 79개 파일을 전부
    // 손봤다. warn인 이유는 eslint-rules/icon-button-a11y-label.js 상단 주석 참고.
    plugins: { 'doubly-a11y': doublyA11y },
    rules: { 'doubly-a11y/icon-button-label': 'warn' },
  },
]);
