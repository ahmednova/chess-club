import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { Chess } from "chess.js";
import { z } from "zod";
import { db } from "@/db";
import { games, players } from "@/db/schema";
import {
  bot,
  BOTS,
  clockRunning,
  describeResult,
  eloChange,
  moveList,
  other,
  replay,
  ruleEnding,
  sideToMove,
  timeControl,
  timeControlLabel,
  timeoutEnding,
  winFor,
  type Ending,
  type Side,
  type TimeClass,
} from "@/lib/rules";
import { Refusal } from "./errors";
import { playerNames, type Me } from "./players";

export type Game = typeof games.$inferSelect;

const RATED_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "daily"];

export const gameIdInput = z.object({ id: z.string().min(1).max(64) }).strict();
export const moveInput = z
  .object({ id: z.string().min(1).max(64), uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/) })
  .strict();
export const botGameInput = z
  .object({ botId: z.string(), color: z.enum(["white", "black", "random"]) })
  .strict();

export function sideOf(game: Game, userId: string): Side | null {
  if (game.whiteId === userId) return "white";
  if (game.blackId === userId) return "black";
  return null;
}

/** The game if this member may see it: member games are the organization's, bot games their player's. */
async function findVisible(user: Me, id: string): Promise<Game | null> {
  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, user.orgId)));
  if (!game) return null;
  if (game.kind === "bot" && !sideOf(game, user.id)) return null;
  return game;
}

function remaining(game: Game, now: number) {
  const plies = moveList(game.moves).length;
  const running = game.status === "active" && game.kind === "member" && clockRunning(plies);
  let whiteMs = game.whiteMs;
  let blackMs = game.blackMs;
  if (running) {
    const elapsed = now - game.turnStartedAt;
    if (plies % 2 === 0) whiteMs -= elapsed;
    else blackMs -= elapsed;
  }
  return { whiteMs: Math.max(0, whiteMs), blackMs: Math.max(0, blackMs), running };
}

/**
 * Ends the game in one batch: the game row (only if no one else changed it
 * since it was read) and, for a rated member game, both ratings. The rating
 * updates run only when this batch's own end token landed.
 */
async function finish(
  game: Game,
  ending: Ending | null,
  termination: string,
  fields: Partial<Game>,
): Promise<boolean> {
  const now = Date.now();
  const token = crypto.randomUUID();
  const cls = game.timeClass as TimeClass;
  let whiteDelta: number | null = null;
  let blackDelta: number | null = null;
  let whiteRating: number | null = null;
  let blackRating: number | null = null;
  const rates = ending && game.kind === "member" && game.rated && RATED_CLASSES.includes(cls);
  if (rates) {
    const rows = await db
      .select()
      .from(players)
      .where(or(eq(players.id, game.whiteId!), eq(players.id, game.blackId!)));
    const white = rows.find((r) => r.id === game.whiteId);
    const black = rows.find((r) => r.id === game.blackId);
    if (white && black) {
      whiteRating = white[cls];
      blackRating = black[cls];
      const score = ending!.result === "1-0" ? 1 : ending!.result === "0-1" ? 0 : 0.5;
      whiteDelta = eloChange(whiteRating, blackRating, score);
      blackDelta = eloChange(blackRating, whiteRating, 1 - score);
    }
  }
  const update = db
    .update(games)
    .set({
      ...fields,
      status: ending ? "finished" : "aborted",
      result: ending?.result ?? null,
      termination,
      drawOffer: null,
      endedAt: now,
      endToken: token,
      version: game.version + 1,
      whiteDelta,
      blackDelta,
      whiteRating,
      blackRating,
    })
    .where(and(eq(games.id, game.id), eq(games.version, game.version)))
    .returning({ id: games.id });
  if (whiteDelta === null || blackDelta === null) {
    const done = await update;
    return done.length > 0;
  }
  const landed = sql`exists (select 1 from ${games} where ${games.id} = ${game.id} and ${games.endToken} = ${token})`;
  const column = players[cls];
  const [done] = await db.batch([
    update,
    db
      .update(players)
      .set({ [cls]: sql`${column} + ${whiteDelta}` })
      .where(and(eq(players.id, game.whiteId!), landed)),
    db
      .update(players)
      .set({ [cls]: sql`${column} + ${blackDelta}` })
      .where(and(eq(players.id, game.blackId!), landed)),
  ]);
  return done.length > 0;
}

