import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChessShell, Section } from "@/client/components/ChessShell";
import { EmptyState } from "@/client/components/EmptyState";
import { NewChallengeDialog } from "@/client/components/NewChallengeDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { acceptChallenge, cancelChallenge, getPlayHome } from "@/serverFunctions/chess";

export const Route = createFileRoute("/")({
  loader: () => getPlayHome(),
  head: () => ({ meta: [{ title: "Play · Chess Club" }] }),
  component: PlayPage,
});

type Home = Awaited<ReturnType<typeof getPlayHome>>;
type ChallengeView = Home["challenges"]["mine"][number];

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "That didn't work.";
}

function colorFor(c: ChallengeView, mine: boolean) {
  if (c.color === "random") return "Random colours";
  const creatorPlays = c.color;
  const youPlay = mine ? creatorPlays : creatorPlays === "white" ? "black" : "white";
  return `You play ${youPlay}`;
}

function ChallengeMeta({ c, mine }: { c: ChallengeView; mine: boolean }) {
  const range =
    c.minRating !== null || c.maxRating !== null
      ? `Rating ${c.minRating ?? "any"}–${c.maxRating ?? "any"}`
      : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Badge variant="secondary">{c.timeLabel}</Badge>
      <span>{c.rated ? "Rated" : "Casual"}</span>
      <span>{colorFor(c, mine)}</span>
      {range ? <span>{range}</span> : null}
    </div>
  );
}

function PlayPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => void router.invalidate(), 4000);
    return () => clearInterval(timer);
  }, [router]);

  async function accept(id: string) {
    setBusy(id);
    try {
      const { gameId } = await acceptChallenge({ data: { id } });
      await navigate({ to: "/games/$id", params: { id: gameId } });
    } catch (cause) {
      toast.error(errorMessage(cause));
      await router.invalidate();
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    try {
      await cancelChallenge({ data: { id } });
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(null);
      await router.invalidate();
    }
  }

  const { ongoing, challenges, opponents } = data;
  const nothing =
    !ongoing.length && !challenges.mine.length && !challenges.incoming.length && !challenges.open.length;

  return (
    <ChessShell>
      <PageHeader
        title="Play"
        actions={<NewChallengeDialog opponents={opponents} onCreated={() => router.invalidate()} />}
      />
      {nothing ? (
        <EmptyState
          icon={Swords}
          title="No games or challenges yet"
          description={
            <>
              Challenge a member, or <Link to="/bots" className="underline">play a bot</Link>.
            </>
          }
        />
      ) : null}
      {ongoing.length ? (
        <Section title="Your games">
          <div className="space-y-2">
            {ongoing.map((g) => {
              const opponent = g.mySide === "white" ? g.black : g.white;
              return (
                <Link key={g.id} to="/games/$id" params={{ id: g.id }} data-testid="ongoing-game" className="block">
                  <Card className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-accent">
                    <div className="min-w-0">
                      <div className="font-medium">vs {opponent.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {g.timeLabel} · You play {g.mySide}
                      </div>
                    </div>
                    {g.myTurn ? <Badge>Your move</Badge> : <Badge variant="outline">Waiting</Badge>}
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      ) : null}
      {challenges.incoming.length ? (
        <Section title="Challenges for you">
          <div className="space-y-2">
            {challenges.incoming.map((c) => (
              <Card key={c.id} data-testid="incoming-challenge" className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="space-y-1">
                  <div className="font-medium">From {c.creator}</div>
                  <ChallengeMeta c={c} mine={false} />
                </div>
                <Button data-testid="accept-challenge" disabled={busy === c.id} onClick={() => accept(c.id)}>
                  Accept
                </Button>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}
      {challenges.open.length ? (
        <Section title="Open challenges">
          <div className="space-y-2">
            {challenges.open.map((c) => (
              <Card key={c.id} data-testid="open-challenge" className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="space-y-1">
                  <div className="font-medium">{c.creator}</div>
                  <ChallengeMeta c={c} mine={false} />
                </div>
                <Button data-testid="accept-challenge" disabled={busy === c.id} onClick={() => accept(c.id)}>
                  Accept
                </Button>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}
      {challenges.mine.length ? (
        <Section title="Your challenges">
          <div className="space-y-2">
            {challenges.mine.map((c) => (
              <Card key={c.id} data-testid="my-challenge" className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="space-y-1">
                  <div className="font-medium">{c.target ? `To ${c.target}` : "Open to anyone"}</div>
                  <ChallengeMeta c={c} mine />
                </div>
                <Button variant="outline" data-testid="cancel-challenge" disabled={busy === c.id} onClick={() => cancel(c.id)}>
                  Cancel
                </Button>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}
    </ChessShell>
  );
}
