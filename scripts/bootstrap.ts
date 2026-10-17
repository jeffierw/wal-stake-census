import { appendFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import path from "node:path";
import { GRAPHQL_URL, STAKED_WAL_TYPE } from "../src/lib/constants";
import { ownerFromGraphql, readPrincipal, readState } from "../src/lib/content";
import { checkpointFromCursor, normalizeSuiAddress } from "../src/lib/format";
import { BOOTSTRAP_PATH, DATA_DIR, publish, readJson, writeJsonAtomic } from "../src/lib/store";
import type { Ledger, StakeObject } from "../src/lib/types";

const OBJECTS_PATH = path.join(DATA_DIR, "bootstrap-objects.jsonl");

const QUERY = `query($after: String) {
  objects(first: 50, after: $after, filter: { type: "${STAKED_WAL_TYPE}" }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      address
      owner {
        __typename
        ... on AddressOwner { address { address } }
        ... on ObjectOwner { address { address } }
        ... on ConsensusAddressOwner { address { address } }
      }
      asMoveObject { contents { json } }
    }
  }
}`;

type Page = {
  objects: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      address: string;
      owner: { __typename?: string; address?: { address?: string } } | null;
      asMoveObject: { contents: { json: unknown } | null } | null;
    }>;
  };
};

type Progress = {
  checkpoint: string;
  cursor: string | null;
  count: number;
};

async function graphql(after: string | null): Promise<Page> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { after } }),
      });
      if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
      const body = (await response.json()) as { data?: Page; errors?: unknown };
      if (body.errors || !body.data) throw new Error(JSON.stringify(body.errors));
      return body.data;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function loadObjects(): Promise<Record<string, StakeObject>> {
  const objects: Record<string, StakeObject> = {};
  const lines = createInterface({ input: createReadStream(OBJECTS_PATH), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const row = JSON.parse(line) as StakeObject & { id: string };
    const { id, ...object } = row;
    objects[id] = object;
  }
  return objects;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const saved = await readJson<Progress>(BOOTSTRAP_PATH);
  let cursor = saved?.cursor ?? null;
  let checkpoint = saved?.checkpoint ?? null;
  let count = saved?.count ?? 0;
  let pages = 0;
  const started = Date.now();

  for (;;) {
    const page = await graphql(cursor);
    const nextCursor = page.objects.pageInfo.endCursor;
    if (!nextCursor) throw new Error("GraphQL 没有返回游标");
    const pageCheckpoint = checkpointFromCursor(nextCursor).toString();
    if (!checkpoint) checkpoint = pageCheckpoint;
    if (pageCheckpoint !== checkpoint) {
      throw new Error(`快照检查点从 ${checkpoint} 变成 ${pageCheckpoint}，请删掉 data/bootstrap.json 后重扫`);
    }

    const lines: string[] = [];
    for (const node of page.objects.nodes) {
      const json = node.asMoveObject?.contents?.json;
      if (!json || !node.owner) continue;
      const owner = ownerFromGraphql(node.owner);
      const row = {
        id: normalizeSuiAddress(node.address),
        ownerKind: owner.ownerKind,
        owner: owner.owner,
        principal: readPrincipal((json as { principal?: unknown }).principal),
        state: readState((json as { state?: unknown }).state),
      };
      lines.push(JSON.stringify(row));
    }
    if (lines.length > 0) await appendFile(OBJECTS_PATH, `${lines.join("\n")}\n`);

    count += lines.length;
    cursor = page.objects.pageInfo.hasNextPage ? nextCursor : null;
    pages += 1;
    await writeJsonAtomic(BOOTSTRAP_PATH, { checkpoint, cursor, count } satisfies Progress);
    if (pages % 10 === 0) {
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`已扫描 ${count} 个对象，${pages} 页，用时 ${seconds}s，检查点 ${checkpoint}`);
    }
    if (!page.objects.pageInfo.hasNextPage) break;
  }

  const ledger: Ledger = { checkpoint: checkpoint!, objects: await loadObjects() };
  const snapshot = await publish(ledger, true);
  console.log(
    `快照完成：检查点 ${snapshot.checkpoint}，地址 ${snapshot.addressCount}，总本金 ${snapshot.totalPrincipal} WAL`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