async function save(game: Game, fields: Partial<Game>): Promise<void> {
  const done = await db
    .update(games)
    .set({ ...fields, version: game.version + 1 })
    .where(and(eq(games.id, game.id), eq(games.version, game.version)))
    .returning({ id: games.id });
  if (!done.length) throw new Refusal("The game changed. Try again.");
}

/** Ends a game whose side to move has run out of time; returns the fresh row. */
async function settle(game: Game): Promise<Game> {
  if (game.status !== "active" || game.kind !== "member") return game;
  const clocks = remaining(game, Date.now());
  if (!clocks.running) return game;
  const chess = replay(moveList(game.moves));
  const left = sideToMove(chess) === "white" ? clocks.whiteMs : clocks.blackMs;
  if (left > 0) return game;
  const ending = timeoutEnding(chess);
  await finish(game, ending, ending.termination, {
    whiteMs: clocks.whiteMs,
    blackMs: clocks.blackMs,
  });
  const [fresh] = await db.select().from(games).where(eq(games.id, game.id));
  return fresh!;
}

async function loadSettled(user: Me, id: string): Promise<Game> {
  const game = await findVisible(user, id);
  if (!game) throw new Refusal("Game not found.");
  return settle(game);
}

export interface PlayerView {
  id: string | null;
  name: string;
  rating: number | null;
  delta: number | null;
  isBot: boolean;
}

export async function viewGames(user: Me, rows: Game[]) {
  const names = await playerNames(
    user.orgId,
    rows.flatMap((g) => [g.whiteId, g.blackId]),
  );
  const now = Date.now();
  return rows.map((g) => {
    const b = bot(g.botId);
    const person = (id: string | null, rating: number | null, delta: number | null): PlayerView =>
      id
        ? { id, name: names.get(id) ?? "Former member", rating, delta, isBot: false }
        : { id: null, name: b?.name ?? "Bot", rating: b?.rating ?? null, delta: null, isBot: true };
    const list = moveList(g.moves);
    const clocks = remaining(g, now);
    return {
      id: g.id,
      kind: g.kind,
      white: person(g.whiteId, g.whiteRating, g.whiteDelta),
      black: person(g.blackId, g.blackRating, g.blackDelta),
      botId: g.botId,
      timeControl: g.timeControl,
      timeLabel: timeControlLabel(g.timeControl),
      timeClass: g.timeClass,
      daily: g.timeClass === "daily",
      rated: g.rated,
      status: g.status,
      result: g.result,
      termination: g.termination,
      resultText: g.status === "aborted" ? "Game aborted" : describeResult(g.result, g.termination),
      moves: list,
      toMove: (list.length % 2 === 0 ? "white" : "black") as Side,
      whiteMs: clocks.whiteMs,
      blackMs: clocks.blackMs,
      running: clocks.running,
      serverNow: now,
      drawOffer: g.drawOffer as Side | null,
      mySide: sideOf(g, user.id),
      createdAt: g.createdAt,
      endedAt: g.endedAt,
    };
  });
}

export type GameView = Awaited<ReturnType<typeof viewGames>>[number];

export async function getGame(user: Me, id: string): Promise<GameView | null> {
  const game = await findVisible(user, id);
  if (!game) return null;
  const [view] = await viewGames(user, [await settle(game)]);
  return view!;
}

export async function playMove(user: Me, { id, uci }: z.infer<typeof moveInput>) {
  const game = await loadSettled(user, id);
  if (game.status !== "active") throw new Refusal("This game is over.");
  const list = moveList(game.moves);
  const chess = replay(list);
  const side = sideToMove(chess);
  const mine = sideOf(game, user.id);
  if (!mine) throw new Refusal("You are not playing in this game.");
  if (game.kind === "member" && mine !== side) throw new Refusal("It is not your move.");
  let played;
  try {
    played = chess.move(uci);
  } catch {
    throw new Refusal("That move is not legal.");
  }
  const now = Date.now();
  let { whiteMs, blackMs } = game;
  const tc = timeControl(game.timeControl);
  if (tc && game.kind === "member") {
    if (tc.timeClass === "daily") {
      whiteMs = tc.baseMs;
      blackMs = tc.baseMs;
    } else if (clockRunning(list.length)) {
      const spent = now - game.turnStartedAt;
      if (side === "white") whiteMs = whiteMs - spent + tc.incMs;
      else blackMs = blackMs - spent + tc.incMs;
    }
  }
  const fields = {
    moves: [...list, played.lan].join(" "),
    whiteMs,
    blackMs,
    turnStartedAt: now,
    drawOffer: null,
  };
  const ending = ruleEnding(chess);
  if (ending) {
    if (!(await finish(game, ending, ending.termination, fields)))
      throw new Refusal("The game changed. Try again.");
  } else {
    await save(game, fields);
  }
  return getGame(user, id);
}

