// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in member; they use the same queries as the pages.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import * as games from "@/server/games";
import { ensurePlayer } from "@/server/players";
import * as ratings from "@/server/ratings";

export const tools = defineTools({
  list_ongoing_games: {
    description: "List the member's games in progress, with whose move it is.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) => {
      await ensurePlayer(user);
      const list = await games.ongoing(user);
      return list.map((g) => ({
        id: g.id,
        white: g.white.name,
        black: g.black.name,
        timeControl: g.timeLabel,
        yourMove: g.myTurn,
      }));
    },
  },
  leaderboard: {
    description: "Members ranked by rating in one time class.",
    risk: "read",
    input: ratings.leaderboardInput,
    handler: async (input, { user }) => {
      await ensurePlayer(user);
      return ratings.leaderboard(user, input);
    },
  },
});
