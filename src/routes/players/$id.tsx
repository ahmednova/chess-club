import { createFileRoute } from "@tanstack/react-router";
import { ChessShell, Section } from "@/client/components/ChessShell";
import { EmptyState } from "@/client/components/EmptyState";
import { GameRow } from "@/client/components/GameRow";
import { PageHeader } from "@/client/components/PageHeader";
import { Card } from "@/client/components/ui/card";
import { Table, TableBody } from "@/client/components/ui/table";
import { getProfile } from "@/serverFunctions/chess";

export const Route = createFileRoute("/players/$id")({
  loader: ({ params }) => getProfile({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Member · Chess Club" }] }),
  component: ProfilePage,
});

const RATINGS = [
  { key: "bullet", label: "Bullet" },
  { key: "blitz", label: "Blitz" },
  { key: "rapid", label: "Rapid" },
  { key: "daily", label: "Daily" },
  { key: "puzzle", label: "Puzzles" },
] as const;

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <Card className="gap-1 p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div data-testid={testId} className="text-2xl font-semibold tabular-nums">
        {value}
      </div>
    </Card>
  );
}

function ProfilePage() {
  const profile = Route.useLoaderData();
  if (!profile) {
    return (
      <ChessShell>
        <PageHeader title="Member" />
        <div data-testid="not-found">
          <EmptyState kind="error" title="No such member" />
        </div>
      </ChessShell>
    );
  }
  return (
    <ChessShell>
      <PageHeader title={profile.isMe ? `${profile.name} (you)` : profile.name} />
      <Section title="Ratings">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {RATINGS.map((r) => (
            <Stat key={r.key} label={r.label} value={profile.ratings[r.key]} testId={`rating-${r.key}`} />
          ))}
        </div>
      </Section>
      <Section title="Games against members">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Won" value={profile.record.wins} testId="record-wins" />
          <Stat label="Drawn" value={profile.record.draws} testId="record-draws" />
          <Stat label="Lost" value={profile.record.losses} testId="record-losses" />
        </div>
      </Section>
      <Section title="Recent games">
        {profile.recent.length === 0 ? (
          <EmptyState title="No finished games yet" />
        ) : (
          <Table>
            <TableBody>
              {profile.recent.map((g) => (
                <GameRow key={g.id} game={g} who={profile.id} testId="recent-game" />
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </ChessShell>
  );
}