async function ownGame(user: Me, id: string) {
  const game = await loadSettled(user, id);
  const side = sideOf(game, user.id);
  if (!side) throw new Refusal("You are not playing in this game.");
  if (game.status !== "active") throw new Refusal("This game is over.");
  return { game, side };
}

export async function resign(user: Me, { id }: { id: string }) {
  const { game, side } = await ownGame(user, id);
  if (!(await finish(game, { result: winFor(other(side)), termination: "resignation" }, "resignation", {})))
    throw new Refusal("The game changed. Try again.");
  return getGame(user, id);
}

export async function abort(user: Me, { id }: { id: string }) {
  const { game } = await ownGame(user, id);
  if (moveList(game.moves).length >= 2)
    throw new Refusal("A game can be aborted only before both sides have moved.");
  if (!(await finish(game, null, "aborted", {}))) throw new Refusal("The game changed. Try again.");
  return getGame(user, id);
}

export async function offerDraw(user: Me, { id }: { id: string }) {
  const { game, side } = await ownGame(user, id);
  if (game.kind !== "member") throw new Refusal("Bots don't take draw offers.");
  if (game.drawOffer === other(side)) return acceptDraw(user, { id });
  if (game.drawOffer !== side) await save(game, { drawOffer: side });
  return getGame(user, id);
}

export async function acceptDraw(user: Me, { id }: { id: string }) {
  const { game, side } = await ownGame(user, id);
  if (game.drawOffer !== other(side)) throw new Refusal("There is no draw offer to accept.");
  if (!(await finish(game, { result: "1/2-1/2", termination: "agreement" }, "agreement", {})))
    throw new Refusal("The game changed. Try again.");
  return getGame(user, id);
}

export async function declineDraw(user: Me, { id }: { id: string }) {
  const { game, side } = await ownGame(user, id);
  if (game.drawOffer !== other(side)) throw new Refusal("There is no draw offer to decline.");
  await save(game, { drawOffer: null });
  return getGame(user, id);
}

/** Takes back the member's last move in a bot game, and the bot's reply to it. */
export async function takeback(user: Me, { id }: { id: string }) {
  const { game, side } = await ownGame(user, id);
  if (game.kind !== "bot") throw new Refusal("Takebacks are for bot games.");
  const list = moveList(game.moves);
  const lastMover = list.length % 2 === 1 ? "white" : "black";
  const drop = lastMover === side ? 1 : 2;
  if (list.length < drop || (drop === 2 && list.length - 2 < 0)) throw new Refusal("No move to take back.");
  const kept = list.slice(0, list.length - drop);
  if (kept.length % 2 !== (side === "white" ? 0 : 1)) throw new Refusal("No move to take back.");
  await save(game, { moves: kept.join(" "), turnStartedAt: Date.now() });
  return getGame(user, id);
}

export async function createBotGame(user: Me, input: z.infer<typeof botGameInput>) {
  const b = bot(input.botId);
  if (!b) throw new Refusal("No such bot.");
  const color = input.color === "random" ? (Math.random() < 0.5 ? "white" : "black") : input.color;
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.insert(games).values({
    id,
    orgId: user.orgId,
    kind: "bot",
    whiteId: color === "white" ? user.id : null,
    blackId: color === "black" ? user.id : null,
    botId: b.id,
    timeControl: "none",
    timeClass: "untimed",
    rated: false,
    whiteMs: 0,
    blackMs: 0,
    turnStartedAt: now,
    createdAt: now,
  });
  return { id };
}

const mine = (userId: string) => or(eq(games.whiteId, userId), eq(games.blackId, userId))!;

