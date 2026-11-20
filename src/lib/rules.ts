import { Chess } from "chess.js";

export type TimeClass = "bullet" | "blitz" | "rapid" | "daily";
export type Side = "white" | "black";

export interface TimeControl {
  key: string;
  label: string;
  timeClass: TimeClass;
  baseMs: number;
  incMs: number;
}

const MIN = 60_000;
const DAY = 86_400_000;

export const TIME_CONTROLS: TimeControl[] = [
  { key: "1+0", label: "1+0", timeClass: "bullet", baseMs: 1 * MIN, incMs: 0 },
  { key: "3+2", label: "3+2", timeClass: "blitz", baseMs: 3 * MIN, incMs: 2000 },
  { key: "5+0", label: "5+0", timeClass: "blitz", baseMs: 5 * MIN, incMs: 0 },
  { key: "10+0", label: "10+0", timeClass: "rapid", baseMs: 10 * MIN, incMs: 0 },
  { key: "15+10", label: "15+10", timeClass: "rapid", baseMs: 15 * MIN, incMs: 10_000 },
  { key: "30+0", label: "30+0", timeClass: "rapid", baseMs: 30 * MIN, incMs: 0 },
  { key: "d1", label: "1 day", timeClass: "daily", baseMs: 1 * DAY, incMs: 0 },
  { key: "d3", label: "3 days", timeClass: "daily", baseMs: 3 * DAY, incMs: 0 },
  { key: "d7", label: "7 days", timeClass: "daily", baseMs: 7 * DAY, incMs: 0 },
];
export const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "daily"];

export function timeControl(key: string): TimeControl | undefined {
  return TIME_CONTROLS.find((tc) => tc.key === key);
}

export function timeControlLabel(key: string): string {
  return timeControl(key)?.label ?? "No clock";
}

export interface Bot {
  id: string;
  name: string;
  level: string;
  rating: number;
  /** Search depth in plies; 0 plays almost at random. */
  depth: number;
  /** Centipawns of noise added to each root move's score. */
  noise: number;
}

export const BOTS: Bot[] = [
  { id: "pebble", name: "Pebble", level: "Beginner", rating: 400, depth: 0, noise: 0 },
  { id: "juniper", name: "Juniper", level: "Novice", rating: 800, depth: 1, noise: 250 },
  { id: "marlow", name: "Marlow", level: "Intermediate", rating: 1200, depth: 2, noise: 90 },
  { id: "sabine", name: "Sabine", level: "Advanced", rating: 1600, depth: 2, noise: 15 },
  { id: "teodor", name: "Teodor", level: "Master", rating: 2000, depth: 3, noise: 0 },
];

export function bot(id: string | null | undefined): Bot | undefined {
  return BOTS.find((b) => b.id === id);
}

export function moveList(moves: string): string[] {
  return moves ? moves.split(" ") : [];
}

/** The position after the given UCI moves. Throws on an illegal move. */
export function replay(moves: string[], fen?: string): Chess {
  const chess = fen ? new Chess(fen) : new Chess();
  for (const uci of moves) chess.move(uci);
  return chess;
}

export function sideToMove(chess: Chess): Side {
  return chess.turn() === "w" ? "white" : "black";
}

export function other(side: Side): Side {
  return side === "white" ? "black" : "white";
}

export interface Ending {
  result: "1-0" | "0-1" | "1/2-1/2";
  termination: string;
}

export function winFor(side: Side): Ending["result"] {
  return side === "white" ? "1-0" : "0-1";
}

/** How the position ends the game by the rules, or null when play goes on. */
export function ruleEnding(chess: Chess): Ending | null {
  if (chess.isCheckmate())
    return { result: winFor(other(sideToMove(chess))), termination: "checkmate" };
  if (chess.isStalemate()) return { result: "1/2-1/2", termination: "stalemate" };
  if (chess.isInsufficientMaterial())
    return { result: "1/2-1/2", termination: "insufficient material" };
  if (chess.isThreefoldRepetition())
    return { result: "1/2-1/2", termination: "repetition" };
  if (chess.isDrawByFiftyMoves())
    return { result: "1/2-1/2", termination: "fifty-move rule" };
  return null;
}

/** Whether `side` has anything left to mate with. */
export function canMate(chess: Chess, side: Side): boolean {
  const color = side === "white" ? "w" : "b";
  const pieces = chess
    .board()
    .flat()
    .filter((p) => p && p.color === color && p.type !== "k")
    .map((p) => p!.type);
  if (pieces.some((t) => t === "p" || t === "r" || t === "q")) return true;
  return pieces.length >= 2;
}

/** The ending when the side to move has run out of time. */
export function timeoutEnding(chess: Chess): Ending {
  const flagged = sideToMove(chess);
  if (!canMate(chess, other(flagged)))
    return { result: "1/2-1/2", termination: "timeout vs insufficient material" };
  return { result: winFor(other(flagged)), termination: "timeout" };
}

/** Clocks start once both sides have moved. */
export function clockRunning(plyCount: number): boolean {
  return plyCount >= 2;
}

/** Elo change for a player scoring `score` (1, 0.5, 0) against `opponent`. */
export function eloChange(rating: number, opponent: number, score: number, k = 32): number {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  return Math.round(k * (score - expected));
}

export function describeResult(result: string | null, termination: string | null): string {
  if (!result) return "";
  if (termination === "aborted") return "Game aborted";
  if (result === "1/2-1/2") {
    if (termination === "agreement") return "Draw by agreement";
    return `Draw by ${termination}`;
  }
  const winner = result === "1-0" ? "White" : "Black";
  if (termination === "timeout") return `${winner} won on time`;
  return `${winner} won by ${termination}`;
}
