// Writes src/data/puzzles.json: checkmate puzzles found in generated games.
// Run once with `node scripts/make-puzzles.mjs`; the output is committed.
import { writeFileSync } from "node:fs";
import { Chess } from "chess.js";

let seed = 20261120;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function pick(chess) {
  const moves = chess.moves({ verbose: true });
  // White plays forcing moves more often, so games reach mating attacks.
  if (chess.turn() === "w" && rand() < 0.5) {
    const checks = moves.filter((m) => m.san.includes("+") && !m.san.includes("#"));
    if (checks.length) return checks[Math.floor(rand() * checks.length)];
  }
  const captures = moves.filter((m) => m.captured).sort((x, y) => VALUE[y.captured] - VALUE[x.captured]);
  if (captures.length && rand() < 0.6) return captures[0];
  return moves[Math.floor(rand() * moves.length)];
}
const mates = (chess) => chess.moves({ verbose: true }).filter((m) => { chess.move(m.lan); const x = chess.isCheckmate(); chess.undo(); return x; });

function forcedMate(chess, m) {
  chess.move(m.lan);
  let worst = chess.isGameOver() ? null : { answers: [] };
  if (worst) for (const r of chess.moves({ verbose: true })) {
    chess.move(r.lan);
    const answers = mates(chess);
    chess.undo();
    if (!answers.length) { worst = null; break; }
    if (!worst.reply || answers.length < worst.answers.length) worst = { reply: r.lan, answers };
  }
  chess.undo();
  return worst;
}

function mateInTwo(chess) {
  const moves = chess.moves({ verbose: true });
  const checks = moves.filter((m) => m.san.includes("+"));
  const keys = [];
  for (const m of checks) {
    const line = forcedMate(chess, m);
    if (line) keys.push({ key: m.lan, ...line });
    if (keys.length > 1) return null;
  }
  if (keys.length !== 1) return null;
  for (const m of moves) if (!m.san.includes("+") && forcedMate(chess, m)) return null;
  return keys[0];
}

const one = [], two = [], seen = new Set();
for (let g = 0; g < 4000 && (one.length < 45 || two.length < 35); g++) {
  if (g % 20 === 0) { write(); console.log(g, one.length, two.length); }
  const chess = new Chess();
  for (let ply = 0; ply < 120 && !chess.isGameOver(); ply++) {
    if (ply >= 14 && !seen.has(chess.fen())) {
      seen.add(chess.fen());
      const m1 = mates(chess);
      if (m1.length === 1 && one.length < 45 && chess.moves().length > 8) {
        one.push({ fen: chess.fen(), moves: [m1[0].lan], legal: chess.moves().length });
        break;
      }
      if (!m1.length && two.length < 35 && ply % 3 === 0 && chess.moves().length > 10) {
        const found = mateInTwo(chess);
        if (found) { two.push({ fen: chess.fen(), moves: [found.key, found.reply, found.answers[0].lan], legal: chess.moves().length }); break; }
      }
    }
    chess.move(pick(chess).lan);
  }
}
function write() {
const out = [
  ...one.map((p, i) => ({ id: `m1-${String(i + 1).padStart(2, "0")}`, fen: p.fen, moves: p.moves, rating: 700 + Math.min(600, p.legal * 12) })),
  ...two.map((p, i) => ({ id: `m2-${String(i + 1).padStart(2, "0")}`, fen: p.fen, moves: p.moves, rating: 1250 + Math.min(700, p.legal * 15) })),
];
writeFileSync(new URL("../src/data/puzzles.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
}
write();
console.log(one.length, two.length);