/** The member's games in progress, daily games waiting on their move first. */
export async function ongoing(user: Me) {
  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.orgId, user.orgId), eq(games.status, "active"), mine(user.id)))
    .orderBy(desc(games.turnStartedAt));
  const settled = await Promise.all(rows.map(settle));
  const views = (await viewGames(user, settled.filter((g) => g.status === "active"))).map((v) => ({
    ...v,
    myTurn: v.mySide === v.toMove,
  }));
  const rank = (v: (typeof views)[number]) => (v.daily && v.myTurn ? 0 : 1);
  return views.sort((a, b) => rank(a) - rank(b));
}

export const historyInput = z
  .object({
    opponent: z.string().max(80).optional(),
    timeClass: z.enum(["bullet", "blitz", "rapid", "daily", "untimed"]).optional(),
    result: z.enum(["win", "loss", "draw"]).optional(),
    page: z.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export const PAGE_SIZE = 10;

export async function history(user: Me, input: z.infer<typeof historyInput>) {
  const me = user.id;
  const where: SQL[] = [eq(games.orgId, user.orgId), eq(games.status, "finished"), mine(me)];
  if (input.timeClass) where.push(eq(games.timeClass, input.timeClass));
  if (input.result === "draw") where.push(eq(games.result, "1/2-1/2"));
  const won = or(
    and(eq(games.whiteId, me), eq(games.result, "1-0")),
    and(eq(games.blackId, me), eq(games.result, "0-1")),
  )!;
  const lost = or(
    and(eq(games.whiteId, me), eq(games.result, "0-1")),
    and(eq(games.blackId, me), eq(games.result, "1-0")),
  )!;
  if (input.result === "win") where.push(won);
  if (input.result === "loss") where.push(lost);
  if (input.opponent?.startsWith("bot:")) where.push(eq(games.botId, input.opponent.slice(4)));
  else if (input.opponent)
    where.push(
      or(
        and(eq(games.whiteId, me), eq(games.blackId, input.opponent)),
        and(eq(games.blackId, me), eq(games.whiteId, input.opponent)),
      )!,
    );
  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)` })
    .from(games)
    .where(and(...where))) as [{ total: number }];
  const rows = await db
    .select()
    .from(games)
    .where(and(...where))
    .orderBy(desc(games.endedAt), desc(games.id))
    .limit(PAGE_SIZE)
    .offset((input.page - 1) * PAGE_SIZE);
  // Everyone the member has finished a game against, for the filter.
  const all = await db
    .select({ whiteId: games.whiteId, blackId: games.blackId, botId: games.botId })
    .from(games)
    .where(and(eq(games.orgId, user.orgId), eq(games.status, "finished"), mine(me)));
  const memberIds = [...new Set(all.map((g) => (g.whiteId === me ? g.blackId : g.whiteId)).filter(Boolean))] as string[];
  const names = await playerNames(user.orgId, memberIds);
  const botIds = new Set(all.map((g) => g.botId).filter(Boolean));
  const opponents = [
    ...memberIds.map((id) => ({ value: id, label: names.get(id) ?? "Former member" })),
    ...BOTS.filter((b) => botIds.has(b.id)).map((b) => ({ value: `bot:${b.id}`, label: b.name })),
  ];
  return { games: await viewGames(user, rows), total, page: input.page, pageSize: PAGE_SIZE, opponents };
}

/** A game as PGN, or null when this member may not see it. */
export async function pgn(user: Me, id: string): Promise<{ text: string; name: string } | null> {
  const game = await findVisible(user, id);
  if (!game) return null;
  const [view] = await viewGames(user, [game]);
  const chess = new Chess();
  for (const uci of view!.moves) chess.move(uci);
  const date = new Date(game.createdAt).toISOString().slice(0, 10).replaceAll("-", ".");
  const tc = timeControl(game.timeControl);
  const tcText = !tc ? "-" : tc.timeClass === "daily" ? `1/${tc.baseMs / 1000}` : `${tc.baseMs / 1000}+${tc.incMs / 1000}`;
  chess.setHeader("Event", game.rated ? "Rated game" : "Casual game");
  chess.setHeader("Date", date);
  chess.setHeader("White", view!.white.name);
  chess.setHeader("Black", view!.black.name);
  chess.setHeader("Result", game.result ?? "*");
  chess.setHeader("TimeControl", tcText);
  chess.setHeader("Termination", view!.resultText);
  return { text: chess.pgn() + "\n", name: `game-${date.replaceAll(".", "")}-${game.id.slice(0, 8)}.pgn` };
}

export type HistoryPage = Awaited<ReturnType<typeof history>>;
