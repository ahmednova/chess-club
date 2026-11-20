import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { players } from "@/db/schema";

export interface Me {
  id: string;
  email: string;
  orgId: string;
}

export type Player = typeof players.$inferSelect;

function nameFrom(email: string): string {
  return email.split("@")[0] || email;
}

/** The member's own record, created the first time they open the app. */
export async function ensurePlayer(user: Me): Promise<Player> {
  const [row] = await db
    .insert(players)
    .values({
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      name: nameFrom(user.email),
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: players.id,
      set: { email: user.email, name: nameFrom(user.email) },
    })
    .returning();
  return row!;
}

export async function getPlayer(orgId: string, id: string): Promise<Player | null> {
  const [row] = await db
    .select()
    .from(players)
    .where(and(eq(players.orgId, orgId), eq(players.id, id)));
  return row ?? null;
}

export async function playerNames(orgId: string, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return new Map();
  const rows = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(and(eq(players.orgId, orgId), inArray(players.id, wanted)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Everyone else in the organization who has opened the app. */
export async function listOpponents(user: Me) {
  const rows = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.orgId, user.orgId))
    .orderBy(players.name);
  return rows.filter((r) => r.id !== user.id);
}
