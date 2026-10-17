import { readFile } from "node:fs/promises";
import path from "node:path";
import { AddressSearch } from "@/app/address-search";
import { formatWal } from "@/lib/format";
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

      <AddressSearch />

      <section className="mt-10">
        <h2 className="text-lg font-semibold">区间分布</h2>
        <p className="mt-1 text-sm text-zinc-400">地址先按本金合计落入区间。质押数量是该区间里这些地址的本金之和。</p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">区间（WAL）</th>
                <th className="px-4 py-3 font-medium">地址数</th>
                <th className="px-4 py-3 font-medium">占地址数</th>
                <th className="px-4 py-3 font-medium">质押 WAL</th>
                <th className="px-4 py-3 font-medium">占质押量</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-white/10">
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3 tabular-nums">{row.count.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 tabular-nums">{row.percent}%</td>
                  <td className="px-4 py-3 tabular-nums">{formatWal(row.principal)}</td>
                  <td className="px-4 py-3 tabular-nums">{row.principalPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">质押中与解押中</h2>
        <p className="mt-1 text-sm text-zinc-400">
          同一地址可以两边都有对象，地址数会各算一次。本金按对象状态拆开，加起来等于上面的总质押。
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">地址数</th>
                <th className="px-4 py-3 font-medium">对象数</th>
                <th className="px-4 py-3 font-medium">本金 WAL</th>
                <th className="px-4 py-3 font-medium">占本金</th>
              </tr>
            </thead>
            <tbody>
              <StateRow label="质押中" summary={snapshot.states.Staked} />
              <StateRow label="解押中" summary={snapshot.states.Withdrawing} />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-zinc-400">
        <p className="font-medium text-zinc-200">对象持有，不进地址区间</p>
        <p className="mt-1">
          {snapshot.objectOwned.holderCount.toLocaleString("en-US")} 个对象，本金 {formatWal(snapshot.objectOwned.totalPrincipal)}{" "}
          WAL，共 {snapshot.objectOwned.objectCount.toLocaleString("en-US")} 笔。这些 StakedWal
          的主人不是地址，而是另一个链上对象。抽查是交易市场的挂单：质押被放进 Listing
          的 dynamic field，暂时由挂单托管，对象上没有可直接归桶的地址。因此不计入总质押和上面的区间，单独列在这里。
        </p>
      </section>
    </main>
  );
}

function StateRow({
  label,
  summary,
}: {
  label: string;
  summary: Distribution["states"]["Staked"];
}) {
  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-3">{label}</td>
      <td className="px-4 py-3 tabular-nums">{summary.addresses.toLocaleString("en-US")}</td>
      <td className="px-4 py-3 tabular-nums">{summary.objects.toLocaleString("en-US")}</td>
      <td className="px-4 py-3 tabular-nums">{formatWal(summary.principal)}</td>
      <td className="px-4 py-3 tabular-nums">{summary.principalPercent}%</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const negative = value.startsWith("-");
  const [whole, fraction] = (negative ? value.slice(1) : value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-snug tabular-nums">
        {negative ? "-" : ""}
        {grouped}
        {fraction ? <span className="block text-sm text-zinc-300">.{fraction}</span> : null}
      </p>
    </div>
  );
}
