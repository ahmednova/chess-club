import { createFileRoute } from "@tanstack/react-router";

// A JSON endpoint for uptime checks. Private like every route.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true }),
    },
  },
});
