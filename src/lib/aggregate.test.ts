import assert from "node:assert/strict";
import test from "node:test";
import { applyEffects, distributionFromLedger } from "./aggregate";
import { MIST_PER_WAL } from "./constants";
import { checkpointFromCursor, mistToWal, normalizeSuiAddress } from "./format";
import type { Ledger } from "./types";

const wal = (amount: bigint) => (amount * MIST_PER_WAL).toString();

function ledger(objects: Ledger["objects"], checkpoint = "10"): Ledger {
  return { checkpoint, objects };
}

test("同一地址的多笔本金先加总再分桶", () => {
  const result = distributionFromLedger(
    ledger({
      a: { ownerKind: "address", owner: "0x" + "a".repeat(64), principal: wal(6n), state: "Staked" },
      b: { ownerKind: "address", owner: "0x" + "a".repeat(64), principal: wal(5n), state: "Withdrawing" },
      c: { ownerKind: "address", owner: "0x" + "b".repeat(64), principal: wal(10000n), state: "Staked" },
    }),
  );

  assert.equal(result.addressCount, 2);
  assert.equal(result.objectCount, 3);
  assert.equal(result.totalPrincipal, "10011");
  assert.equal(result.max, "10000");
  const ten = result.buckets.find((row) => row.label === "10–20");
  const top = result.buckets.find((row) => row.label === "10000+");
  assert.equal(ten?.count, 1);
  assert.equal(ten?.principal, "11");
  assert.equal(ten?.principalPercent, "0.11");
  assert.equal(top?.count, 1);
  assert.equal(top?.principal, "10000");
  assert.equal(top?.principalPercent, "99.89");
  assert.equal(result.states.Staked.addresses, 2);
  assert.equal(result.states.Staked.objects, 2);
  assert.equal(result.states.Staked.principal, "10006");
  assert.equal(result.states.Withdrawing.addresses, 1);
  assert.equal(result.states.Withdrawing.objects, 1);
  assert.equal(result.states.Withdrawing.principal, "5");
  assert.equal(result.buckets.reduce((sum, row) => sum + Number(row.percent), 0), 100);
});

test("边界落在更高一档，取回后的零地址不再计数", () => {
  const start = ledger({
    a: { ownerKind: "address", owner: "0x" + "1".repeat(64), principal: wal(10n), state: "Staked" },
    b: { ownerKind: "address", owner: "0x" + "2".repeat(64), principal: wal(9n), state: "Staked" },
  });
  const after = applyEffects(start, [{ kind: "remove", objectId: "b" }]);
  const result = distributionFromLedger(after);

  assert.equal(result.addressCount, 1);
  assert.equal(result.buckets.find((row) => row.label === "10–20")?.count, 1);
  assert.equal(result.buckets.find((row) => row.label === "1–10")?.count, 0);
  assert.equal(result.median, "10");
});

test("对象主人不进入地址分桶", () => {
  const result = distributionFromLedger(
    ledger({
      wrapped: {
        ownerKind: "object",
        owner: "0x" + "3".repeat(64),
        principal: wal(50n),
        state: "Staked",
      },
    }),
  );
  assert.equal(result.addressCount, 0);
  assert.equal(result.totalPrincipal, "0");
  assert.equal(result.states.Staked.objects, 0);
  assert.equal(result.states.Staked.principal, "0");
  assert.equal(result.objectOwned.totalPrincipal, "50");
  assert.equal(result.objectOwned.holderCount, 1);
  assert.equal(result.objectOwned.objectCount, 1);
});

test("同一检查点的效果按顺序覆盖，重放结果不变", () => {
  const start = ledger({});
  const effects = [
    {
      kind: "upsert" as const,
      objectId: "obj",
      object: {
        ownerKind: "address" as const,
        owner: "0x" + "4".repeat(64),
        principal: wal(3n),
        state: "Staked" as const,
      },
    },
    { kind: "remove" as const, objectId: "obj" },
  ];
  const once = applyEffects(start, effects);
  const twice = applyEffects(once, effects);
  assert.deepEqual(once.objects, {});
  assert.deepEqual(twice.objects, {});
});

test("地址补齐到 64 位，游标前 8 字节是检查点", () => {
  assert.equal(normalizeSuiAddress("0xAB"), `0x${"ab".padStart(64, "0")}`);
  const cursor = Buffer.alloc(16);
  cursor.writeBigUInt64LE(334605338n, 0);
  assert.equal(checkpointFromCursor(cursor.toString("base64")), 334605338n);
  assert.equal(mistToWal(2_524_929_275n), "2.524929275");
});
