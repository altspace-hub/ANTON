// ── Missions — Local Identity Resolution ────────────────────────────────────
// Phase 1 mirrors the BEEHIVE identity-binding pattern. Every mutation that
// names a "who" is bound to the locally activated community_identity.
//
// Phase 5 will replace this with Ed25519 signature verification on AAP
// messages.

import type { DatabaseAdapter } from '../../db/database.js';
import { isTeamMode } from '../../middleware/role-guards.js';
import type { OwnedRequest } from '../../middleware/ownership.js';

export interface LocalIdentity {
  contact_hash: string;
  display_name: string;
  user_id: string;          // public.users.id — used for missions.missions.created_by FK
}

/**
 * Returns the locally activated community identity, or null if community
 * has not been activated yet on this instance. Also resolves the matching
 * row in public.users so callers can use it directly for FK references.
 */
export async function getLocalIdentity(db: DatabaseAdapter): Promise<LocalIdentity | null> {
  const row = await db.get<{ contact_hash: string; display_name: string; user_id: string }>(
    "SELECT contact_hash, display_name, COALESCE(user_id, 'default') AS user_id FROM community_identity WHERE user_id = 'default'",
  );
  return row ?? null;
}

/**
 * Resolves the caller's effective identity for a Mission operation.
 * If `claimed` is supplied, it must match the local identity's contact_hash
 * exactly — otherwise the call is rejected as identity spoofing.
 *
 * Throws an Error with a meaningful message on failure (route handlers
 * convert these to 403/409 responses).
 *
 * NOT an authorisation check, despite the 403 it produces. `claimed` is optional and
 * every internal caller passes undefined, so for them this is only a liveness check on
 * the instance's community identity — it returns the same identity to every caller and
 * cannot tell one authenticated user from another. Row-level access is enforced by
 * requireMissionOwner (routes/mission-access.ts) and by the owner scope on the vault
 * queries; do not read a passing resolveCallerIdentity as "this caller owns it".
 */
export async function resolveCallerIdentity(
  db: DatabaseAdapter,
  claimed?: string | null,
): Promise<LocalIdentity> {
  const local = await getLocalIdentity(db);
  if (!local) {
    throw new Error('Local community identity not activated. Activate your identity on the Identity page first.');
  }
  if (claimed && claimed !== local.contact_hash) {
    throw new Error('Provided contact hash does not match the locally activated identity.');
  }
  return local;
}

/**
 * The user_id to STAMP on rows this REQUEST creates — missions.missions.created_by
 * and missions.credential_vault.created_by, both FK to public.users.
 *
 * Team mode: the authenticated caller, always. resolveUserId() below resolves ONE
 * instance-wide identity, so on a shared install every colleague's missions and vault
 * entries were written with the same created_by and no owner predicate could tell them
 * apart — that is the hole this closes, and stamping is half of it (the guards are the
 * other half). req.user.id is safe as an FK here: team-mode authMiddleware only stamps
 * it after joining public.users, so the row provably exists.
 *
 * Solo mode: deliberately unchanged, and this is the part not to "simplify". req.user.id
 * is the literal 'solo', and an instance that predates SOLO_USER_ID has no users row
 * with that id — writing it blind would violate the FK and fail every mission create on
 * the owner's own laptop. resolveUserId's sentinel walk is what keeps solo working.
 */
export async function resolveActorUserId(db: DatabaseAdapter, req: OwnedRequest): Promise<string> {
  if (!isTeamMode()) return resolveUserId(db);
  const id = req.user?.id;
  // Never fall back to the instance identity here: an unauthenticated write in team
  // mode landing on the shared sentinel is exactly the attribution loss being removed.
  if (!id) throw new Error('Authentication required');
  return id;
}

/**
 * Resolves the user_id for FK references. In solo mode the platform uses
 * 'solo' or 'default' as a sentinel user_id. We accept either and fall back
 * to the user_id stored against the community identity.
 *
 * NOT an authorisation decision: it returns the same instance-wide value for every
 * caller. Use resolveActorUserId() for anything stamped on a per-request write.
 */
export async function resolveUserId(db: DatabaseAdapter): Promise<string> {
  const identity = await getLocalIdentity(db);
  if (identity?.user_id) {
    // Verify the user actually exists in public.users for the FK
    const exists = await db.get<{ id: string }>(`SELECT id FROM public.users WHERE id = ?`, identity.user_id);
    if (exists) return exists.id;
  }
  // Fall back to known platform sentinels
  for (const candidate of ['solo', 'default']) {
    const exists = await db.get<{ id: string }>(`SELECT id FROM public.users WHERE id = ?`, candidate);
    if (exists) return exists.id;
  }
  // Last resort: pick the first user
  const any = await db.get<{ id: string }>(`SELECT id FROM public.users ORDER BY created_at ASC LIMIT 1`);
  if (!any) throw new Error('No users found in public.users — initialise the platform before creating missions.');
  return any.id;
}
