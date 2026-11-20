import { replay } from "./rules";

export interface Puzzle {
  id: string;
  fen: string;
  /** The line in UCI: the solver's moves at even indexes, the replies between. */
  moves: string[];
  rating: number;
}

/** Whether the solver's moves solve the puzzle. A different final move that also mates counts. */
export function solves(puzzle: Puzzle, played: string[]): boolean {
  const needed = Math.ceil(puzzle.moves.length / 2);
  if (played.length !== needed) return false;
  const line: string[] = [];
  for (let i = 0; i < needed; i++) {
    const expected = puzzle.moves[i * 2]!;
    const move = played[i]!;
    if (move !== expected) {
      if (i !== needed - 1) return false;
      try {
        if (!replay([...line, move], puzzle.fen).isCheckmate()) return false;
      } catch {
        return false;
      }
    }
    line.push(move);
    if (i < needed - 1) line.push(puzzle.moves[i * 2 + 1]!);
  }
  return true;
}

