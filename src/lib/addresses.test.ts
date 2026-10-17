import assert from "node:assert/strict";
import test from "node:test";
import { addressIndexFromLedger } from "./aggregate";
import { AddressQueryError, mapFromIndex, queryAddresses } from "./addresses";
import { MIST_PER_WAL } from "./constants";
import type { Ledger } from "./types";

const wal = (amount: bigint) => (amount * MIST_PER_WAL).toString();
const address = (digit: string) => `0x${digit.padStart(64, "0")}`;

function indexOf(ledger: Ledger) {
  return mapFromIndex(addressIndexFromLedger(ledger));
}

test("查询地址时合并质押中和解押中，对象主人不进区间", () => {
  const map = indexOf({
    checkpoint: "7",
    objects: {
      a: { ownerKind: "address", owner: address("a"), principal: wal(6n), state: "Staked" },
      b: { ownerKind: "address", owner: address("a"), principal: wal(5n), state: "Withdrawing" },
      wrapped: { ownerKind: "object", owner: address("c"), principal: wal(50n), state: "Staked" },
    },
  });

  const [found, missing, invalid, owned] = queryAddresses(map, [
    "0xA",
    address("b"),
    "not-an-address",
    address("c"),
  ]);

  assert.equal(found?.status, "ok");
  assert.equal(found?.address, address("a"));
  assert.equal(found?.totalPrincipal, "11");
  assert.equal(found?.bucket, "10–20");
  assert.equal(found?.staked?.objects, 1);
  assert.equal(found?.staked?.principal, "6");
  assert.equal(found?.withdrawing?.principal, "5");
  assert.equal(missing?.status, "missing");
  assert.equal(invalid?.status, "invalid");
  assert.equal(invalid?.address, null);
  assert.equal(owned?.ownerKind, "object");
  assert.equal(owned?.bucket, null);
  assert.equal(owned?.totalPrincipal, "50");
});

test("重复地址只返回一次，超过上限直接拒绝", () => {
  const map = indexOf({ checkpoint: "1", objects: {} });
  const once = queryAddresses(map, [address("1"), address("1")]);
  assert.equal(once.length, 1);
  assert.throws(() => queryAddresses(map, Array.from({ length: 101 }, () => address("2"))), AddressQueryError);
});
