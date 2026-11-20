import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/client/components/ui/toggle-group";
import { TIME_CONTROLS } from "@/lib/rules";
import { createChallenge } from "@/serverFunctions/chess";

const ANYONE = "anyone";

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  prefix,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  prefix: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <ToggleGroup
        variant="outline"
        className="flex-wrap"
        value={[value]}
        onValueChange={(next: unknown[]) => next[0] && onChange(next[0] as T)}
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} data-testid={`${prefix}-${o.value}`}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function NewChallengeDialog({
  opponents,
  onCreated,
}: {
  opponents: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(ANYONE);
  const [tc, setTc] = useState("10+0");
  const [color, setColor] = useState<"white" | "black" | "random">("random");
  const [rated, setRated] = useState(true);
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [saving, setSaving] = useState(false);
  const items = [
    { value: ANYONE, label: "Anyone" },
    ...opponents.map((o) => ({ value: o.id, label: o.name })),
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const open = target === ANYONE;
      await createChallenge({
        data: {
          targetId: open ? null : target,
          timeControl: tc,
          color,
          rated,
          minRating: open && minRating ? Number(minRating) : null,
          maxRating: open && maxRating ? Number(maxRating) : null,
        },
      });
      setOpen(false);
      onCreated();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-testid="new-challenge" />}>New challenge</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New challenge</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label id="opponent-label">Opponent</Label>
            <Select items={items} value={target} onValueChange={(v) => setTarget(String(v))}>
              <SelectTrigger data-testid="opponent-select" aria-labelledby="opponent-label" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Choice
            label="Time control"
            prefix="tc"
            value={tc}
            onChange={setTc}
            options={TIME_CONTROLS.map((t) => ({ value: t.key, label: t.label }))}
          />
          <Choice
            label="Your colour"
            prefix="color"
            value={color}
            onChange={setColor}
            options={[
              { value: "white", label: "White" },
              { value: "black", label: "Black" },
              { value: "random", label: "Random" },
            ]}
          />
          <div className="flex items-center gap-2">
            <Checkbox id="rated" data-testid="rated" checked={rated} onCheckedChange={(v) => setRated(Boolean(v))} />
            <Label htmlFor="rated">Rated</Label>
          </div>
          {target === ANYONE ? (
            <div className="space-y-2">
              <Label>Opponent rating</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min"
                  aria-label="Lowest rating"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Max"
                  aria-label="Highest rating"
                  value={maxRating}
                  onChange={(e) => setMaxRating(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" data-testid="create-challenge" disabled={saving}>
              Send challenge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
