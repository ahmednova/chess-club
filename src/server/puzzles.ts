import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { players, puzzleAttempts } from "@/db/schema";
import puzzleSet from "@/data/puzzles.json";
import { eloChange } from "@/lib/rules";
import { solves, type Puzzle } from "@/lib/puzzles";
import { Refusal } from "./errors";
import { ensurePlayer, type Me } from "./players";

export const PUZZLES = puzzleSet as Puzzle[];
const RECENT_MS = 30 * 86_400_000;

/** A puzzle near the member's rating that they haven't tried lately. */
export async function nextPuzzle(user: Me, skip?: string): Promise<Puzzle> {
  const me = await ensurePlayer(user);
  const recent = await db
    .select({ puzzleId: puzzleAttempts.puzzleId })
    .from(puzzleAttempts)
    .where(and(eq(puzzleAttempts.userId, user.id), gt(puzzleAttempts.createdAt, Date.now() - RECENT_MS)));
  const tried = new Set(recent.map((r) => r.puzzleId));
  if (skip) tried.add(skip);
  const fresh = PUZZLES.filter((p) => !tried.has(p.id));
  const pool = (fresh.length ? fresh : PUZZLES.filter((p) => p.id !== skip))
    .slice()
    .sort((a, b) => Math.abs(a.rating - me.puzzle) - Math.abs(b.rating - me.puzzle))
    .slice(0, 3);
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export const attemptInput = z
  .object({
    puzzleId: z.string().max(32),
    moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).max(20),
    ms: z.number().int().min(0).max(86_400_000),
  })
  .strict();

/** Records an attempt; only the first try at a puzzle moves the rating. */
export async function recordAttempt(user: Me, input: z.infer<typeof attemptInput>) {
  const puzzle = PUZZLES.find((p) => p.id === input.puzzleId);
  if (!puzzle) throw new Refusal("No such puzzle.");
  const me = await ensurePlayer(user);
  const solved = solves(puzzle, input.moves);
  const [before] = await db
    .select({ n: sql<number>`count(*)` })
    .from(puzzleAttempts)
    .where(and(eq(puzzleAttempts.userId, user.id), eq(puzzleAttempts.puzzleId, puzzle.id)));
  const change = before!.n > 0 ? 0 : eloChange(me.puzzle, puzzle.rating, solved ? 1 : 0);
  await db.batch([
    db.insert(puzzleAttempts).values({
      id: crypto.randomUUID(),
      userId: user.id,
      puzzleId: puzzle.id,
      solved,
      ms: input.ms,
      ratingChange: change,
      createdAt: Date.now(),
    }),
    db
      .update(players)
      .set({ puzzle: sql`${players.puzzle} + ${change}` })
      .where(eq(players.id, user.id)),
  ]);
  return { solved, change, rating: me.puzzle + change };
}

export async function recentAttempts(user: Me) {
  const rows = await db
    .select()
    .from(puzzleAttempts)
    .where(eq(puzzleAttempts.userId, user.id))
    .orderBy(desc(puzzleAttempts.createdAt))
    .limit(10);
  return rows.map((r) => ({
    id: r.id,
    puzzleId: r.puzzleId,
    rating: PUZZLES.find((p) => p.id === r.puzzleId)?.rating ?? null,
    solved: r.solved,
    ms: r.ms,
    change: r.ratingChange,
    createdAt: r.createdAt,
  }));
}
