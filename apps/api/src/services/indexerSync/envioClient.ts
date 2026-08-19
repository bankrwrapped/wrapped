import { env } from "../../config/env";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

// Each chain runs its own isolated Envio instance (own Postgres, own
// indexed events) - there is no shared multi-chain table. `chain` here
// selects which deployment's endpoint to hit, not a filter within a
// shared table (the `where: { chain: ... }` clauses below are now
// redundant within a single chain's own data, but harmless - kept for
// defense/clarity, not relied on for chain isolation).
const ENDPOINT_MAP: Record<string, string> = {
  base: env.ENVIO_GRAPHQL_URL_BASE,
  robinhood: env.ENVIO_GRAPHQL_URL_ROBINHOOD,
};

const CHAIN_ID_MAP: Record<string, number> = {
  base: 8453,
  robinhood: 4663,
};

async function envioQuery<T>(chain: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const url = ENDPOINT_MAP[chain];
  if (!url) {
    throw new Error(`envioQuery: no Envio endpoint configured for chain=${chain}`);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Envio GraphQL request failed: ${res.status}`);
  }
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Envio GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("Envio GraphQL returned no data");
  }
  return json.data;
}

export interface IndexedSwapRow {
  id: string;
  chain: string;
  poolId: string;
  tokenAddress: string;
  blockNumber: string;
  logIndex: number;
  timestamp: string;
  amountToken: string;
}

export const PAGE_SIZE = 1000; // <- only change on this line: added `export`

// Permanent Hasura field names, per playbook §6.5 (RESOLVED PERMANENTLY
// 2026-08-08, fixed via pg_set_table_customization, no longer dependent on
// tracking state) -- confirmed live 2026-08-09 against a real query, not
// taken on the doc's word alone: base_IndexedSwap / robinhood_IndexedSwap.
// Do NOT reintroduce base_fix_ prefixed names or unprefixed-for-Robinhood-
// only names -- those were transient tracking-state artifacts, now dead.
// CORRECTED 2026-08-16: confirmed live via Hasura schema introspection -
// root fields are NOT chain-prefixed. One IndexedSwap table across both
// chains, disambiguated by the `chain` argument in the where clause below,
// not by table name. Prior base_/robinhood_ prefix naming (playbook §6.5,
// "confirmed live 2026-08-09") no longer matches reality.
const SWAP_ROOT_FIELD = "IndexedSwap";
const SUPPORTED_CHAINS = new Set(["base", "robinhood"]);

export async function fetchIndexedSwapsPage(
  chain: string,
  tokenAddress: string,
  fromBlockExclusive: string,
  limit: number = PAGE_SIZE,
): Promise<IndexedSwapRow[]> {
  if (!SUPPORTED_CHAINS.has(chain)) {
    throw new Error(`fetchIndexedSwapsPage: unsupported chain=${chain}`);
  }
  const rootField = SWAP_ROOT_FIELD;

  const query = `
    query SwapsPage($chain: String!, $token: String!, $fromBlock: numeric!, $limit: Int!) {
      ${rootField}(
        where: { chain: { _eq: $chain }, tokenAddress: { _eq: $token }, blockNumber: { _gt: $fromBlock } }
        order_by: { blockNumber: asc }
        limit: $limit
      ) {
        id chain poolId tokenAddress blockNumber logIndex timestamp amountToken
      }
    }
  `;
  const data = await envioQuery<Record<string, IndexedSwapRow[]>>(chain, query, {
    chain,
    token: tokenAddress,
    fromBlock: fromBlockExclusive,
    limit,
  });
  return data[rootField];
}

// Permanent Hasura field names, per playbook §6.5 -- both chains now share
// an IDENTICAL ChainMetadata field set (confirmed live 2026-08-09: id,
// progress_block, source_block, end_block, etc. -- verified equal on both
// base_ChainMetadata and robinhood_ChainMetadata, not assumed from one).
// end_block is nullable (continuous indexing to head, no fixed target), so
// "synced" compares progress_block against source_block (current chain
// head), never end_block.
// CORRECTED 2026-08-16: confirmed live via schema introspection - the
// real table is Envio's own standard sync-status table (`chain_metadata`,
// lowercase/snake_case, distinct naming convention from IndexedSwap/
// IndexedFeeEvent/WatchedPool because it's stock Envio infra, not a custom
// entity). No `id`/`progress_block`/`source_block` fields exist - real
// fields are chain_id, block_height, start_block, end_block,
// latest_processed_block, latest_fetched_block_number,
// first_event_block_number, timestamp_caught_up_to_head_or_endblock,
// is_hyper_sync, num_batches_fetched, num_events_processed.
//
// FLAGGED - inferred from field name, not confirmed against docs or a
// known-synced-vs-known-lagging chain: using
// timestamp_caught_up_to_head_or_endblock being non-null as the "synced"
// signal, since that's what the field name directly states. Verify this
// actually flips from null to a real timestamp on a chain you know is
// still catching up, before trusting this in anything that gates on it.
const CHAIN_METADATA_ROOT_FIELD = "chain_metadata";

export async function isChainFullySynced(chain: string): Promise<boolean> {
  const chainId = CHAIN_ID_MAP[chain];
  if (chainId === undefined) {
    throw new Error(`isChainFullySynced: unsupported chain=${chain}`);
  }
  const query = `
    query ChainMeta($chainId: Int!) {
      ${CHAIN_METADATA_ROOT_FIELD}(where: { chain_id: { _eq: $chainId } }) {
        timestamp_caught_up_to_head_or_endblock
      }
    }
  `;
  const data = await envioQuery<Record<string, { timestamp_caught_up_to_head_or_endblock: string | null }[]>>(
    chain,
    query,
    { chainId },
  );
  const row = data[CHAIN_METADATA_ROOT_FIELD][0];
  if (!row) return false;
  return row.timestamp_caught_up_to_head_or_endblock !== null;
}

// =============================================================================
// NEW — Module 8 fee events. Same envioQuery, same table-map style, same
// error message shape as fetchIndexedSwapsPage above.
// =============================================================================

export interface IndexedFeeEventRow {
  id: string;
  chain: string;
  poolId: string | null;
  tokenAddress: string;
  eventType: "Collect" | "Release" | "StoreTokens" | "ClaimTokens" | "ClaimTokensPermissioned";
  recipient: string | null;
  amountToken0: string | null;
  amountToken1: string | null;
  blockNumber: string;
  txHash: string;
  logIndex: number;
  timestamp: string;
}

// CORRECTED 2026-08-16: same fix as SWAP_ROOT_FIELD above, confirmed via
// the same schema introspection - IndexedFeeEvent is not chain-prefixed.
const FEE_EVENT_ROOT_FIELD = "IndexedFeeEvent";

export async function fetchIndexedFeeEventsPage(
  chain: string,
  recipient: string,
  fromBlockExclusive: string,
  limit: number = PAGE_SIZE,
): Promise<IndexedFeeEventRow[]> {
  if (!SUPPORTED_CHAINS.has(chain)) {
    throw new Error(`fetchIndexedFeeEventsPage: unsupported chain=${chain}`);
  }
  const rootField = FEE_EVENT_ROOT_FIELD;

  const query = `
    query FeeEventsPage($chain: String!, $recipient: String!, $fromBlock: numeric!, $limit: Int!) {
      ${rootField}(
        where: {
          chain: { _eq: $chain }
          recipient: { _eq: $recipient }
          blockNumber: { _gt: $fromBlock }
          eventType: { _in: ["Release", "ClaimTokens", "ClaimTokensPermissioned"] }
        }
        order_by: { blockNumber: asc }
        limit: $limit
      ) {
        id chain poolId tokenAddress eventType recipient amountToken0 amountToken1 blockNumber txHash logIndex timestamp
      }
    }
  `;
  const data = await envioQuery<Record<string, IndexedFeeEventRow[]>>(chain, query, {
    chain,
    recipient,
    fromBlock: fromBlockExclusive,
    limit,
  });
  return data[rootField];
}
// =============================================================================
// NEW — WatchedPool lookup, added for Module 8's real backfill-completeness
// check (item 37). Same envioQuery/table-map/error-message pattern as the
// functions above. Table names confirmed live per playbook §6.5:
// base_WatchedPool / robinhood_WatchedPool.
// =============================================================================

export interface WatchedPoolRow {
  id: string;
  chain: string;
  poolId: string;
  currency0: string;
  currency1: string;
  tokenAddress: string | null;
  tokenIsToken0: boolean | null; // null = not yet resolved (orphaned/pending)
}

// CORRECTED 2026-08-16: same fix, same confirmed reason.
const WATCHED_POOL_ROOT_FIELD = "WatchedPool";

export async function fetchWatchedPool(chain: string, poolId: string): Promise<WatchedPoolRow | null> {
  if (!SUPPORTED_CHAINS.has(chain)) {
    throw new Error(`fetchWatchedPool: unsupported chain=${chain}`);
  }
  const rootField = WATCHED_POOL_ROOT_FIELD;

  const query = `
      query WatchedPoolLookup($chain: String!, $poolId: String!) {
      ${rootField}(where: { chain: { _eq: $chain }, poolId: { _eq: $poolId } }) {
        id chain poolId currency0 currency1 tokenAddress tokenIsToken0
      }
    }
  `;
  const data = await envioQuery<Record<string, WatchedPoolRow[]>>(chain, query, { chain, poolId });
  return data[rootField][0] ?? null;
}
