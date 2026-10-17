import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { addressIndexFromLedger, distributionFromLedger } from "./aggregate";
import type { Distribution, Ledger } from "./types";

export const DATA_DIR = path.join(process.cwd(), "data");
export const LEDGER_PATH = path.join(DATA_DIR, "ledger.json");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "snapshot.json");
export const ADDRESS_INDEX_PATH = path.join(DATA_DIR, "address-index.json");
export const BOOTSTRAP_PATH = path.join(DATA_DIR, "bootstrap.json");
export const STATE_PATH = path.join(DATA_DIR, "state.json");

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

export async function publish(
  ledger: Ledger,
  syncing: boolean,
  persistObjects = true,
): Promise<Distribution> {
  const snapshot = distributionFromLedger(ledger, {
    syncing,
    generatedAt: new Date().toISOString(),
  });
  if (persistObjects) await writeJsonAtomic(LEDGER_PATH, ledger);
  await writeJsonAtomic(STATE_PATH, { checkpoint: ledger.checkpoint });
  await writeJsonAtomic(SNAPSHOT_PATH, snapshot);
  await writeJsonAtomic(ADDRESS_INDEX_PATH, addressIndexFromLedger(ledger));
  return snapshot;
}
