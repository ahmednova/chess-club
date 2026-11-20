import { Chess, type Square } from "chess.js";
import { cn } from "cn";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";

const GLYPHS: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PROMOTIONS = [
  { piece: "q", label: "Queen" },
  { piece: "r", label: "Rook" },
  { piece: "b", label: "Bishop" },
  { piece: "n", label: "Knight" },
];

export function glyph(color: string, type: string): string {
  return `${GLYPHS[color + type]}︎`;
}

/**
 * A board you play by clicking a piece, then its square. Only the side in
 * `movable` can be picked up, and only legal moves are offered.
 */
export function Board({
  fen,
  orientation,
  movable,
  onMove,
  lastMove,
  hint,
  puzzleId,
}: {
  fen: string;
  orientation: "white" | "black";
  movable: "white" | "black" | null;
  onMove?: (uci: string) => void;
  lastMove?: string | null;
  hint?: string | null;
  puzzleId?: string;
}) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => setSelected(null), [fen]);

  const turn = chess.turn() === "w" ? "white" : "black";
  const canMove = movable !== null && movable === turn;
  const targets = useMemo(
    () => (selected && canMove ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, selected, canMove],
  );

  function click(square: Square) {
    if (!canMove) return;
    const piece = chess.get(square);
    if (selected) {
      const options = targets.filter((m) => m.to === square);
      if (options.length) {
        setSelected(null);
        if (options.some((m) => m.promotion)) setPromotion({ from: selected, to: square });
        else onMove?.(options[0]!.lan);
        return;
      }
    }
    if (piece && piece.color === chess.turn()) setSelected(square === selected ? null : square);
    else setSelected(null);
  }

  const ranks = orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const last = lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : [];
  const hinted = hint ? [hint.slice(0, 2), hint.slice(2, 4)] : [];

  return (
    <>
      <div
        data-testid="board"
        data-ready={ready ? "true" : "false"}
        data-orientation={orientation}
        data-puzzle-id={puzzleId}
        className="grid aspect-square w-full max-w-[min(100%,32rem)] grid-cols-8 overflow-hidden rounded-lg border border-border select-none"
      >
        {ranks.map((rank, r) =>
          files.map((file, f) => {
            const square = `${file}${rank}` as Square;
            const piece = chess.get(square);
            const dark = (r + f) % 2 === 1;
            const target = targets.some((m) => m.to === square);
            return (
              <button
                key={square}
                type="button"
                data-testid={`sq-${square}`}
                data-piece={piece ? `${piece.color}${piece.type.toUpperCase()}` : undefined}
                data-hint={hinted.includes(square) ? "true" : undefined}
                aria-label={square}
                onClick={() => click(square)}
                className={cn(
                  "relative flex aspect-square items-center justify-center text-[clamp(1.25rem,8vw,2.75rem)] leading-none text-foreground",
                  dark ? "bg-primary/30" : "bg-card",
                  last.includes(square) && "bg-warning/45",
                  hinted.includes(square) && "bg-info/50",
                  selected === square && "ring-3 ring-primary ring-inset",
                  canMove ? "cursor-pointer" : "cursor-default",
                )}
              >
                {piece ? glyph(piece.color, piece.type) : null}
                {target ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute rounded-full",
                      piece ? "inset-1 border-4 border-foreground/25" : "size-1/4 bg-foreground/25",
                    )}
                  />
                ) : null}
                {f === 0 ? (
                  <span className="absolute top-0.5 left-1 text-[0.6rem] text-muted-foreground">{rank}</span>
                ) : null}
                {r === 7 ? (
                  <span className="absolute right-1 bottom-0.5 text-[0.6rem] text-muted-foreground">{file}</span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>
      <Dialog open={promotion !== null} onOpenChange={(open) => !open && setPromotion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote to</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {PROMOTIONS.map(({ piece, label }) => (
              <Button
                key={piece}
                variant="outline"
                size="lg"
                data-testid={`promote-${piece}`}
                aria-label={label}
                className="h-16 text-4xl"
                onClick={() => {
                  if (promotion) onMove?.(`${promotion.from}${promotion.to}${piece}`);
                  setPromotion(null);
                }}
              >
                {glyph(chess.turn(), piece)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
