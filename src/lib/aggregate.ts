import { BUCKETS, MIST_PER_WAL } from "./constants";
import { formatMistRatio, mistToWal, parseMist } from "./format";
import type { BucketRow, Distribution, Ledger, ObjectEffect, StakeObject, StakeState } from "./types";

function percent(count: number, total: number): string {
  if (total === 0) return "0.00";
  return ((count * 100) / total).toFixed(2);
}

function bucketLabel(total: bigint): string | null {
  if (total < MIST_PER_WAL) return null;
  for (const bucket of BUCKETS) {
    if (total >= bucket.min && (bucket.max === null || total < bucket.max)) {
      return bucket.label;
    }
  }
  return null;
}

export function applyEffects(ledger: Ledger, effects: ObjectEffect[]): Ledger {
  const objects = { ...ledger.objects };
  for (const effect of effects) {
    if (effect.kind === "remove") {
      delete objects[effect.objectId];
      continue;
    }
    objects[effect.objectId] = effect.object;
  }
  return { checkpoint: ledger.checkpoint, objects };
}

export function distributionFromLedger(
  ledger: Ledger,
  options: { syncing: boolean; generatedAt?: string | null } = { syncing: false },
): Distribution {
  const byAddress = new Map<string, bigint>();
  const objectHolders = new Map<string, bigint>();
  let objectOwnedCount = 0;
  let objectOwnedPrincipal = 0n;
  const states: Record<StakeState, number> = { Staked: 0, Withdrawing: 0 };
  let addressObjectCount = 0;

  for (const object of Object.values(ledger.objects)) {
    const principal = parseMist(object.principal);
    states[object.state] += 1;
    if (object.ownerKind === "address") {
      addressObjectCount += 1;
      byAddress.set(object.owner, (byAddress.get(object.owner) ?? 0n) + principal);
      continue;
    }
    if (object.ownerKind === "object") {
      objectOwnedCount += 1;
      objectOwnedPrincipal += principal;
      objectHolders.set(object.owner, (objectHolders.get(object.owner) ?? 0n) + principal);
    }
  }

  const totals = [...byAddress.values()].filter((total) => total > 0n).sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const addressCount = totals.length;
  const totalPrincipal = totals.reduce((sum, value) => sum + value, 0n);
  const counts = new Map<string, number>();
  let belowOne = 0;
  for (const total of totals) {
    const label = bucketLabel(total);
    if (label === null) {
      belowOne += 1;
      continue;
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const buckets: BucketRow[] = BUCKETS.map((bucket) => {
    const count = counts.get(bucket.label) ?? 0;
    return { label: bucket.label, count, percent: percent(count, addressCount) };
  });

  const median = medianOf(totals);

  return {
    checkpoint: ledger.checkpoint,
    syncing: options.syncing,
    generatedAt: options.generatedAt ?? null,
    addressCount,
    objectCount: addressObjectCount,
    totalPrincipal: mistToWal(totalPrincipal),
    average: formatMistRatio(totalPrincipal, BigInt(addressCount)),
    median: mistToWal(median),
    max: mistToWal(totals.at(-1) ?? 0n),
    buckets,
    belowOne: { label: "<1", count: belowOne, percent: percent(belowOne, addressCount) },
    states,
    objectOwned: {
      objectCount: objectOwnedCount,
      holderCount: objectHolders.size,
      totalPrincipal: mistToWal(objectOwnedPrincipal),
    },
  };
}

function medianOf(sorted: bigint[]): bigint {
  if (sorted.length === 0) return 0n;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2n;
}

export function emptyDistribution(): Distribution {
  return distributionFromLedger({ checkpoint: "0", objects: {} }, { syncing: true });
}

export function stakeObject(partial: Partial<StakeObject> & Pick<StakeObject, "ownerKind" | "owner" | "principal">): StakeObject {
  return {
    ownerKind: partial.ownerKind,
    owner: partial.owner,
    principal: partial.principal,
    state: partial.state ?? "Staked",
  };
}
