import { LEDGER_PATH, publish, readJson } from "../src/lib/store";
import type { Ledger } from "../src/lib/types";

const ledger = await readJson<Ledger>(LEDGER_PATH);
if (!ledger) {
  throw new Error("没有本地账本 data/ledger.json，先运行 npm run bootstrap");
}

const snapshot = await publish(ledger, true, false);
console.log(
  `已重写快照和地址索引：检查点 ${snapshot.checkpoint}，地址 ${snapshot.addressCount}，总本金 ${snapshot.totalPrincipal} WAL`,
);
