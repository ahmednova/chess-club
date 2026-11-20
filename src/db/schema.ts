import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One row per member who has opened the app, keyed by the Gateway's user id. */
export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  bullet: integer("bullet").notNull().default(1200),
  blitz: integer("blitz").notNull().default(1200),
  rapid: integer("rapid").notNull().default(1200),
  daily: integer("daily").notNull().default(1200),
  puzzle: integer("puzzle").notNull().default(1200),
  createdAt: integer("created_at").notNull(),
});

export const challenges = sqliteTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    creatorId: text("creator_id").notNull(),
    // Null for an open challenge anyone eligible may accept.
    targetId: text("target_id"),
    timeControl: text("time_control").notNull(),
    color: text("color", { enum: ["white", "black", "random"] }).notNull(),
    rated: integer("rated", { mode: "boolean" }).notNull(),
    minRating: integer("min_rating"),
    maxRating: integer("max_rating"),
    status: text("status", { enum: ["pending", "accepted", "cancelled"] })
      .notNull()
      .default("pending"),
    gameId: text("game_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("challenges_org_status").on(t.orgId, t.status)],
);

export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    kind: text("kind", { enum: ["member", "bot"] }).notNull(),
    // For a bot game, the bot's side is null and botId names it.
    whiteId: text("white_id"),
    blackId: text("black_id"),
    botId: text("bot_id"),
    timeControl: text("time_control").notNull(),
    timeClass: text("time_class").notNull(),
    rated: integer("rated", { mode: "boolean" }).notNull(),
    status: text("status", { enum: ["active", "finished", "aborted"] })
      .notNull()
      .default("active"),
    result: text("result"),
    termination: text("termination"),
    // Moves in UCI, space-separated.
    moves: text("moves").notNull().default(""),
    whiteMs: integer("white_ms").notNull(),
    blackMs: integer("black_ms").notNull(),
    turnStartedAt: integer("turn_started_at").notNull(),
    drawOffer: text("draw_offer"),
    whiteRating: integer("white_rating"),
    blackRating: integer("black_rating"),
    whiteDelta: integer("white_delta"),
    blackDelta: integer("black_delta"),
    version: integer("version").notNull().default(0),
    endToken: text("end_token"),
    createdAt: integer("created_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (t) => [
    index("games_white").on(t.whiteId, t.status),
    index("games_black").on(t.blackId, t.status),
    index("games_org_status").on(t.orgId, t.status),
  ],
);

export const puzzleAttempts = sqliteTable(
  "puzzle_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    puzzleId: text("puzzle_id").notNull(),
    solved: integer("solved", { mode: "boolean" }).notNull(),
    ms: integer("ms").notNull(),
    ratingChange: integer("rating_change").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("attempts_user").on(t.userId, t.createdAt)],
);
