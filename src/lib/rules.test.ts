import { describe, expect, it } from "vitest";
import puzzles from "@/data/puzzles.json";
import { canMate, eloChange, replay, ruleEnding, timeoutEnding } from "./rules";
import { solves, type Puzzle } from "./puzzles";

describe("rules", () => {
  it("rates an even game as +16/-16", () => {
    expect(eloChange(1200, 1200, 1)).toBe(16);
    expect(eloChange(1200, 1200, 0)).toBe(-16);
    expect(eloChange(1200, 1200, 0.5)).toBe(0);
  });
  it("ends on checkmate", () => {
    const chess = replay(["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]);
    expect(ruleEnding(chess)).toEqual({ result: "1-0", termination: "checkmate" });
  });
  it("draws a timeout when the opponent can't mate", () => {
    const chess = replay([], "8/8/4k3/8/8/8/4P3/4K3 b - - 0 1");
    expect(canMate(chess, "white")).toBe(true);
    const lone = replay([], "8/8/4k3/8/8/8/4N3/4K3 w - - 0 1");
    expect(timeoutEnding(lone).result).toBe("1/2-1/2");
  });
});

describe("puzzles", () => {
  it("every bundled line is legal and ends in mate", () => {
    for (const p of puzzles as Puzzle[]) {
      expect(replay(p.moves, p.fen).isCheckmate(), p.id).toBe(true);
      const solver = p.moves.filter((_, i) => i % 2 === 0);
      expect(solves(p, solver)).toBe(true);
    }
  });
});
