/**
 * 맞춤법 검사기 오프라인 하네스 — verify-spellcheck.mjs 와 같은 방식으로 앱 TS 를 그대로 싣는다.
 * 2026-09-20 전수 감사(docs/SPELLCHECK_AUDIT_2026-09-20.md)에 쓴 도구. 규칙·3층을 고칠 때 재현용으로 쓴다.
 * 2층(e2e/pick 의 사전 후보)은 같은 폴더의 dict.py 가 시스템 hunspell CLI 로 낸다 — 없으면 e2e 만 실패한다.
 * 실행 위치 무관(경로는 이 파일 기준).
 * 사용:  node run.mjs check  '문장1' '문장2' ...      → 1층(규칙 엔진) 결과 JSON
 *        node run.mjs tokens '문장'                     → 3층 collectTokens 결과
 *        node run.mjs pick   '어절' '후보1' '후보2' ...  → 3층 pickSafeSuggestion 결과
 *        node run.mjs nasal  '어절'                      → stripNasalEnding
 *        echo '["문장",...]' | node run.mjs check-json    → 대량 검사 (stdin JSON 배열)
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const srcDir = fileURLToPath(new URL('../../src/utils', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'spell-harness-'));
for (const f of ['koreanSpellCheck.ts', 'koreanSpellRules.ts', 'koreanDictionaryRules.ts']) {
  const code = readFileSync(join(srcDir, f), 'utf8').replace("from './koreanSpellRules'", "from './koreanSpellRules.ts'");
  writeFileSync(join(tmp, f), code);
}
const { checkKoreanSpelling, applyAllSuggestions, dedupeOverlapping } = await import(pathToFileURL(join(tmp, 'koreanSpellCheck.ts')));
const { collectTokens, stripNasalEnding, pickSafeSuggestion, toJamo } = await import(pathToFileURL(join(tmp, 'koreanDictionaryRules.ts')));


/**
 * 3층 수정안 프로토타입 — 앱 코드는 건드리지 않고 하네스에서만 비교한다.
 * 현행: 편집거리 1 후보(safe)가 여럿이고 그중 띄어쓰기 변형이 있을 때만 포기.
 * 제안: 띄어쓰기 변형 후보가 하나라도 있으면 safe 개수와 무관하게 포기(사전이 "붙여 쓴 두 낱말"로 읽는다는 신호).
 */
function pickProposed(word, candidates) {
  if (candidates.some((c) => c.includes(' ') && c.replace(/ /g, '') === word)) return null;
  return pickSafeSuggestion(word, candidates);
}


/**
 * 종단(e2e) 시뮬레이션 — ChatRoomScreen 이 사용자에게 보여주는 것과 같은 합산 결과.
 * 1층 checkKoreanSpelling + 2층(진짜 Hunspell via dict.py) + 3층(collectTokens / stripNasalEnding / pickSafeSuggestion)
 * → dedupeOverlapping. 사전 호출은 전체 문장의 어절을 한 번에 모아 1회만 한다.
 * stdin: JSON 문장 배열. 출력: [{text, rule, dict, merged, applied}]
 */
function e2e(sentences) {
  const perSentence = sentences.map((t) => ({ text: t, rule: checkKoreanSpelling(t), tokens: collectTokens(t) }));
  const words = new Set();
  for (const s of perSentence) for (const tk of s.tokens) { words.add(tk.text); const n = stripNasalEnding(tk.text); if (n) words.add(n); }
  const list = [...words];
  const dictOut = list.length
    ? JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./dict.py', import.meta.url)), 'suggest-json'], { input: JSON.stringify(list), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
    : [];
  const byWord = new Map(dictOut.map((d) => [d.word, d]));
  return perSentence.map((s) => {
    const dict = [];
    for (const tk of s.tokens) {
      const d = byWord.get(tk.text);
      if (!d || d.known) continue;
      const n = stripNasalEnding(tk.text);
      if (n && byWord.get(n) && byWord.get(n).known) continue; // 애교체 면제
      const best = pickSafeSuggestion(tk.text, d.candidates);
      if (best === null) continue;
      dict.push({ index: tk.index, wrong: tk.text, right: best, reason: '사전에 없는 말이에요' });
    }
    const merged = dedupeOverlapping([...s.rule, ...dict]);
    return { text: s.text, rule: s.rule.map((x) => `${x.wrong}→${x.right}`), dict: dict.map((x) => `${x.wrong}→${x.right}`), merged: merged.map((x) => `${x.wrong}→${x.right}`), applied: applyAllSuggestions(s.text, merged) };
  });
}

const [cmd, ...rest] = process.argv.slice(2);
const out = (v) => console.log(JSON.stringify(v, null, 0));
if (cmd === 'check') out(rest.map((t) => ({ text: t, suggestions: checkKoreanSpelling(t), applied: applyAllSuggestions(t, checkKoreanSpelling(t)) })));
else if (cmd === 'check-json') { const arr = JSON.parse(readFileSync(0, 'utf8')); out(arr.map((t) => ({ text: t, suggestions: checkKoreanSpelling(t) }))); }
else if (cmd === 'tokens') out(rest.map((t) => ({ text: t, tokens: collectTokens(t) })));
else if (cmd === 'pick') out({ word: rest[0], candidates: rest.slice(1), picked: pickSafeSuggestion(rest[0], rest.slice(1)) });
else if (cmd === 'nasal') out(rest.map((w) => ({ word: w, stripped: stripNasalEnding(w) })));
else if (cmd === 'jamo') out(rest.map((w) => ({ word: w, jamo: toJamo(w) })));
else if (cmd === 'e2e') { const arr = JSON.parse(readFileSync(0, 'utf8')); out(e2e(arr)); }
else if (cmd === 'pick-json') { const arr = JSON.parse(readFileSync(0, 'utf8')); out(arr.map((r) => ({ word: r.word, known: r.known, candidates: r.candidates, current: pickSafeSuggestion(r.word, r.candidates), proposed: pickProposed(r.word, r.candidates) }))); }
else { console.error('unknown cmd'); process.exit(2); }
