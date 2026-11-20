import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { open, play, plies, replayAs, isServerFn, refused } from "./lib.mjs";

const runtime = await startRuntime();
const gameId = (page) => new URL(page.url()).pathname.split("/").pop();
const db = () => runtime.database();
const row = async (sql, ...args) => (await db()).prepare(sql).bind(...args).first();

/** Runs `action` and returns the server function request it makes, without letting it through. */
async function capture(page, action) {
  let captured;
  const handler = async (route) => {
    if (!captured && isServerFn(route.request())) {
      captured = route.request();
      return route.abort();
    }
    return route.continue();
  };
  await page.route("**/_serverFn/**", handler);
  await action();
  await expect.poll(() => Boolean(captured)).toBe(true);
  await page.unroute("**/_serverFn/**", handler);
  return captured;
}

async function challenge(page, { opponent, tc, color }) {
  await page.getByTestId("new-challenge").click();
  await page.getByTestId("opponent-select").click();
  await page.getByRole("option", { name: opponent }).click();
  await page.getByTestId(`tc-${tc}`).click();
  await page.getByTestId(`color-${color}`).click();
  await page.getByTestId("create-challenge").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

try {
  // X001: anonymous visitors and other organizations are refused everywhere.
  await runtime.assertPrivateAccess(["/", "/bots", "/puzzles", "/leaderboard", "/history"]);
  for (const role of [undefined, "outsider"]) {
    for (const path of ["/", "/games/x", "/api/games/x/pgn", "/players/owner"]) {
      const res = await runtime.fetch(path, { role });
      expect([401, 403, 302, 303]).toContain(res.status);
    }
  }
  // No sign-in of its own.
  for (const path of ["/login", "/signin", "/signup", "/logout", "/register"]) {
    const res = await runtime.fetch(path, { role: "member" });
    expect(res.status).toBe(404);
  }
  const home = await (await runtime.fetch("/", { role: "member" })).text();
  expect(home).not.toMatch(/type="password"/i);

  const a = await (await runtime.context("owner")).newPage();
  const b = await (await runtime.context("member")).newPage();
  await open(b, "/");
  await open(a, "/");

  // A bot game is visible only to its player.
  await open(a, "/bots");
  await a.getByTestId("bot-color-white").click();
  await Promise.all([a.waitForURL(/\/games\//), a.getByTestId("play-bot-pebble").click()]);
  const botId = gameId(a);
  await expect(a.getByTestId("board")).toHaveAttribute("data-ready", "true");
  await open(b, `/games/${botId}`);
  await expect(b.getByTestId("not-found")).toBeVisible();
  await expect(b.getByTestId("board")).toHaveCount(0);
  expect((await runtime.fetch(`/api/games/${botId}/pgn`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/api/games/${botId}/pgn`, { role: "owner" })).status).toBe(200);

  // Another member cannot move in someone's bot game.
  const botMove = await capture(a, () => play(a, "e2", "e4"));
  const forged = await replayAs(runtime, botMove, "member");
  expect(await refused(forged)).toBe(true);
  expect((await row("SELECT moves FROM games WHERE id = ?", botId)).moves).toBe("");

  // A member cannot accept their own challenge; another can.
  await open(b, "/");
  await challenge(b, { opponent: "Anyone", tc: "3+2", color: "white" });
  await expect(b.getByTestId("my-challenge").first().getByTestId("accept-challenge")).toHaveCount(0);
  await open(a, "/");
  const card = a.getByTestId("open-challenge").filter({ hasText: "3+2" }).first();
  const acceptCall = await capture(a, () => card.getByTestId("accept-challenge").click());
  const own = await replayAs(runtime, acceptCall, "member");
  expect(await refused(own)).toBe(true);
  const pending = await row("SELECT status FROM challenges WHERE creator_id = 'member' ORDER BY created_at DESC LIMIT 1");
  expect(pending.status).toBe("pending");

  // Only the creator can cancel a challenge.
  await open(b, "/");
  const cancelCall = await capture(b, () => b.getByTestId("my-challenge").first().getByTestId("cancel-challenge").click());
  const notMine = await replayAs(runtime, cancelCall, "owner");
  expect(await refused(notMine)).toBe(true);
  expect((await row("SELECT status FROM challenges WHERE creator_id = 'member' ORDER BY created_at DESC LIMIT 1")).status).toBe("pending");
  expect(await refused(await replayAs(runtime, cancelCall, "member"))).toBe(false);
  expect((await row("SELECT status FROM challenges WHERE creator_id = 'member' ORDER BY created_at DESC LIMIT 1")).status).toBe("cancelled");

  // In a game between members, only the side to move can move, and resigning is a player's own act.
  await open(a, "/");
  await challenge(a, { opponent: "member", tc: "10+0", color: "white" });
  await open(b, "/");
  await Promise.all([b.waitForURL(/\/games\//), b.getByTestId("incoming-challenge").first().getByTestId("accept-challenge").click()]);
  const liveId = gameId(b);
  await open(a, `/games/${liveId}`);
  const whiteMove = await capture(a, () => play(a, "e2", "e4"));
  expect(await refused(await replayAs(runtime, whiteMove, "member"))).toBe(true);
  expect((await row("SELECT moves FROM games WHERE id = ?", liveId)).moves).toBe("");
  // The owner's own move goes through.
  expect(await refused(await replayAs(runtime, whiteMove, "owner"))).toBe(false);
  expect((await row("SELECT moves FROM games WHERE id = ?", liveId)).moves).toBe("e2e4");
  await b.reload();
  await expect.poll(() => plies(b)).toBe(1);

  // Puzzle history is each member's own.
  await open(a, "/puzzles");
  await expect(a.getByTestId("puzzle-rating")).toHaveText("1200");
  await open(b, "/puzzles");
  await expect(b.getByTestId("attempt-row")).toHaveCount(0);
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
