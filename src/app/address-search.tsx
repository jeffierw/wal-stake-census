"use client";

import { useState, type FormEvent } from "react";
import { formatWal } from "@/lib/format";
import type { AddressLookup } from "@/lib/types";

const splitAddresses = /[\s,，;；]+/;

export function AddressSearch() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<AddressLookup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const addresses = text.split(splitAddresses).map((item) => item.trim()).filter(Boolean);
    if (addresses.length === 0) {
      setResults(null);
      setError("先填入至少一个地址");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addresses }),
      });
      const payload = (await response.json()) as { error?: string; results?: AddressLookup[] };
      if (!response.ok) {
        setResults(null);
        setError(payload.error ?? "查询失败");
        return;
      }
      setResults(payload.results ?? []);
    } catch {
      setResults(null);
      setError("查询失败");
    } finally {
      setPending(false);
    }
  }

  const found = results?.filter((row) => row.status === "ok" && row.ownerKind === "address") ?? [];

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">查询地址</h2>
      <p className="mt-1 text-sm text-zinc-400">一次最多 100 个，用换行、逗号或空格分隔。结果和上面同一份快照。</p>
      <form onSubmit={onSubmit} className="mt-3">
        <label htmlFor="addresses" className="sr-only">
          地址
        </label>
        <textarea
          id="addresses"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="0x..."
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm outline-none focus:border-emerald-300/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-full bg-emerald-300 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
        >
          {pending ? "查询中" : "查询"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {results && results.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-white/5 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">地址</th>
                <th className="px-4 py-3 font-medium">合计 WAL</th>
                <th className="px-4 py-3 font-medium">区间</th>
                <th className="px-4 py-3 font-medium">质押中</th>
                <th className="px-4 py-3 font-medium">解押中</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={`${row.input}:${row.address ?? "invalid"}`} className="border-t border-white/10">
                  <td className="px-4 py-3">
                    <AddressCell row={row} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.status === "ok" ? formatWal(row.totalPrincipal ?? "0") : "—"}</td>
                  <td className="px-4 py-3">{bucketText(row)}</td>
                  <td className="px-4 py-3 tabular-nums">{sideText(row, "staked")}</td>
                  <td className="px-4 py-3 tabular-nums">{sideText(row, "withdrawing")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {found.length > 1 ? <p className="mt-3 text-sm text-zinc-400">以上 {found.length} 个地址都有直接持有的质押。</p> : null}
    </section>
  );
}

function bucketText(row: AddressLookup): string {
  if (row.status === "invalid") return "地址无法识别";
  if (row.status === "missing") return "当前没有质押";
  if (row.ownerKind === "object") return "对象持有，不进区间";
  return row.bucket ?? "不足 1";
}

function sideText(row: AddressLookup, side: "staked" | "withdrawing"): string {
  const value = row[side];
  if (row.status !== "ok" || !value || value.objects === 0) return "—";
  return `${formatWal(value.principal)} · ${value.objects} 笔`;
}

function AddressCell({ row }: { row: AddressLookup }) {
  if (!row.address) return <span className="text-zinc-400">{row.input}</span>;
  const href =
    row.ownerKind === "object"
      ? `https://suiscan.xyz/mainnet/object/${row.address}`
      : `https://suiscan.xyz/mainnet/account/${row.address}`;
  return (
    <span className="flex items-center gap-2">
      <a href={href} target="_blank" rel="noreferrer" className="font-mono text-emerald-200" title={row.address}>
        {row.address.slice(0, 6)}…{row.address.slice(-4)}
      </a>
      <CopyButton value={row.address} />
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-zinc-400"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}
