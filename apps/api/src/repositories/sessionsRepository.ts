import { db } from "../db/client";

export interface SessionRow {
  id: string;
  xUserId: string;
  xUsername: string;
  evmAddress: string | null;
  refreshTokenEncrypted: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
}

interface RawSessionRow {
  id: string;
  x_user_id: string;
  x_username: string;
  evm_address: string | null;
  refresh_token_encrypted: string;
  created_at: string;
  expires_at: string;
  last_used_at: string;
}
function toSessionRow(row: RawSessionRow): SessionRow {
  return {
    id: row.id,
    xUserId: row.x_user_id,
    xUsername: row.x_username,
    evmAddress: row.evm_address,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    lastUsedAt: new Date(row.last_used_at).toISOString(),
  };
}

export const sessionsRepository = {
  async create(params: {
    id: string;
    xUserId: string;
    xUsername: string;
    evmAddress: string | null;
    refreshTokenEncrypted: string;
    expiresAt: Date;
  }): Promise<SessionRow> {
    const [row] = (await db`
      insert into sessions (
        id, x_user_id, x_username, evm_address, refresh_token_encrypted, expires_at
      ) values (
        ${params.id}, ${params.xUserId}, ${params.xUsername}, ${params.evmAddress},
        ${params.refreshTokenEncrypted}, ${params.expiresAt}
      )
      returning id, x_user_id, x_username, evm_address, refresh_token_encrypted,
                created_at, expires_at, last_used_at
    `) as RawSessionRow[];
    return toSessionRow(row);
  },

  // Only returns a session that hasn't expired - an expired row is treated
  // identically to a missing one by every caller, so filtering here means
  // callers never have to remember to check expires_at themselves.
  async findValidById(id: string): Promise<SessionRow | null> {
    const rows = (await db`
      select id, x_user_id, x_username, evm_address, refresh_token_encrypted,
             created_at, expires_at, last_used_at
      from sessions
      where id = ${id} and expires_at > now()
      limit 1
    `) as RawSessionRow[];
    const row = rows[0];
    return row ? toSessionRow(row) : null;
  },

  async touchLastUsed(id: string): Promise<void> {
    await db`update sessions set last_used_at = now() where id = ${id}`;
  },

  // Called on refresh-token renewal (new access token -> possibly a new
  // refresh token per X's rotation behavior) and on manual sign-out
  // (expires_at backdated rather than deleted, so the row stays for audit).
  async updateRefreshToken(id: string, refreshTokenEncrypted: string, expiresAt: Date): Promise<void> {
    await db`
      update sessions
      set refresh_token_encrypted = ${refreshTokenEncrypted}, expires_at = ${expiresAt}
      where id = ${id}
    `;
  },

  // Called when a session was created with evm_address = null (user had
  // no Bankr account yet at login) and a later /api/auth/me call resolves
  // one - persists it so the retry-on-null path stops firing for this
  // session going forward.
  async updateEvmAddress(id: string, evmAddress: string): Promise<void> {
    await db`update sessions set evm_address = ${evmAddress} where id = ${id}`;
  },

  async revoke(id: string): Promise<void> {
    await db`delete from sessions where id = ${id}`;
  },
};
