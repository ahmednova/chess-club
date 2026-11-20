import { Link } from "@tanstack/react-router";
import { Badge } from "@/client/components/ui/badge";
import { TableCell, TableRow } from "@/client/components/ui/table";
import { CLASS_LABELS, formatDate } from "@/client/lib/format";

interface Row {
  id: string;
  white: { name: string; id: string | null };
  black: { name: string; id: string | null };
  result: string | null;
  termination: string | null;
  timeLabel: string;
  timeClass: string;
  rated: boolean;
  endedAt: number | null;
}

/** One finished game, from `who`'s side when they played in it. */
export function GameRow({ game, who, testId }: { game: Row; who: string; testId: string }) {
  const side = game.white.id === who ? "white" : game.black.id === who ? "black" : null;
  const opponent = side === "black" ? game.white : game.black;
  let outcome: "Won" | "Lost" | "Draw" | null = null;
  if (game.result === "1/2-1/2") outcome = "Draw";
  else if (side && game.result) outcome = (game.result === "1-0") === (side === "white") ? "Won" : "Lost";
  return (
    <TableRow data-testid={testId}>
      <TableCell>
        <Link to="/games/$id" params={{ id: game.id }} className="font-medium hover:underline">
          {side ? `vs ${opponent.name}` : `${game.white.name} vs ${game.black.name}`}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {game.timeClass === "untimed" ? CLASS_LABELS.untimed : `${game.timeLabel} ${CLASS_LABELS[game.timeClass]}`}
        {game.rated ? "" : " · casual"}
      </TableCell>
      <TableCell>
        {outcome ? (
          <Badge variant={outcome === "Won" ? "default" : outcome === "Lost" ? "destructive" : "secondary"}>
            {outcome}
          </Badge>
        ) : (
          <span className="tabular-nums">{game.result}</span>
        )}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{formatDate(game.endedAt)}</TableCell>
    </TableRow>
  );
}
