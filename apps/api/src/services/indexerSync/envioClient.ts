import { env } from "../../config/env";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function envioQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(env.ENVIO_GRAPHQL_URL, {
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
const SWAP_TABLE: Record<string, string> = {
  base: "base_IndexedSwap",
  robinhood: "robinhood_IndexedSwap",
};

export async function fetchIndexedSwapsPage(
  chain: string,
  tokenAddress: string,
  fromBlockExclusive: string,
  limit: number = PAGE_SIZE,
): Promise<IndexedSwapRow[]> {
  const rootField = SWAP_TABLE[chain];
  if (!rootField) {
    throw new Error(`fetchIndexedSwapsPage: no known table for chain=${chain}`);
  }

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
  const data = await envioQuery<Record<string, IndexedSwapRow[]>>(query, {
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
const CHAIN_METADATA_TABLE: Record<number, string> = {
  8453: "base_ChainMetadata",
  4663: "robinhood_ChainMetadata",
};

export async function isChainFullySynced(chainId: number): Promise<boolean> {
  const rootField = CHAIN_METADATA_TABLE[chainId];
  if (!rootField) {
    throw new Error(`isChainFullySynced: no known ChainMetadata table for chainId=${chainId}`);
  }

  const query = `
    query ChainMeta($id: Int!) {
      ${rootField}(where: { id: { _eq: $id } }) {
        progress_block
        source_block
      }
    }
  `;
  const data = await envioQuery<Record<string, { progress_block: number; source_block: number }[]>>(
    query,
    { id: chainId },
  );
  const row = data[rootField][0];
  if (!row) return false;
  return row.progress_block >= row.source_block;
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

const FEE_EVENT_TABLE: Record<string, string> = {
  base: "base_IndexedFeeEvent",
  robinhood: "robinhood_IndexedFeeEvent",
};

export async function fetchIndexedFeeEventsPage(
  chain: string,
  recipient: string,
  fromBlockExclusive: string,
  limit: number = PAGE_SIZE,
): Promise<IndexedFeeEventRow[]> {
  const rootField = FEE_EVENT_TABLE[chain];
  if (!rootField) {
    throw new Error(`fetchIndexedFeeEventsPage: no known table for chain=${chain}`);
  }

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
  const data = await envioQuery<Record<string, IndexedFeeEventRow[]>>(query, {
    chain,
    recipient,
    fromBlock: fromBlockExclusive,
    limit,
  });
  return data[rootField];
}