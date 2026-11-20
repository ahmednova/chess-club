import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { open, play, plies } from "./lib.mjs";

const runtime = await startRuntime();
try {
  let a = await (await runtime.context("owner")).newPage();
  const b = await (await runtime.context("member")).newPage();
  await open(b, "/");
  await open(a, "/bots");
  await a.getByTestId("bot-color-white").click();
  await Promise.all([a.waitForURL(/\/games\//), a.getByTestId("play-bot-pebble").click()]);
  const path = new URL(a.url()).pathname;
  await expect(a.getByTestId("board")).toHaveAttribute("data-ready", "true");
  await play(a, "e2", "e4");
  await expect.poll(() => plies(a), { timeout: 10_000 }).toBe(2);

  await open(a, "/");
  await a.getByTestId("new-challenge").click();
  await a.getByTestId("opponent-select").click();
  await a.getByRole("option", { name: "member" }).click();
  await a.getByTestId("tc-d7").click();
  await a.getByTestId("create-challenge").click();
  await expect(a.getByTestId("my-challenge")).toHaveCount(1);

  await runtime.restart();

  a = await (await runtime.context("owner")).newPage();
  await open(a, path);
  await expect.poll(() => plies(a)).toBe(2);
  await expect(a.getByTestId("sq-e4")).toHaveAttribute("data-piece", "wP");
  await open(a, "/");
  await expect(a.getByTestId("my-challenge")).toContainText("7 days");
  await expect(a.getByTestId("ongoing-game")).toHaveCount(1);
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
