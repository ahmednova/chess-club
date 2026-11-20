import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ensurePlayer } from "@/server/players";
import { pgn } from "@/server/games";

// A finished game as a PGN file. Private like every route: the Gateway
// refuses anyone it hasn't signed in, and the game's own visibility applies.
export const Route = createFileRoute("/api/games/$id/pgn")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Not signed in", { status: 401 });
        await ensurePlayer(user);
        const file = await pgn(user, params.id);
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(file.text, {
          headers: {
            "content-type": "application/x-chess-pgn; charset=utf-8",
            "content-disposition": `attachment; filename="${file.name}"`,
          },
        });
      },
    },
  },
});
