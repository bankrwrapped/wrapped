import { indexedTokensRepository } from "../repositories/indexedTokensRepository";
import { fetchChainProgress, type ChainProgress } from "./indexerSync/envioClient";

// GET /api/status: how far the Base indexer has got, how fast it's going,
// and where token backfills stand - so a re-index can be followed from one
// URL instead of Railway logs. Counts and block numbers only.
//
// Speed comes from samples of the indexer's processed block taken every
// SAMPLE_INTERVAL_MS in this process (lost on restart - the ETA then needs
// one interval to come back). The response is cached for CACHE_MS.

const CHAIN = "base";
const SAMPLE_INTERVAL_MS = 5 * 60_000;
const MAX_SAMPLES = 12; // speed over the last hour
const CACHE_MS = 30_000;

interface Sample {
  at: number;
  block: number;
}

const samples: Sample[] = [];
let cached: { at: number; body: StatusBody } | null = null;

export interface StatusBody {
  indexer:
    | {
        status: "syncing" | "caught_up";
        startBlock: number;
        processedBlock: number | null;
        headBlock: number | null;
        percent: number | null;
        blocksPerMinute: number | null;
        etaMinutes: number | null;
        caughtUpAt: string | null;
      }
    | { status: "unavailable" };
  backfills: { pending: number; in_progress: number; complete: number; failed: number } | { status: "unavailable" };
  checkedAt: string;
}

export function recordSample(block: number, at = Date.now()): void {
  const last = samples[samples.length - 1];
  if (last && last.block === block && at - last.at < SAMPLE_INTERVAL_MS) return;
  samples.push({ at, block });
  if (samples.length > MAX_SAMPLES) samples.shift();
}

// Blocks per minute between the oldest and newest sample, or null until
// there are two samples at least a minute apart.
export function blocksPerMinute(): number | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const minutes = (last.at - first.at) / 60_000;
  if (minutes < 1) return null;
  return Math.max(0, (last.block - first.block) / minutes);
}

export function describeProgress(p: ChainProgress, rate: number | null): Extract<StatusBody["indexer"], { startBlock: number }> {
  const span = p.headBlock !== null ? p.headBlock - p.startBlock : null;
  const done = p.processedBlock !== null ? p.processedBlock - p.startBlock : null;
  const percent = span && done !== null && span > 0 ? Math.min(100, Math.round((done / span) * 1000) / 10) : null;
  const remaining = p.headBlock !== null && p.processedBlock !== null ? Math.max(0, p.headBlock - p.processedBlock) : null;
  return {
    status: p.caughtUpAt ? "caught_up" : "syncing",
    startBlock: p.startBlock,
    processedBlock: p.processedBlock,
    headBlock: p.headBlock,
    percent,
    blocksPerMinute: rate === null ? null : Math.round(rate),
    etaMinutes: p.caughtUpAt ? 0 : rate && remaining !== null ? Math.round(remaining / rate) : null,
    caughtUpAt: p.caughtUpAt,
  };
}

async function readProgress(): Promise<ChainProgress | null> {
  try {
    return await fetchChainProgress(CHAIN);
  } catch (err) {
    console.warn("[status] indexer progress unavailable, err=" + String(err));
    return null;
  }
}

export async function getStatus(now = Date.now()): Promise<StatusBody> {
  if (cached && now - cached.at < CACHE_MS) return cached.body;

  const [progress, backfills] = await Promise.all([
    readProgress(),
    indexedTokensRepository.countByStatus(CHAIN).catch((err) => {
      console.warn("[status] backfill counts unavailable, err=" + String(err));
      return null;
    }),
  ]);
  if (progress?.processedBlock != null) recordSample(progress.processedBlock, now);

  const body: StatusBody = {
    indexer: progress ? describeProgress(progress, blocksPerMinute()) : { status: "unavailable" },
    backfills: backfills ?? { status: "unavailable" },
    checkedAt: new Date(now).toISOString(),
  };
  cached = { at: now, body };
  return body;
}

export function startStatusSampler(): void {
  const sample = () =>
    readProgress().then((p) => {
      if (p?.processedBlock != null) recordSample(p.processedBlock);
    });
  sample();
  setInterval(sample, SAMPLE_INTERVAL_MS);
}

// Tests only.
export function resetStatusState(): void {
  samples.length = 0;
  cached = null;
}
