import { createFileRoute } from "@tanstack/react-router";
import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Board } from "@/client/components/Board";
import { ChessShell, Section } from "@/client/components/ChessShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/client/components/ui/table";
import { formatDelta } from "@/client/lib/format";
import { getPuzzlePage, recordAttempt } from "@/serverFunctions/chess";

export const Route = createFileRoute("/puzzles")({
  loader: () => getPuzzlePage({ data: {} }),
  head: () => ({ meta: [{ title: "Puzzles · Chess Club" }] }),
  component: PuzzlesPage,
});

type PageData = Awaited<ReturnType<typeof getPuzzlePage>>;
type State = "playing" | "replying" | "solved" | "failed";

function PuzzlesPage() {
  const initial = Route.useLoaderData();
  const [data, setData] = useState<PageData>(initial);
  const [line, setLine] = useState<string[]>([]);
  const [state, setState] = useState<State>("playing");
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const startedAt = useRef(Date.now());
  const { puzzle } = data;

  const solver = useMemo(() => (new Chess(puzzle.fen).turn() === "w" ? "white" : "black"), [puzzle.fen]);
  const shown = showing ? puzzle.moves : line;
  const fen = useMemo(() => {
    const chess = new Chess(puzzle.fen);
    for (const uci of shown) chess.move(uci);
    return chess.fen();
  }, [puzzle.fen, shown]);

  useEffect(() => {
    if (state !== "replying") return;
    const timer = setTimeout(() => {
      setLine((current) => [...current, puzzle.moves[current.length]!]);
      setState("playing");
    }, 400);
    return () => clearTimeout(timer);
  }, [state, puzzle.moves]);

  async function finish(solved: boolean, played: string[]) {
    setState(solved ? "solved" : "failed");
    const solverMoves = played.filter((_, i) => i % 2 === 0);
    try {
      const result = await recordAttempt({
        data: { puzzleId: puzzle.id, moves: solverMoves, ms: Date.now() - startedAt.current },
      });
      setData((d) => ({
        ...d,
        rating: result.rating,
        attempts: [
          {
            id: crypto.randomUUID(),
            puzzleId: puzzle.id,
            rating: puzzle.rating,
            solved: result.solved,
            ms: Date.now() - startedAt.current,
            change: result.change,
            createdAt: Date.now(),
          },
          ...d.attempts,
        ].slice(0, 10),
      }));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That attempt wasn't saved.");
    }
  }

  function move(uci: string) {
    if (state !== "playing") return;
    const index = line.length;
    const expected = puzzle.moves[index]!;
    const last = index === puzzle.moves.length - 1;
    const played = [...line, uci];
    let right = uci === expected;
    if (!right && last) {
      const chess = new Chess(fen);
      chess.move(uci);
      right = chess.isCheckmate();
    }
    setLine(played);
    if (!right) return void finish(false, played);
    if (last) return void finish(true, played);
    setState("replying");
  }

  async function next() {
    setLoading(true);
    try {
      const fresh = await getPuzzlePage({ data: { skip: puzzle.id } });
      setData(fresh);
      setLine([]);
      setShowing(false);
      setState("playing");
      startedAt.current = Date.now();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't load a puzzle.");
    } finally {
      setLoading(false);
    }
  }

  const status =
    state === "solved" ? "Solved" : state === "failed" ? "Incorrect" : state === "replying" ? "Their reply" : "Your move";

  return (
    <ChessShell>
      <PageHeader
        title="Puzzles"
        description={
          <span>
            Your puzzle rating{" "}
            <span data-testid="puzzle-rating" className="font-semibold text-foreground tabular-nums">
              {data.rating}
            </span>
          </span>
        }
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <Board
          key={puzzle.id}
          fen={fen}
          orientation={solver}
          movable={state === "playing" && !showing ? solver : null}
          onMove={move}
          lastMove={shown.at(-1) ?? null}
          puzzleId={puzzle.id}
        />
        <Card className="h-fit space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p data-testid="puzzle-status" className="font-medium" aria-live="polite">
              {status}
            </p>
            <Badge variant="secondary">{puzzle.rating}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {solver === "white" ? "White" : "Black"} to play and mate in {Math.ceil(puzzle.moves.length / 2)}.
          </p>
          {state === "failed" && !showing ? (
            <Button variant="outline" size="sm" data-testid="show-solution" onClick={() => setShowing(true)}>
              Show solution
            </Button>
          ) : null}
          {state === "solved" || state === "failed" ? (
            <Button size="sm" data-testid="next-puzzle" disabled={loading} onClick={next}>
              Next puzzle
            </Button>
          ) : null}
        </Card>
      </div>
      <Section title="Recent attempts">
        {data.attempts.length === 0 ? (
          <EmptyState title="No attempts yet" />
        ) : (
          <Table>
            <TableBody>
              {data.attempts.map((a) => (
                <TableRow key={a.id} data-testid="attempt-row">
                  <TableCell className="tabular-nums">{a.rating ?? ""}</TableCell>
                  <TableCell>
                    <Badge variant={a.solved ? "default" : "destructive"}>{a.solved ? "Solved" : "Failed"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{Math.round(a.ms / 1000)}s</TableCell>
                  <TableCell className="text-right tabular-nums">{a.change === 0 ? "—" : formatDelta(a.change)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </ChessShell>
  );
}
