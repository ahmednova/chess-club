import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { games, players } from "@/db/schema";
import { viewGames } from "./games";
import { getPlayer, type Me } from "./players";

export const leaderboardInput = z
  .object({ timeClass: z.enum(["bullet", "blitz", "rapid", "daily"]) })
  .strict();

/** Members ranked by rating in one time class, among those with a rated game in it. */
export async function leaderboard(user: Me, { timeClass }: z.infer<typeof leaderboardInput>) {
  const played = sql<number>`(select count(*) from games g where g.status = 'finished' and g.rated = 1 and g.kind = 'member' and g.time_class = ${timeClass} and (g.white_id = "players"."id" or g.black_id = "players"."id"))`;
  const rows = await db
    .select({ id: players.id, name: players.name, rating: players[timeClass], played })
    .from(players)
    .where(eq(players.orgId, user.orgId))
    .orderBy(desc(players[timeClass]), players.name);
  return rows.filter((r) => r.played > 0);
}

export const profileInput = z.object({ id: z.string().min(1).max(128) }).strict();

export async function profile(user: Me, { id }: z.infer<typeof profileInput>) {
  const player = await getPlayer(user.orgId, id);
  if (!player) return null;
  const theirs = or(eq(games.whiteId, id), eq(games.blackId, id))!;
  const finished = and(eq(games.orgId, user.orgId), eq(games.kind, "member"), eq(games.status, "finished"), theirs);
  const [record] = await db
    .select({
      wins: sql<number>`coalesce(sum(case when (${games.whiteId} = ${id} and ${games.result} = '1-0') or (${games.blackId} = ${id} and ${games.result} = '0-1') then 1 else 0 end), 0)`,
      losses: sql<number>`coalesce(sum(case when (${games.whiteId} = ${id} and ${games.result} = '0-1') or (${games.blackId} = ${id} and ${games.result} = '1-0') then 1 else 0 end), 0)`,
      draws: sql<number>`coalesce(sum(case when ${games.result} = '1/2-1/2' then 1 else 0 end), 0)`,
    })
    .from(games)
    .where(finished);
  const recent = await db
    .select()
    .from(games)
    .where(finished)
    .orderBy(desc(games.endedAt))
    .limit(10);
  return {
    id: player.id,
    name: player.name,
    isMe: player.id === user.id,
    ratings: {
      bullet: player.bullet,
      blitz: player.blitz,
      rapid: player.rapid,
      daily: player.daily,
      puzzle: player.puzzle,
    },
    record: record!,
    recent: await viewGames(user, recent),
  };
}
