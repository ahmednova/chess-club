import { createFileRoute, Link } from "@tanstack/react-router";
import { Chess } from "chess.js";
import { cn } from "cn";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  FlipVertical2,
  Lightbulb,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Board } from "@/client/components/Board";
import { ChessShell } from "@/client/components/ChessShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/client/components/ui/dialog";
import { capitalize, CLASS_LABELS, formatClock, formatDelta } from "@/client/lib/format";
import { chooseMove } from "@/lib/engine";
import { bot as findBot } from "@/lib/rules";
import { gameAct, getGame, playMove } from "@/serverFunctions/chess";

export const Route = createFileRoute("/games/$id")({
  loader: ({ params }) => getGame({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Game · Chess Club" }] }),
  component: GamePage,
});

type GameView = NonNullable<Awaited<ReturnType<typeof getGame>>>;
type Action = "resign" | "abort" | "offerDraw" | "acceptDraw" | "declineDraw" | "takeback";

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "That didn't work.";
}

function GamePage() {
  const initial = Route.useLoaderData();
  if (!initial) {
    return (
      <ChessShell>
        <PageHeader title="Game" />
        <div data-testid="not-found">
          <EmptyState kind="error" title="Game not found" />
        </div>
      </ChessShell>
    );
  }
  return <Game key={initial.id} initial={initial} />;
}

function Game({ initial }: { initial: GameView }) {
  const [game, setGame] = useState(initial);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const thinking = useRef<string | null>(null);

  const accept = useCallback((next: GameView | null) => {
    if (!next) return;
    setGame(next);
    setReceivedAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    try {
      accept(await getGame({ data: { id: initial.id } }));
    } catch {
      // The next poll tries again.
    }
  }, [accept, initial.id]);

  const active = game.status === "active";
  const isBot = game.kind === "bot";
  const bot = findBot(game.botId);

  // Live games: both players and anyone watching poll for moves.
  useEffect(() => {
    if (!active || isBot) return;
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [active, isBot, refresh]);

  useEffect(() => {
    if (!active || !game.running) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [active, game.running]);

  const history = useMemo(() => {
    const chess = new Chess();
    const fens = [chess.fen()];
    const sans: string[] = [];
    for (const uci of game.moves) {
      sans.push(chess.move(uci).san);
      fens.push(chess.fen());
    }
    return { fens, sans };
  }, [game.moves]);

  const ply = view === null ? game.moves.length : Math.min(view, game.moves.length);
  const fen = history.fens[ply]!;
  const latest = ply === game.moves.length;

  async function move(uci: string) {
    setHint(null);
    setBusy(true);
    try {
      accept(await playMove({ data: { id: game.id, uci } }));
      setView(null);
    } catch (cause) {
      toast.error(errorMessage(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function act(action: Action) {
    setHint(null);
    setBusy(true);
    try {
      accept(await gameAct({ data: { id: game.id, action } }));
      setView(null);
    } catch (cause) {
      toast.error(errorMessage(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  // The bot answers in the browser at its own strength.
  useEffect(() => {
    if (!active || !isBot || !bot || game.toMove === game.mySide) return;
    const key = `${game.moves.length}:${game.moves.at(-1) ?? ""}`;
    if (thinking.current === key) return;
    thinking.current = key;
    const timer = setTimeout(async () => {
      const uci = chooseMove(history.fens.at(-1)!, bot);
      try {
        accept(await playMove({ data: { id: game.id, uci } }));
      } catch (cause) {
        toast.error(errorMessage(cause));
        thinking.current = null;
        await refresh();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [active, isBot, bot, game.toMove, game.mySide, game.moves, game.id, history.fens, accept, refresh]);

  // A clock that reaches zero: ask the server, which ends the game.
  const elapsed = game.running ? now - receivedAt : 0;
  const whiteMs = game.whiteMs - (game.running && game.toMove === "white" ? elapsed : 0);
  const blackMs = game.blackMs - (game.running && game.toMove === "black" ? elapsed : 0);
  const flagged = active && game.running && (whiteMs <= 0 || blackMs <= 0);
  useEffect(() => {
    if (flagged) void refresh();
  }, [flagged, refresh]);

  const mySide = game.mySide;
  const orientation = (mySide ?? "white") === "white" ? (flipped ? "black" : "white") : flipped ? "white" : "black";
  const movable = active && latest && mySide && !busy && game.toMove === mySide ? mySide : null;
  const top = orientation === "white" ? "black" : "white";
  const bottom = orientation;

  let status: string;
  if (!active) status = game.resultText;
  else if (isBot) status = game.toMove === mySide ? "Your move" : `${bot?.name ?? "The bot"} is thinking`;
  else status = `${capitalize(game.toMove)} to move`;

  const clocks = { white: whiteMs, black: blackMs };
  const timed = !isBot;

  function PlayerBar({ side }: { side: "white" | "black" }) {
    const p = game[side];
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground" aria-hidden>
            {side === "white" ? "○" : "●"}
          </span>
          {p.id ? (
            <Link to="/players/$id" params={{ id: p.id }} className="truncate font-medium hover:underline">
              {p.name}
            </Link>
          ) : (
            <span className="truncate font-medium">{p.name}</span>
          )}
          {p.isBot && p.rating ? <span className="text-sm text-muted-foreground">{p.rating}</span> : null}
          {!active && p.delta !== null ? (
            <Badge
              variant="outline"
              data-testid={`rating-change-${side}`}
              className={cn(p.delta > 0 && "text-success", p.delta < 0 && "text-destructive")}
            >
              {formatDelta(p.delta)}
            </Badge>
          ) : null}
        </div>
        {timed ? (
          <span
            data-testid={`clock-${side}`}
            className={cn(
              "rounded-md border border-border px-2 py-0.5 font-mono text-lg tabular-nums",
              active && game.toMove === side && game.running && "bg-primary text-primary-foreground",
            )}
          >
            {formatClock(clocks[side], game.daily)}
          </span>
        ) : null}
      </div>
    );
  }

  const myOffer = game.drawOffer !== null && game.drawOffer === mySide;
  const theirOffer = game.drawOffer !== null && mySide !== null && game.drawOffer !== mySide;

  return (
    <ChessShell>
      <PageHeader
        title={`${game.white.name} vs ${game.black.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{isBot ? "Bot game" : game.timeLabel}</span>
            <span>·</span>
            <span>{CLASS_LABELS[game.timeClass]}</span>
            <span>·</span>
            <span data-testid="game-rated">{game.rated ? "Rated" : "Unrated"}</span>
            {mySide === null && active ? <Badge variant="secondary">Watching</Badge> : null}
          </span>
        }
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="space-y-3">
          <PlayerBar side={top} />
          <Board
            fen={fen}
            orientation={orientation}
            movable={movable}
            onMove={move}
            lastMove={ply > 0 ? game.moves[ply - 1] : null}
            hint={latest ? hint : null}
          />
          <PlayerBar side={bottom} />
        </div>
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <p data-testid="game-status" className="font-medium" aria-live="polite">
              {status}
            </p>
            {theirOffer && active ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Your opponent offers a draw.</p>
                <div className="flex gap-2">
                  <Button size="sm" data-testid="accept-draw" disabled={busy} onClick={() => act("acceptDraw")}>
                    Accept draw
                  </Button>
                  <Button size="sm" variant="outline" data-testid="decline-draw" disabled={busy} onClick={() => act("declineDraw")}>
                    Decline
                  </Button>
                </div>
              </div>
            ) : null}
            {active && mySide ? (
              <div className="flex flex-wrap gap-2">
                {isBot ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="hint"
                      disabled={busy || game.toMove !== mySide}
                      onClick={() => setHint(chooseMove(fen, { depth: 2, noise: 0 }))}
                    >
                      <Lightbulb aria-hidden /> Hint
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="takeback"
                      disabled={busy || game.moves.length === 0}
                      onClick={() => act("takeback")}
                    >
                      <Undo2 aria-hidden /> Take back
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="offer-draw"
                    disabled={busy || myOffer}
                    onClick={() => act("offerDraw")}
                  >
                    {myOffer ? "Draw offered" : "Offer draw"}
                  </Button>
                )}
                {game.moves.length < 2 ? (
                  <Button size="sm" variant="outline" data-testid="abort" disabled={busy} onClick={() => act("abort")}>
                    Abort
                  </Button>
                ) : null}
                <Dialog>
                  <DialogTrigger render={<Button size="sm" variant="destructive" data-testid="resign" disabled={busy} />}>
                    Resign
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Resign this game?</DialogTitle>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Keep playing</DialogClose>
                      <DialogClose
                        render={<Button variant="destructive" data-testid="confirm-resign" onClick={() => act("resign")} />}
                      >
                        Resign
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ) : null}
          </Card>
          <Card className="space-y-3 p-4">
            <ol data-testid="move-list" className="grid max-h-72 grid-cols-[2rem_1fr_1fr] gap-x-1 gap-y-0.5 overflow-y-auto text-sm">
              {history.sans.map((san, i) => (
                <li key={i} className="contents">
                  {i % 2 === 0 ? <span className="py-0.5 text-muted-foreground tabular-nums">{i / 2 + 1}.</span> : null}
                  <button
                    type="button"
                    data-ply={i + 1}
                    data-testid={`ply-${i + 1}`}
                    onClick={() => setView(i + 1)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-left font-mono hover:bg-accent",
                      ply === i + 1 && "bg-accent font-medium",
                    )}
                  >
                    {san}
                  </button>
                </li>
              ))}
            </ol>
            {history.sans.length === 0 ? <p className="text-sm text-muted-foreground">No moves yet.</p> : null}
            <div className="flex flex-wrap gap-1">
              <Button size="icon-sm" variant="outline" aria-label="First move" data-testid="replay-first" onClick={() => setView(0)}>
                <ChevronFirst aria-hidden />
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Previous move" data-testid="replay-prev" onClick={() => setView(Math.max(0, ply - 1))}>
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Next move"
                data-testid="replay-next"
                onClick={() => setView(Math.min(game.moves.length, ply + 1))}
              >
                <ChevronRight aria-hidden />
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Last move" data-testid="replay-last" onClick={() => setView(null)}>
                <ChevronLast aria-hidden />
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Flip board" data-testid="flip" onClick={() => setFlipped((f) => !f)}>
                <FlipVertical2 aria-hidden />
              </Button>
            </div>
            {!active && game.status === "finished" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="download-pgn"
                  nativeButton={false}
                  render={<a href={`/api/games/${game.id}/pgn`} download />}
                >
                  <Download aria-hidden /> PGN
                </Button>
                <Button size="sm" variant="outline" data-testid="copy-pgn" onClick={() => copyPgn(game.id)}>
                  Copy PGN
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </ChessShell>
  );
}

async function copyPgn(id: string) {
  try {
    const response = await fetch(`/api/games/${id}/pgn`);
    if (!response.ok) throw new Error();
    await navigator.clipboard.writeText(await response.text());
    toast.success("PGN copied");
  } catch {
    toast.error("Couldn't copy the PGN.");
  }
}
