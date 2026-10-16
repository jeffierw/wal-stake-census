import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GRPC_URL, STAKED_WAL_TYPE } from "../src/lib/constants";
import { protoValueToJson, readPrincipal, readState } from "../src/lib/content";
import { normalizeSuiAddress } from "../src/lib/format";
import { LEDGER_PATH, STATE_PATH, publish, readJson, writeJsonAtomic } from "../src/lib/store";
import type { Ledger, ObjectEffect, OwnerKind, StakeObject } from "../src/lib/types";
import { applyEffects } from "../src/lib/aggregate";

const OUTPUT_DOES_NOT_EXIST = 1;
const ID_CREATED = 2;
const ID_DELETED = 3;
const OWNER_ADDRESS = 1;
const OWNER_OBJECT = 2;
const OWNER_CONSENSUS_ADDRESS = 5;

const READ_MASK = {
  paths: [
    "sequence_number",
    "transactions.transaction_index",
    "transactions.effects.status",
    "transactions.effects.changed_objects.object_id",
    "transactions.effects.changed_objects.object_type",
    "transactions.effects.changed_objects.id_operation",
    "transactions.effects.changed_objects.output_state",
    "transactions.effects.changed_objects.output_version",
    "transactions.effects.changed_objects.output_owner",
  ],
};

type CheckpointMessage = {
  sequenceNumber?: bigint;
  transactions: Array<{
    transactionIndex?: bigint;
    effects?: {
      status?: { success?: boolean };
      changedObjects: Array<{
        objectId?: string;
        objectType?: string;
        idOperation?: number;
        outputState?: number;
        outputVersion?: bigint;
        outputOwner?: { kind?: number; address?: string };
      }>;
    };
  }>;
};

const client = new SuiGrpcClient({ network: "mainnet", baseUrl: GRPC_URL });

function ownerFromProto(owner: { kind?: number; address?: string } | undefined): {
  ownerKind: OwnerKind;
  owner: string;
} {
  if ((owner?.kind === OWNER_ADDRESS || owner?.kind === OWNER_CONSENSUS_ADDRESS) && owner.address) {
    return { ownerKind: "address", owner: normalizeSuiAddress(owner.address) };
  }
  if (owner?.kind === OWNER_OBJECT && owner.address) {
    return { ownerKind: "object", owner: normalizeSuiAddress(owner.address) };
  }
  return { ownerKind: "other", owner: owner?.address ?? "unknown" };
}

async function readStake(objectId: string, version: bigint): Promise<StakeObject | null> {
  const call = await client.ledgerService.getObject({
    objectId,
    version,
    readMask: { paths: ["object_type", "owner", "json"] },
  });
  const object = (await call.response).object;
  if (object?.objectType !== STAKED_WAL_TYPE) return null;
  if (!object.json) throw new Error(`检查点版本 ${version} 没有 JSON: ${objectId}`);
  const json = protoValueToJson(object.json) as { principal?: unknown; state?: unknown };
  const owner = ownerFromProto(object.owner);
  return {
    ownerKind: owner.ownerKind,
    owner: owner.owner,
    principal: readPrincipal(json.principal),
    state: readState(json.state),
  };
}

async function effectsForCheckpoint(checkpoint: CheckpointMessage, known: Set<string>): Promise<ObjectEffect[]> {
  const transactions = [...checkpoint.transactions].sort(
    (a, b) => Number(a.transactionIndex ?? 0n) - Number(b.transactionIndex ?? 0n),
  );
  const effects: ObjectEffect[] = [];
  for (const tx of transactions) {
    if (tx.effects?.status?.success === false) continue;
    for (const changed of tx.effects?.changedObjects ?? []) {
      if (!changed.objectId) continue;
      const objectId = normalizeSuiAddress(changed.objectId);
      const knownObject = known.has(objectId);
      const created = changed.idOperation === ID_CREATED;
      const removed =
        changed.outputState === OUTPUT_DOES_NOT_EXIST || changed.idOperation === ID_DELETED;
      if (removed) {
        if (knownObject) {
          effects.push({ kind: "remove", objectId });
          known.delete(objectId);
        }
        continue;
      }
      if (!knownObject && !created) continue;
      if (changed.outputVersion === undefined) continue;
      const stake = await readStake(objectId, changed.outputVersion);
      if (!stake) continue;
      effects.push({ kind: "upsert", objectId, object: stake });
      known.add(objectId);
    }
  }
  return effects;
}

