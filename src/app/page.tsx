import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Distribution } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadSnapshot(): Promise<Distribution> {
  const raw = await readFile(path.join(process.cwd(), "data/snapshot.json"), "utf8");
  return JSON.parse(raw) as Distribution;
}

export default async function Home() {
  const snapshot = await loadSnapshot();
  const rows = snapshot.belowOne.count > 0 ? [snapshot.belowOne, ...snapshot.buckets] : snapshot.buckets;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm text-emerald-300/80">Walrus 主网 · 按地址本金</p>
      <h1 className="mt-2 text-3xl font-semibold">WAL 质押分布</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
        每个地址名下全部 StakedWal 的 principal 相加，不含收益。申请解押但仍未取回的对象计入。
        {snapshot.checkpoint
          ? ` 数据截至检查点 ${snapshot.checkpoint}。`
          : " 索引还没有写出第一份快照。"}
        {snapshot.syncing ? " 索引仍在追赶链头。" : ""}
      </p>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="总质押 WAL" value={snapshot.totalPrincipal} />
        <Stat label="地址数" value={String(snapshot.addressCount)} />
        <Stat label="平均" value={snapshot.average} />
        <Stat label="中位数" value={snapshot.median} />
        <Stat label="最大" value={snapshot.max} />
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">区间（WAL）</th>
              <th className="px-4 py-3 font-medium">地址数</th>
              <th className="px-4 py-3 font-medium">占地址数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-white/10">
                <td className="px-4 py-3">{row.label}</td>
                <td className="px-4 py-3 tabular-nums">{row.count}</td>
                <td className="px-4 py-3 tabular-nums">{row.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
        <p>地址持有的对象：{snapshot.objectCount}</p>
        <p>
          状态：质押中 {snapshot.states.Staked}，解押中 {snapshot.states.Withdrawing}
        </p>
        <p>
          对象持有人：{snapshot.objectOwned.holderCount} 个，本金 {snapshot.objectOwned.totalPrincipal} WAL
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-snug tabular-nums">
        {grouped}
        {fraction ? <span className="block text-sm text-zinc-300">.{fraction}</span> : null}
      </p>
    </div>
  );
}
