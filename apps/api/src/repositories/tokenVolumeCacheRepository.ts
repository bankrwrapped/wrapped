import { db } from "../db/client";

export interface TokenVolumeCacheEntry {
  volumeUsd: number;
  source: string;
  updatedAt: Date;
}

export const tokenVolumeCacheRepository = {
  async get(chain: string, address: string): Promise<TokenVolumeCacheEntry | null> {
    const rows = await db`
      select volume_usd, source, updated_at
      from token_volume_cache
      where chain = ${chain} and address = ${address}
    `;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      volumeUsd: Number(row.volume_usd),
      source: row.source,
      updatedAt: new Date(row.updated_at),
    };
  },

  async set(chain: string, address: string, volumeUsd: number, source: string): Promise<void> {
    await db`
      insert into token_volume_cache (chain, address, volume_usd, source, updated_at)
      values (${chain}, ${address}, ${volumeUsd}, ${source}, now())
      on conflict (chain, address)
      do update set
        volume_usd = excluded.volume_usd,
        source = excluded.source,
        updated_at = now()
    `;
  },
};
