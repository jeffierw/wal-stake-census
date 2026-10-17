import { BUCKETS, MIST_PER_WAL } from "./constants";
import { formatMistRatio, mistToWal, parseMist } from "./format";
import type {
  AddressIndexFile,
  BucketRow,
  Distribution,
  Ledger,
  ObjectEffect,
  StakeObject,
  StakeState,
  StateSummary,
} from "./types";

type Holding = {
  staked: bigint;
  withdrawing: bigint;
  stakedObjects: number;
  withdrawingObjects: number;
};

function emptyHolding(): Holding {
  return { staked: 0n, withdrawing: 0n, stakedObjects: 0, withdrawingObjects: 0 };
}

function percentOf(part: bigint, total: bigint): string {
  if (total === 0n || part === 0n) return "0.00";
  const scaled = (part * 10000n + total / 2n) / total;
  const whole = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function bucketForMist(total: bigint): string | null {
  if (total < MIST_PER_WAL) return null;
  for (const bucket of BUCKETS) {
    if (total >= bucket.min && (bucket.max === null || total < bucket.max)) {
      return bucket.label;
    }
  }
  return null;
}

function addHolding(holding: Holding, state: StakeState, principal: bigint) {
  if (state === "Staked") {
    holding.staked += principal;
    holding.stakedObjects += 1;
    return;
  }
  holding.withdrawing += principal;
  holding.withdrawingObjects += 1;
}

function collect(ledger: Ledger) {
  const addresses = new Map<string, Holding>();
  const objects = new Map<string, Holding>();
  for (const object of Object.values(ledger.objects)) {
    const target = object.ownerKind === "address" ? addresses : object.ownerKind === "object" ? objects : null;
    if (!target) continue;
    const holding = target.get(object.owner) ?? emptyHolding();
    addHolding(holding, object.state, parseMist(object.principal));
    target.set(object.owner, holding);
  }
  return { addresses, objects };
}

function activeHoldings(holdings: Iterable<Holding>): Holding[] {
  return [...holdings].filter((holding) => holding.staked + holding.withdrawing > 0n);
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
  const { addresses, objects } = collect(ledger);
  const holdings = activeHoldings(addresses.values());
  const totals = holdings.map((holding) => holding.staked + holding.withdrawing).sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const addressCount = totals.length;
  const totalPrincipal = totals.reduce((sum, value) => sum + value, 0n);
  const counts = new Map<string, { count: number; principal: bigint }>();
  let belowOne = 0;
  let belowOnePrincipal = 0n;
  for (const total of totals) {
    const label = bucketForMist(total);
    if (label === null) {
      belowOne += 1;
      belowOnePrincipal += total;
      continue;
    }
    const row = counts.get(label) ?? { count: 0, principal: 0n };
    row.count += 1;
    row.principal += total;
    counts.set(label, row);
  }

  const buckets: BucketRow[] = BUCKETS.map((bucket) => {
    const row = counts.get(bucket.label) ?? { count: 0, principal: 0n };
    return {
      label: bucket.label,
      count: row.count,
      percent: percentOf(BigInt(row.count), BigInt(addressCount)),
      principal: mistToWal(row.principal),
      principalPercent: percentOf(row.principal, totalPrincipal),
    };
  });

  const stateSummary = (state: StakeState): StateSummary => {
    const principal = holdings.reduce((sum, holding) => sum + holding[state === "Staked" ? "staked" : "withdrawing"], 0n);
    const addressesInState = holdings.filter((holding) => (state === "Staked" ? holding.staked : holding.withdrawing) > 0n).length;
    const objectCount = holdings.reduce(
      (sum, holding) => sum + (state === "Staked" ? holding.stakedObjects : holding.withdrawingObjects),
      0,
    );
    return {
      objects: objectCount,
      addresses: addressesInState,
      principal: mistToWal(principal),
      principalPercent: percentOf(principal, totalPrincipal),
    };
  };

  const owned = activeHoldings(objects.values());
  const objectOwnedCount = owned.reduce((sum, holding) => sum + holding.stakedObjects + holding.withdrawingObjects, 0);
  const objectOwnedPrincipal = owned.reduce((sum, holding) => sum + holding.staked + holding.withdrawing, 0n);

  return {
    checkpoint: ledger.checkpoint,
    syncing: options.syncing,
    generatedAt: options.generatedAt ?? null,
    addressCount,
    objectCount: holdings.reduce((sum, holding) => sum + holding.stakedObjects + holding.withdrawingObjects, 0),
    totalPrincipal: mistToWal(totalPrincipal),
    average: formatMistRatio(totalPrincipal, BigInt(addressCount)),
    median: mistToWal(medianOf(totals)),
    max: mistToWal(totals.at(-1) ?? 0n),
    buckets,
    belowOne: {
      label: "<1",
      count: belowOne,
      percent: percentOf(BigInt(belowOne), BigInt(addressCount)),
      principal: mistToWal(belowOnePrincipal),
      principalPercent: percentOf(belowOnePrincipal, totalPrincipal),
    },
    states: { Staked: stateSummary("Staked"), Withdrawing: stateSummary("Withdrawing") },
    objectOwned: {
      objectCount: objectOwnedCount,
      holderCount: owned.length,
      totalPrincipal: mistToWal(objectOwnedPrincipal),
    },
  };
}

export function addressIndexFromLedger(ledger: Ledger): AddressIndexFile {
  const { addresses, objects } = collect(ledger);
  const entries: AddressIndexFile["entries"] = [];
  const push = (owner: string, kind: 0 | 1, holding: Holding) => {
    if (holding.staked + holding.withdrawing <= 0n) return;
    entries.push([
      owner.slice(2),
      kind,
      holding.staked.toString(),
      holding.withdrawing.toString(),
      holding.stakedObjects,
      holding.withdrawingObjects,
    ]);
  };
  for (const [owner, holding] of addresses) push(owner, 0, holding);
  for (const [owner, holding] of objects) push(owner, 1, holding);
  entries.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  return { checkpoint: ledger.checkpoint, entries };
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
