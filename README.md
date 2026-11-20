# Chess Club

A private chess club for your organization: members play each other live or by the day, play bots, solve puzzles, and keep ratings and a full game archive.

Inspired by https://chess.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Challenge one member or anyone in a rating range to a live or daily game, rated or casual, and play it with clocks.
- Play bots from beginner to master, with hints and takebacks.
- Solve checkmate puzzles matched to your puzzle rating.
- Climb bullet, blitz, rapid and daily leaderboards and see each member's ratings and record.
- Browse, filter and replay finished games, and download them as PGN.

Left out: lessons and coaching, game review, tournaments and variants, news and videos, forums and messaging, memberships, fair-play checks, native apps, and accounts and sign-in, which your Gateway handles.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`
- Test: `pnpm test`; the browser checks in `checks/` run against a packaged release.
- Deploy: `pnpm run deploy`

There are no secrets or settings to fill in: the app stores everything in its own D1 database.

## Limitations

- Live games refresh about once a second rather than over a socket.
- Bots think in the browser, so the strongest one can take a few seconds on a slow phone.
- The puzzle set is a fixed bundle of mate-in-one and mate-in-two positions.
- Only members who have opened the app once can be challenged by name.
