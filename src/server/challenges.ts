import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { challenges, games } from "@/db/schema";
import { timeControl, timeControlLabel, type TimeClass } from "@/lib/rules";
import { Refusal } from "./errors";
import { getPlayer, playerNames, type Me } from "./players";

export const createChallengeInput = z
  .object({
    targetId: z.string().min(1).max(128).nullable(),
    timeControl: z.string().refine((key) => Boolean(timeControl(key)), "Pick a time control"),
    color: z.enum(["white", "black", "random"]),
    rated: z.boolean(),
    minRating: z.number().int().min(0).max(4000).nullable(),
    maxRating: z.number().int().min(0).max(4000).nullable(),
  })
  .strict()
  .refine(
    (c) => c.minRating === null || c.maxRating === null || c.minRating <= c.maxRating,
    "The lowest rating must not be above the highest",
  );
export const challengeIdInput = z.object({ id: z.string().min(1).max(64) }).strict();

export async function createChallenge(user: Me, input: z.infer<typeof createChallengeInput>) {
  if (input.targetId) {
    if (input.targetId === user.id) throw new Refusal("You can't challenge yourself.");
    if (!(await getPlayer(user.orgId, input.targetId))) throw new Refusal("No such member.");
  }
  const open = !input.targetId;
  const id = crypto.randomUUID();
  await db.insert(challenges).values({
    id,
    orgId: user.orgId,
    creatorId: user.id,
    targetId: input.targetId,
    timeControl: input.timeControl,
    color: input.color,
    rated: input.rated,
    minRating: open ? input.minRating : null,
    maxRating: open ? input.maxRating : null,
    createdAt: Date.now(),
  });
  return { id };
}

type Challenge = typeof challenges.$inferSelect;

async function ratingIn(user: Me, cls: TimeClass): Promise<number> {
  const me = await getPlayer(user.orgId, user.id);
  return me ? me[cls] : 1200;
}

function eligible(c: Challenge, rating: number) {
  return (c.minRating === null || rating >= c.minRating) && (c.maxRating === null || rating <= c.maxRating);
}

export async function listChallenges(user: Me) {
  const rows = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.orgId, user.orgId),
        eq(challenges.status, "pending"),
        or(eq(challenges.creatorId, user.id), eq(challenges.targetId, user.id), isNull(challenges.targetId)),
      ),
    )
    .orderBy(desc(challenges.createdAt));
  const me = await getPlayer(user.orgId, user.id);
  const names = await playerNames(user.orgId, rows.flatMap((c) => [c.creatorId, c.targetId]));
  const view = (c: Challenge) => ({
    id: c.id,
    creator: names.get(c.creatorId) ?? "Former member",
    target: c.targetId ? (names.get(c.targetId) ?? "Former member") : null,
    timeControl: c.timeControl,
    timeLabel: timeControlLabel(c.timeControl),
    color: c.color,
    rated: c.rated,
    minRating: c.minRating,
    maxRating: c.maxRating,
  });
  const cls = (c: Challenge) => timeControl(c.timeControl)!.timeClass;
  return {
    mine: rows.filter((c) => c.creatorId === user.id).map(view),
    incoming: rows.filter((c) => c.targetId === user.id).map(view),
    open: rows
      .filter((c) => c.creatorId !== user.id && !c.targetId && eligible(c, me ? me[cls(c)] : 1200))
      .map(view),
  };
}

export async function cancelChallenge(user: Me, { id }: { id: string }) {
  const done = await db
    .update(challenges)
    .set({ status: "cancelled" })
    .where(and(eq(challenges.id, id), eq(challenges.creatorId, user.id), eq(challenges.status, "pending")))
    .returning({ id: challenges.id });
  if (!done.length) throw new Refusal("That challenge is no longer pending.");
  return { id };
}

export async function acceptChallenge(user: Me, { id }: { id: string }) {
  const [c] = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.id, id), eq(challenges.orgId, user.orgId), eq(challenges.status, "pending")));
  if (!c) throw new Refusal("That challenge is no longer open.");
  if (c.creatorId === user.id) throw new Refusal("You can't accept your own challenge.");
  if (c.targetId && c.targetId !== user.id) throw new Refusal("That challenge is for someone else.");
  const tc = timeControl(c.timeControl)!;
  if (!c.targetId && !eligible(c, await ratingIn(user, tc.timeClass)))
    throw new Refusal("Your rating is outside this challenge's range.");
  const creatorWhite = c.color === "white" || (c.color === "random" && Math.random() < 0.5);
  const gameId = crypto.randomUUID();
  const now = Date.now();
  // The challenge flips to accepted only while still pending, and the game
  // is written only if that update landed: two acceptors can't both start one.
  const claimed = await db
    .update(challenges)
    .set({ status: "accepted", gameId })
    .where(and(eq(challenges.id, id), eq(challenges.status, "pending"), ne(challenges.creatorId, user.id)))
    .returning({ id: challenges.id });
  if (!claimed.length) throw new Refusal("That challenge is no longer open.");
  await db.insert(games).values({
    id: gameId,
    orgId: user.orgId,
    kind: "member",
    whiteId: creatorWhite ? c.creatorId : user.id,
    blackId: creatorWhite ? user.id : c.creatorId,
    timeControl: c.timeControl,
    timeClass: tc.timeClass,
    rated: c.rated,
    whiteMs: tc.baseMs,
    blackMs: tc.baseMs,
    turnStartedAt: now,
    createdAt: now,
  });
  return { gameId };
}

