import { Chess, type Move } from "chess.js";
import type { Bot } from "./rules";

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// A small bonus for central squares, by distance from the centre.
function centre(square: string): number {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return 6 - (Math.abs(3.5 - file) + Math.abs(3.5 - rank));
}

/** Material and centralisation from the side to move's view. */
function evaluate(chess: Chess): number {
  let score = 0;
  for (const row of chess.board())
    for (const piece of row) {
      if (!piece) continue;
      const bonus = piece.type === "k" ? 0 : centre(piece.square) * (piece.type === "p" ? 3 : 4);
      const value = VALUE[piece.type]! + bonus;
      score += piece.color === "w" ? value : -value;
    }
  return chess.turn() === "w" ? score : -score;
}

function ordered(chess: Chess, capturesOnly = false): Move[] {
  const moves = chess.moves({ verbose: true });
  const picked = capturesOnly ? moves.filter((m) => m.captured || m.promotion) : moves;
  return picked.sort(
    (a, b) =>
      (b.captured ? VALUE[b.captured]! * 10 - VALUE[b.piece]! : 0) -
      (a.captured ? VALUE[a.captured]! * 10 - VALUE[a.piece]! : 0),
  );
}

const MATE = 100_000;

function quiesce(chess: Chess, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(chess);
  if (depth === 0 || stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of ordered(chess, true)) {
    chess.move(m);
    const score = -quiesce(chess, -beta, -alpha, depth - 1);
    chess.undo();
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(chess: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  if (chess.isCheckmate()) return -MATE + ply;
  if (chess.isDraw()) return 0;
  if (depth === 0) return quiesce(chess, alpha, beta, 3);
  for (const m of ordered(chess)) {
    chess.move(m);
    const score = -search(chess, depth - 1, -beta, -alpha, ply + 1);
    chess.undo();
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** The move the bot plays in this position, in UCI. */
export function chooseMove(fen: string, strength: Pick<Bot, "depth" | "noise">, random = Math.random): string {
  const chess = new Chess(fen);
  const moves = ordered(chess);
  if (strength.depth === 0) {
    const captures = moves.filter((m) => m.captured);
    const pool = captures.length && random() < 0.3 ? captures : moves;
    return pool[Math.floor(random() * pool.length)]!.lan;
  }
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -search(chess, strength.depth - 1, -MATE * 2, MATE * 2, 1) + (random() - 0.5) * 2 * strength.noise;
    chess.undo();
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best.lan;
}
