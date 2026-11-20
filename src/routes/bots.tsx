import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ChessShell } from "@/client/components/ChessShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Label } from "@/client/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { BOTS } from "@/lib/rules";
import { createBotGame } from "@/serverFunctions/chess";

export const Route = createFileRoute("/bots")({
  head: () => ({ meta: [{ title: "Bots · Chess Club" }] }),
  component: BotsPage,
});

type Color = "white" | "black" | "random";

function BotsPage() {
  const navigate = useNavigate();
  const [color, setColor] = useState<Color>("white");
  const [starting, setStarting] = useState<string | null>(null);

  async function start(botId: string) {
    setStarting(botId);
    try {
      const { id } = await createBotGame({ data: { botId, color } });
      await navigate({ to: "/games/$id", params: { id } });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work.");
      setStarting(null);
    }
  }

  return (
    <ChessShell>
      <PageHeader title="Bots" description="Unrated games with no clock." />
      <div className="space-y-2">
        <Label>Your colour</Label>
        <ToggleGroup
          variant="outline"
          value={[color]}
          onValueChange={(next: unknown[]) => next[0] && setColor(next[0] as Color)}
        >
          {(["white", "black", "random"] as const).map((c) => (
            <ToggleGroupItem key={c} value={c} data-testid={`bot-color-${c}`}>
              {c === "white" ? "White" : c === "black" ? "Black" : "Random"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {BOTS.map((bot) => (
          <Card key={bot.id} data-testid={`bot-${bot.id}`} className="flex flex-row items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="font-medium">{bot.name}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{bot.level}</Badge>
                <span>About {bot.rating}</span>
              </div>
            </div>
            <Button data-testid={`play-bot-${bot.id}`} disabled={starting !== null} onClick={() => start(bot.id)}>
              Play
            </Button>
          </Card>
        ))}
      </div>
    </ChessShell>
  );
}