async function applyCheckpoint(
  ledger: Ledger,
  checkpoint: CheckpointMessage,
  syncing: boolean,
): Promise<Ledger> {
  const sequence = checkpoint.sequenceNumber;
  if (sequence === undefined) return ledger;
  const expected = BigInt(ledger.checkpoint) + 1n;
  if (sequence < expected) return ledger;
  if (sequence > expected) {
    throw new Error(`检查点不连续：已应用 ${ledger.checkpoint}，下一帧是 ${sequence}`);
  }
  const known = new Set(Object.keys(ledger.objects));
  const effects = await effectsForCheckpoint(checkpoint, known);
  const next = applyEffects(ledger, effects);
  next.checkpoint = sequence.toString();
  if (effects.length > 0 || sequence % 100n === 0n) {
    await publish(next, syncing, effects.length > 0);
  } else {
    await writeJsonAtomic(STATE_PATH, { checkpoint: next.checkpoint });
  }
  if (effects.length > 0) {
    console.log(`检查点 ${sequence} 更新 ${effects.length} 个 StakedWal`);
  }
  return next;
}

async function listGap(start: bigint, end: bigint, ledger: Ledger): Promise<Ledger> {
  let current = ledger;
  let after: Uint8Array | undefined;
  for (;;) {
    const call = client.ledgerService.listCheckpoints({
      startCheckpoint: start,
      endCheckpoint: end,
      readMask: READ_MASK,
      options: { limit: 20, after },
    });
    let endReason: number | undefined;
    let cursor: Uint8Array | undefined;
    for await (const frame of call.responses) {
      if (frame.checkpoint?.sequenceNumber !== undefined) {
        current = await applyCheckpoint(current, frame.checkpoint as CheckpointMessage, true);
      }
      if (frame.watermark?.cursor) cursor = frame.watermark.cursor;
      if (frame.end) endReason = frame.end.reason;
    }
    if (endReason === 1 || endReason === 2) {
      if (!cursor) throw new Error("ListCheckpoints 需要续页，但没有游标");
      after = cursor;
      continue;
    }
    return current;
  }
}

async function main() {
  const existing = await readJson<Ledger>(LEDGER_PATH);
  if (!existing) {
    throw new Error("还没有账本。先运行 npm run bootstrap。");
  }
  const state = await readJson<{ checkpoint: string }>(STATE_PATH);
  if (state && BigInt(state.checkpoint) > BigInt(existing.checkpoint)) {
    existing.checkpoint = state.checkpoint;
  }
  let ledger = existing;
  const buffered: CheckpointMessage[] = [];
  const stream = client.subscriptionService.subscribeCheckpoints({ readMask: READ_MASK });
  const iterator = stream.responses[Symbol.asyncIterator]();

  const first = await iterator.next();
  if (first.done || first.value.cursor === undefined) throw new Error("订阅没有返回起点");
  const tip = first.value.cursor;
  if (first.value.checkpoint) buffered.push(first.value.checkpoint as CheckpointMessage);

  const nextNeeded = BigInt(ledger.checkpoint) + 1n;
  if (tip >= nextNeeded) {
    ledger = await listGap(nextNeeded, tip, ledger);
  }

  const pending = buffered.sort((a, b) => Number((a.sequenceNumber ?? 0n) - (b.sequenceNumber ?? 0n)));
  for (const checkpoint of pending) {
    ledger = await applyCheckpoint(ledger, checkpoint, true);
  }

  console.log(`开始跟踪，已应用检查点 ${ledger.checkpoint}`);
  await publish(ledger, false, false);
  for (;;) {
    const frame = await iterator.next();
    if (frame.done) break;
    if (!frame.value.checkpoint) continue;
    ledger = await applyCheckpoint(ledger, frame.value.checkpoint as CheckpointMessage, false);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
