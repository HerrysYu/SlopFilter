// Run: node test/heuristics.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SAMPLES } from './samples.mjs';

const src = readFileSync(new URL('../src/heuristics.js', import.meta.url), 'utf8');
const SlopHeuristics = vm.runInThisContext(`${src}\n;SlopHeuristics`);

const LOCAL_ONLY_MIN = 0.72;
let failures = 0;

for (const s of SAMPLES) {
  const r = SlopHeuristics.analyze(s.text, { isReply: !!s.reply, parentText: s.parent || '', badge: s.verified ? 'blue' : '', name: s.name });
  const tells = r.tells.map((t) => t.id).join(',') || '-';
  const human = r.human.map((t) => t.id).join(',') || '-';
  console.log(`${s.slop ? 'SLOP ' : 'human'}  ${r.score.toFixed(2)}  q=${r.query ? 'y' : 'n'}  [${tells}]  human[${human}]  ${s.text.slice(0, 50).replace(/\n/g, ' ')}`);

  // Human samples must never cross the local-only bar on their own.
  if (!s.slop && r.score >= LOCAL_ONLY_MIN - (s.verified ? 0.08 : 0)) { failures++; console.log('   ✗ human post would be blocked by local rules'); }
  // Human samples should stay well below the slop samples.
  if (!s.slop && r.score > 0.4) { failures++; console.log('   ✗ human post scored too high'); }
  // Slop samples should at least register.
  if (s.slop && r.score < 0.25) { failures++; console.log('   ✗ slop post scored too low'); }
}

const hard = SlopHeuristics.analyze(SAMPLES.find((s) => s.kind === 'chatbot_leftover').text);
if (!hard.hard || hard.score < 0.97) { failures++; console.log('✗ chatbot leftover not flagged as hard'); }

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
