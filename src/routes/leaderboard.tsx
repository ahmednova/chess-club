import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { z } from "zod";
import { ChessShell } from "@/client/components/ChessShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { CLASS_LABELS } from "@/client/lib/format";
import { TIME_CLASSES } from "@/lib/rules";
import { getLeaderboard } from "@/serverFunctions/chess";

const search = z.object({ class: z.enum(["bullet", "blitz", "rapid", "daily"]).catch("blitz") });

export const Route = createFileRoute("/leaderboard")({
  validateSearch: search,
  loaderDeps: ({ search }) => ({ timeClass: search.class }),
  loader: ({ deps }) => getLeaderboard({ data: { timeClass: deps.timeClass } }),
  head: () => ({ meta: [{ title: "Leaderboard · Chess Club" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const rows = Route.useLoaderData();
  const { class: timeClass } = Route.useSearch();
  const navigate = useNavigate({ from: "/leaderboard" });
  return (
    <ChessShell>
      <PageHeader title="Leaderboard" />
      <ToggleGroup
        variant="outline"
        value={[timeClass]}
        onValueChange={(next: unknown[]) =>
          next[0] && navigate({ search: { class: next[0] as typeof timeClass } })
        }
      >
        {TIME_CLASSES.map((c) => (
          <ToggleGroupItem key={c} value={c} data-testid={`class-${c}`}>
            {CLASS_LABELS[c]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title={`No rated ${CLASS_LABELS[timeClass]!.toLowerCase()} games yet`} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Member</TableHead>
              <TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right">Games</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.id} data-testid="leader-row">
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <Link to="/players/$id" params={{ id: row.id }} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.rating}</TableCell>
                <TableCell className="text-right tabular-nums">{row.played}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ChessShell>
  );
}
