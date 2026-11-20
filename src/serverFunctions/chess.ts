import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as challenges from "@/server/challenges";
import * as games from "@/server/games";
import { ensurePlayer, listOpponents, type Me } from "@/server/players";
import * as puzzles from "@/server/puzzles";
import * as ratings from "@/server/ratings";

// Every server function runs behind ensureUserMiddleware: `context.user` is
// the member the Gateway signed in. Their player row is made on first sight.
async function me(user: Me): Promise<Me> {
  await ensurePlayer(user);
  return { id: user.id, email: user.email, orgId: user.orgId };
}

export const getPlayHome = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const user = await me(context.user);
    const [ongoing, list, opponents] = await Promise.all([
      games.ongoing(user),
      challenges.listChallenges(user),
      listOpponents(user),
    ]);
    return { ongoing, challenges: list, opponents };
  });

export const createChallenge = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => challenges.createChallengeInput.parse(data))
  .handler(async ({ data, context }) => challenges.createChallenge(await me(context.user), data));

export const cancelChallenge = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => challenges.challengeIdInput.parse(data))
  .handler(async ({ data, context }) => challenges.cancelChallenge(await me(context.user), data));

export const acceptChallenge = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => challenges.challengeIdInput.parse(data))
  .handler(async ({ data, context }) => challenges.acceptChallenge(await me(context.user), data));

export const getGame = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => games.gameIdInput.parse(data))
  .handler(async ({ data, context }) => games.getGame(await me(context.user), data.id));

export const playMove = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => games.moveInput.parse(data))
  .handler(async ({ data, context }) => games.playMove(await me(context.user), data));

const gameAction = z.object({
  id: z.string().min(1).max(64),
  action: z.enum(["resign", "abort", "offerDraw", "acceptDraw", "declineDraw", "takeback"]),
}).strict();

export const gameAct = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => gameAction.parse(data))
  .handler(async ({ data, context }) => games[data.action](await me(context.user), data));

export const createBotGame = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => games.botGameInput.parse(data))
  .handler(async ({ data, context }) => games.createBotGame(await me(context.user), data));

export const getHistory = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => games.historyInput.parse(data))
  .handler(async ({ data, context }) => games.history(await me(context.user), data));

export const getLeaderboard = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => ratings.leaderboardInput.parse(data))
  .handler(async ({ data, context }) => ratings.leaderboard(await me(context.user), data));

export const getProfile = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => ratings.profileInput.parse(data))
  .handler(async ({ data, context }) => ratings.profile(await me(context.user), data));

export const getPuzzlePage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ skip: z.string().max(32).optional() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const user = await me(context.user);
    const player = await ensurePlayer(user);
    const [puzzle, attempts] = await Promise.all([
      puzzles.nextPuzzle(user, data.skip),
      puzzles.recentAttempts(user),
    ]);
    return { puzzle, attempts, rating: player.puzzle };
  });

export const recordAttempt = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => puzzles.attemptInput.parse(data))
  .handler(async ({ data, context }) => puzzles.recordAttempt(await me(context.user), data));
