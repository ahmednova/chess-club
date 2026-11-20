import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

/** Opens a page and waits until the app has hydrated. */
export async function open(page, path) {
  await page.goto(path);
  await expect(page.locator("body[data-ready='true']")).toBeAttached({ timeout: 15_000 });
}

/** Plays one move by clicking its two squares. */
export async function play(page, from, to) {
  await page.getByTestId(`sq-${from}`).click();
  await page.getByTestId(`sq-${to}`).click();
}

export async function plies(page) {
  return page.getByTestId("move-list").locator("[data-ply]").count();
}

/** Replays a captured server function call as another role, through the perimeter. */
export async function replayAs(runtime, request, role) {
  const url = new URL(request.url());
  const headers = { ...(await request.allHeaders()) };
  for (const name of Object.keys(headers)) {
    if (["cookie", "host", "content-length"].includes(name.toLowerCase()) || name.startsWith(":")) delete headers[name];
  }
  return runtime.fetch(url.pathname + url.search, {
    role,
    method: request.method(),
    headers,
    body: request.postData() ?? undefined,
  });
}

export const isServerFn = (request) => request.url().includes("/_serverFn/") && request.method() === "POST";

/** Whether a server function call was refused: an error status, or the framework's serialized error. */
export async function refused(response) {
  if (!response.ok) return true;
  return (await response.text()).includes("$TSR/Error");
}
