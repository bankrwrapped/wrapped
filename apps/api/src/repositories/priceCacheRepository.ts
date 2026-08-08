import { db } from "../db/client";

interface PriceCacheRow {
  price_usd: string;
}

export const priceCacheRepository = {
  async find(
    chain: string,
    tokenAddress: string,
    bucket: Date
  ): Promise<number | null> {
    const rows = (await db`
      select price_usd
      from price_cache
      where chain = ${chain}
        and token_address = ${tokenAddress}
        and timestamp_bucket = ${bucket}
      limit 1
    `) as PriceCacheRow[];

    const row = rows[0];
    return row ? Number(row.price_usd) : null;
  },

  async upsert(
    chain: string,
    tokenAddress: string,
    bucket: Date,
    priceUsd: number
  ): Promise<void> {
    await db`
      insert into price_cache (chain, token_address, timestamp_bucket, price_usd)
      values (${chain}, ${tokenAddress}, ${bucket}, ${priceUsd})
      on conflict (chain, token_address, timestamp_bucket) do update set
        price_usd = excluded.price_usd
    `;
  },
};
