import { readFile, stat } from "node:fs/promises";
import { bucketForMist } from "./aggregate";
import { mistToWal, normalizeSuiAddress } from "./format";
import { ADDRESS_INDEX_PATH } from "./store";
import type { AddressIndexFile, AddressLookup } from "./types";

export const ADDRESS_QUERY_LIMIT = 100;

export class AddressQueryError extends Error {}

export type IndexEntry = {
  ownerKind: "address" | "object";
  stakedMist: bigint;
  withdrawingMist: bigint;
  stakedObjects: number;
  withdrawingObjects: number;
};

type IndexCache = {
  mtimeMs: number;
  checkpoint: string;
  map: Map<string, IndexEntry>;
};

let cache: IndexCache | null = null;

export function mapFromIndex(file: AddressIndexFile): Map<string, IndexEntry> {
  const map = new Map<string, IndexEntry>();
  for (const [hex, kind, staked, withdrawing, stakedObjects, withdrawingObjects] of file.entries) {
    map.set(hex, {
      ownerKind: kind === 0 ? "address" : "object",
      stakedMist: BigInt(staked),
      withdrawingMist: BigInt(withdrawing),
      stakedObjects,
      withdrawingObjects,
    });
  }
  return map;
}

export async function loadAddressIndex(): Promise<IndexCache> {
  const info = await stat(ADDRESS_INDEX_PATH);
  if (cache?.mtimeMs === info.mtimeMs) return cache;
  const file = JSON.parse(await readFile(ADDRESS_INDEX_PATH, "utf8")) as AddressIndexFile;
  cache = { mtimeMs: info.mtimeMs, checkpoint: file.checkpoint, map: mapFromIndex(file) };
  return cache;
}

export function queryAddresses(map: Map<string, IndexEntry>, inputs: string[]): AddressLookup[] {
  if (inputs.length > ADDRESS_QUERY_LIMIT) {
    throw new AddressQueryError(`一次最多查询 ${ADDRESS_QUERY_LIMIT} 个地址`);
  }
  const seen = new Set<string>();
  const results: AddressLookup[] = [];
  for (const input of inputs) {
    let address: string;
    try {
      address = normalizeSuiAddress(input);
    } catch {
      results.push({ input, address: null, status: "invalid" });
      continue;
    }
    if (seen.has(address)) continue;
    seen.add(address);
    const entry = map.get(address.slice(2));
    if (!entry) {
      results.push({ input, address, status: "missing" });
      continue;
    }
    const total = entry.stakedMist + entry.withdrawingMist;
    results.push({
      input,
      address,
      status: "ok",
      ownerKind: entry.ownerKind,
      totalPrincipal: mistToWal(total),
      bucket: entry.ownerKind === "address" ? bucketForMist(total) : null,
      staked: { objects: entry.stakedObjects, principal: mistToWal(entry.stakedMist) },
      withdrawing: { objects: entry.withdrawingObjects, principal: mistToWal(entry.withdrawingMist) },
    });
  }
  return results;
}
