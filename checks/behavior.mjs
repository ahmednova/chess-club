import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { open, play, plies } from "./lib.mjs";

const puzzles = JSON.parse(readFileSync(new URL("../src/data/puzzles.json", import.meta.url), "utf8"));
const runtime = await startRuntime();
const gameId = (page) => new URL(page.url()).pathname.split("/").pop();

async function challenge(page, { opponent, tc, color, rated }) {
  await page.getByTestId("new-challenge").click();
  await page.getByTestId("opponent-select").click();
  await page.getByRole("option", { name: opponent }).click();
  await page.getByTestId(`tc-${tc}`).click();
  await page.getByTestId(`color-${color}`).click();
  const box = page.getByTestId("rated");
  if ((await box.getAttribute("aria-checked")) !== String(rated)) await box.click();
  await page.getByTestId("create-challenge").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function accept(page, from) {
  await open(page, "/");
  const row = page.getByTestId("incoming-challenge").filter({ hasText: from }).first();
  await Promise.all([page.waitForURL(/\/games\//), row.getByTestId("accept-challenge").click()]);
  await expect(page.getByTestId("board")).toBeVisible();
}

async function expectPlies(page, n) {
  await expect.poll(() => plies(page), { timeout: 10_000 }).toBe(n);
}

try {
  const a = await (await runtime.context("owner")).newPage();
  const b = await (await runtime.context("member")).newPage();
  await open(b, "/");
  await open(a, "/");
  await runtime.assertBackLink(a);
  await expect(a.getByRole("heading", { level: 1 })).toHaveText("Play");

  // F001: a challenge addressed to one member, accepted and played to checkmate.
  await challenge(a, { opponent: "member", tc: "5+0", color: "white", rated: true });
  await expect(a.getByTestId("my-challenge").first()).toContainText("member");
  await accept(b, "owner");
  const mateId = gameId(b);
  await open(a, `/games/${mateId}`);
  await expect(a.getByTestId("game-status")).toContainText("White to move");
  await expect(a.getByTestId("clock-white")).toHaveText("5:00");
  await expect(b.getByTestId("clock-black")).toHaveText("5:00");
  // Not your piece, not your turn: nothing happens.
  await play(a, "e7", "e5");
  await play(b, "e7", "e5");
  await expect.poll(() => plies(a)).toBe(0);
  const line = [[a, "e2", "e4"], [b, "e7", "e5"], [a, "f1", "c4"], [b, "b8", "c6"], [a, "d1", "h5"], [b, "g8", "f6"]];
  for (const [i, [page, from, to]] of line.entries()) {
    await play(page, from, to);
    await expectPlies(a, i + 1);
    await expectPlies(b, i + 1);
  }
  // An illegal move is refused.
  await play(a, "h5", "h8");
  await expect.poll(() => plies(a)).toBe(6);
  await play(a, "h5", "f7");
  await expect(a.getByTestId("game-status")).toContainText("White won by checkmate");
  await expect(b.getByTestId("game-status")).toContainText("White won by checkmate");
  await expect(a.getByTestId("rating-change-white")).toHaveText("+16");
  await expect(b.getByTestId("rating-change-black")).toHaveText("-16");

  // A reload restores the position.
  await b.reload();
  await expect(b.getByTestId("sq-f7")).toHaveAttribute("data-piece", "wQ");

  // F001: an open daily challenge, accepted by another member; abort before both have moved.
  await open(b, "/");
  await challenge(b, { opponent: "Anyone", tc: "d3", color: "white", rated: false });
  await expect(b.getByTestId("my-challenge").first()).toContainText("3 days");
  await open(a, "/");
  const open3 = a.getByTestId("open-challenge").filter({ hasText: "member" }).first();
  await Promise.all([a.waitForURL(/\/games\//), open3.getByTestId("accept-challenge").click()]);
  const dailyId = gameId(a);
  await open(b, "/");
  await expect(b.getByTestId("ongoing-game").first()).toContainText("Your move");
  await open(b, `/games/${dailyId}`);
  await expect(b.getByTestId("clock-white")).toContainText("3d");
  await b.getByTestId("abort").click();
  await expect(b.getByTestId("game-status")).toContainText("aborted");

  // F001: a creator cancels a pending challenge.
  await open(a, "/");
  await challenge(a, { opponent: "Anyone", tc: "10+0", color: "random", rated: true });
  const mine = a.getByTestId("my-challenge").filter({ hasText: "10+0" });
  await expect(mine).toHaveCount(1);
  await mine.getByTestId("cancel-challenge").click();
  await expect(mine).toHaveCount(0);
  await open(b, "/");
  await expect(b.getByTestId("open-challenge").filter({ hasText: "10+0" })).toHaveCount(0);

  // F001: agreed draw.
  await open(a, "/");
  await challenge(a, { opponent: "member", tc: "15+10", color: "black", rated: true });
  await accept(b, "owner");
  const drawId = gameId(b);
  await open(a, `/games/${drawId}`);
  await play(b, "d2", "d4");
  await expectPlies(a, 1);
  await a.getByTestId("offer-draw").click();
  await expect(b.getByTestId("accept-draw")).toBeVisible({ timeout: 10_000 });
  await b.getByTestId("accept-draw").click();
  await expect(a.getByTestId("game-status")).toContainText("Draw by agreement");

  // F001: timeout. The clock for the side to move runs out.
  await open(a, "/");
  await challenge(a, { opponent: "member", tc: "1+0", color: "white", rated: true });
  await accept(b, "owner");
  const flagId = gameId(b);
  await open(a, `/games/${flagId}`);
  await play(a, "e2", "e4");
  await expectPlies(b, 1);
  await play(b, "e7", "e5");
  await expectPlies(a, 2);
  await (await runtime.database()).prepare("UPDATE games SET turn_started_at = turn_started_at - 120000 WHERE id = ?").bind(flagId).run();
  await a.reload();
  await expect(a.getByTestId("game-status")).toContainText("Black won on time");

  // F002: a bot game with a hint, a takeback and a resignation.
  await open(a, "/bots");
  await expect(a.getByTestId("bot-pebble")).toContainText("400");
  await a.getByTestId("bot-color-white").click();
  await Promise.all([a.waitForURL(/\/games\//), a.getByTestId("play-bot-pebble").click()]);
  const botId = gameId(a);
  await expect(a.getByTestId("board")).toHaveAttribute("data-ready", "true");
  await play(a, "e2", "e4");
  await expectPlies(a, 2);
  await a.getByTestId("hint").click();
  await expect(a.locator("[data-hint='true']")).toHaveCount(2);
  await a.getByTestId("takeback").click();
  await expectPlies(a, 0);
  await play(a, "d2", "d4");
  await expectPlies(a, 2);
  await a.reload();
  await expectPlies(a, 2);
  await a.getByTestId("resign").click();
  await a.getByTestId("confirm-resign").click();
  await expect(a.getByTestId("game-status")).toContainText("Black won by resignation");
  await expect(a.getByTestId("game-rated")).toHaveText("Unrated");

  // F003: puzzles, one solved and one failed.
  await open(a, "/puzzles");
  await expect(a.getByTestId("puzzle-rating")).toHaveText("1200");
  const solve = async (right) => {
    const board = a.getByTestId("board");
    await expect(board).toHaveAttribute("data-ready", "true");
    const id = await board.getAttribute("data-puzzle-id");
    const puzzle = puzzles.find((p) => p.id === id);
    expect(puzzle).toBeTruthy();
    if (!right) {
      const chess = new Chess(puzzle.fen);
      const ok = chess.moves({ verbose: true }).find((m) => {
        if (m.lan === puzzle.moves[0]) return false;
        chess.move(m.lan);
        const mate = chess.isCheckmate();
        chess.undo();
        return !mate;
      });
      await play(a, ok.from, ok.to);
      if (ok.promotion) await a.getByTestId(`promote-${ok.promotion}`).click();
      return;
    }
    for (let i = 0; i < puzzle.moves.length; i += 2) {
      const uci = puzzle.moves[i];
      await expect(a.getByTestId("puzzle-status")).toHaveText("Your move");
      await play(a, uci.slice(0, 2), uci.slice(2, 4));
      if (uci.length > 4) await a.getByTestId(`promote-${uci[4]}`).click();
    }
  };
  await solve(true);
  await expect(a.getByTestId("puzzle-status")).toHaveText("Solved");
  await expect.poll(async () => Number(await a.getByTestId("puzzle-rating").textContent())).toBeGreaterThan(1200);
  await expect(a.getByTestId("attempt-row")).toHaveCount(1);
  const afterWin = Number(await a.getByTestId("puzzle-rating").textContent());
  const firstId = await a.getByTestId("board").getAttribute("data-puzzle-id");
  await a.getByTestId("next-puzzle").click();
  await expect(a.getByTestId("board")).not.toHaveAttribute("data-puzzle-id", firstId);
  await expect(a.getByTestId("puzzle-status")).toHaveText("Your move");
  await solve(false);
  await expect(a.getByTestId("puzzle-status")).toHaveText("Incorrect");
  await expect(a.getByTestId("show-solution")).toBeVisible();
  await expect.poll(async () => Number(await a.getByTestId("puzzle-rating").textContent())).toBeLessThan(afterWin);
  await expect(a.getByTestId("attempt-row")).toHaveCount(2);
  await expect(a.getByTestId("attempt-row").first()).toContainText("Failed");

  // F004: leaderboard and profile.
  await open(b, "/leaderboard");
  await b.getByTestId("class-blitz").click();
  const rows = b.getByTestId("leader-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("owner");
  await expect(rows.nth(0)).toContainText("1216");
  await expect(rows.nth(1)).toContainText("1184");
  await Promise.all([b.waitForURL(/\/players\//), rows.nth(0).getByRole("link").click()]);
  await expect(b.getByTestId("rating-blitz")).toHaveText("1216");
  await expect(b.getByTestId("rating-bullet")).toHaveText("1184");
  await expect(b.getByTestId("record-wins")).toHaveText("1");
  await expect(b.getByTestId("record-draws")).toHaveText("1");
  await expect(b.getByTestId("record-losses")).toHaveText("1");
  await expect(b.getByTestId("recent-game").first()).toBeVisible();

  // F005: history with filters, replay and PGN.
  await open(a, "/history");
  await expect(a.getByTestId("history-row")).toHaveCount(4);
  await a.getByTestId("result-loss").click();
  await expect(a.getByTestId("history-row")).toHaveCount(2);
  await expect(a.getByTestId("history-row").filter({ hasText: "Pebble" })).toHaveCount(1);
  await a.getByTestId("result-all").click();
  await a.getByTestId("class-blitz").click();
  await expect(a.getByTestId("history-row")).toHaveCount(1);
  await a.getByTestId("class-all").click();
  await a.getByTestId("opponent-select").click();
  await a.getByRole("option", { name: "member" }).click();
  await expect(a.getByTestId("history-row")).toHaveCount(3);

  const pgn = await runtime.fetch(`/api/games/${mateId}/pgn`, { role: "member" });
  expect(pgn.status).toBe(200);
  const text = await pgn.text();
  for (const part of ['[White "owner"]', '[Black "member"]', '[Result "1-0"]', '[TimeControl "300+0"]', '[Termination "', "[Date \"", "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#"]) expect(text).toContain(part);

  await open(b, `/games/${mateId}`);
  await b.getByTestId("replay-first").click();
  await expect(b.getByTestId("sq-e2")).toHaveAttribute("data-piece", "wP");
  await b.getByTestId("replay-next").click();
  await expect(b.getByTestId("sq-e4")).toHaveAttribute("data-piece", "wP");
  await b.getByTestId("replay-prev").click();
  await expect(b.getByTestId("sq-e4")).not.toHaveAttribute("data-piece", /./);
  await b.getByTestId("ply-5").click();
  await expect(b.getByTestId("sq-h5")).toHaveAttribute("data-piece", "wQ");
  await b.getByTestId("replay-last").click();
  await expect(b.getByTestId("sq-f7")).toHaveAttribute("data-piece", "wQ");
  const orientation = await b.getByTestId("board").getAttribute("data-orientation");
  await b.getByTestId("flip").click();
  await expect(b.getByTestId("board")).not.toHaveAttribute("data-orientation", orientation);
  await expect(b.getByTestId("download-pgn")).toHaveAttribute("href", `/api/games/${mateId}/pgn`);

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await open(phone, `/games/${mateId}`);
  const box = await phone.getByTestId("board").boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  await open(phone, "/");
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Play");

  // The finished game, as the app's picture.
  await open(a, `/games/${mateId}`);
  await expect(a.getByTestId("game-status")).toContainText("White won by checkmate");
  await runtime.screenshot(a);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
