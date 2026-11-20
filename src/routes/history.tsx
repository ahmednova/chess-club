import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { History } from "lucide-react";
import { z } from "zod";
import { ChessShell } from "@/client/components/ChessShell";
import { EmptyState } from "@/client/components/EmptyState";
import { GameRow } from "@/client/components/GameRow";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { getHistory } from "@/serverFunctions/chess";

const search = z.object({
  opponent: z.string().optional().catch(undefined),
  class: z.enum(["bullet", "blitz", "rapid", "daily", "untimed"]).optional().catch(undefined),
  result: z.enum(["win", "loss", "draw"]).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});
type Search = z.infer<typeof search>;

export const Route = createFileRoute("/history")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getHistory({
      data: { opponent: deps.opponent, timeClass: deps.class, result: deps.result, page: deps.page ?? 1 },
    }),
  head: () => ({ meta: [{ title: "History · Chess Club" }] }),
  component: HistoryPage,
});

const CLASSES = [
  { value: "all", label: "All" },
  { value: "bullet", label: "Bullet" },
  { value: "blitz", label: "Blitz" },
  { value: "rapid", label: "Rapid" },
  { value: "daily", label: "Daily" },
  { value: "untimed", label: "Bot" },
];
const RESULTS = [
  { value: "all", label: "All" },
  { value: "win", label: "Won" },
  { value: "draw", label: "Drawn" },
  { value: "loss", label: "Lost" },
];
const ALL = "all";

function Filter({
  value,
  options,
  prefix,
  label,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  prefix: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      aria-label={label}
      className="flex-wrap"
      value={[value]}
      onValueChange={(next: unknown[]) => next[0] && onChange(String(next[0]))}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} data-testid={`${prefix}-${o.value}`}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function HistoryPage() {
  const data = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: "/history" });
  const set = (change: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, ...change, page: change.page ?? undefined }) });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const opponents = [{ value: ALL, label: "All opponents" }, ...data.opponents];
  const filtered = Boolean(filters.opponent || filters.class || filters.result);

  return (
    <ChessShell>
      <PageHeader title="History" />
      <div className="flex flex-wrap items-center gap-3">
        <Select
          items={opponents}
          value={filters.opponent ?? ALL}
          onValueChange={(v) => set({ opponent: v === ALL ? undefined : String(v) })}
        >
          <SelectTrigger data-testid="opponent-select" aria-label="Opponent" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opponents.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Filter
          label="Time class"
          prefix="class"
          value={filters.class ?? ALL}
          options={CLASSES}
          onChange={(v) => set({ class: v === ALL ? undefined : (v as Search["class"]) })}
        />
        <Filter
          label="Result"
          prefix="result"
          value={filters.result ?? ALL}
          options={RESULTS}
          onChange={(v) => set({ result: v === ALL ? undefined : (v as Search["result"]) })}
        />
      </div>
      {data.games.length === 0 ? (
        <EmptyState
          kind={filtered ? "filtered" : "no-data"}
          icon={filtered ? undefined : History}
          title={filtered ? "No games match these filters" : "No finished games yet"}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.games.map((g) => (
                <GameRow key={g.id} game={g} who={g.mySide === "black" ? g.black.id! : g.white.id!} testId="history-row" />
              ))}
            </TableBody>
          </Table>
          {pages > 1 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {data.page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" data-testid="page-prev" disabled={data.page <= 1} onClick={() => set({ page: data.page - 1 })}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" data-testid="page-next" disabled={data.page >= pages} onClick={() => set({ page: data.page + 1 })}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </ChessShell>
  );
}
