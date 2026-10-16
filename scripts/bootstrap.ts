import { GRAPHQL_URL, STAKED_WAL_TYPE } from "../src/lib/constants";
import { ownerFromGraphql, readPrincipal, readState } from "../src/lib/content";
import { checkpointFromCursor, normalizeSuiAddress } from "../src/lib/format";
import { BOOTSTRAP_PATH, publish, readJson, writeJsonAtomic } from "../src/lib/store";
import type { Ledger, StakeObject } from "../src/lib/types";

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
  objects: Record<string, StakeObject>;
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

async function main() {
  const saved = await readJson<Progress>(BOOTSTRAP_PATH);
  const objects: Record<string, StakeObject> = saved?.objects ?? {};
  let cursor = saved?.cursor ?? null;
  let checkpoint = saved?.checkpoint ?? null;
  let pages = 0;

  for (;;) {
    const page = await graphql(cursor);
    const nextCursor = page.objects.pageInfo.endCursor;
    if (!nextCursor) throw new Error("GraphQL 没有返回游标");
    const pageCheckpoint = checkpointFromCursor(nextCursor).toString();
    if (!checkpoint) checkpoint = pageCheckpoint;
    if (pageCheckpoint !== checkpoint) {
      throw new Error(`快照检查点从 ${checkpoint} 变成 ${pageCheckpoint}，请删掉 data/bootstrap.json 后重扫`);
    }

    for (const node of page.objects.nodes) {
      const json = node.asMoveObject?.contents?.json;
      if (!json || !node.owner) continue;
      const owner = ownerFromGraphql(node.owner);
      const objectId = normalizeSuiAddress(node.address);
      objects[objectId] = {
        ownerKind: owner.ownerKind,
        owner: owner.owner,
        principal: readPrincipal((json as { principal?: unknown }).principal),
        state: readState((json as { state?: unknown }).state),
      };
    }

    cursor = page.objects.pageInfo.hasNextPage ? nextCursor : null;
    pages += 1;
    await writeJsonAtomic(BOOTSTRAP_PATH, { checkpoint, cursor, objects } satisfies Progress);
    if (pages % 20 === 0) {
      console.log(`已扫描 ${Object.keys(objects).length} 个对象，检查点 ${checkpoint}`);
    }
    if (!page.objects.pageInfo.hasNextPage) break;
  }

  const ledger: Ledger = { checkpoint: checkpoint!, objects };
  const snapshot = await publish(ledger, true);
  console.log(
    `快照完成：检查点 ${snapshot.checkpoint}，地址 ${snapshot.addressCount}，总本金 ${snapshot.totalPrincipal} WAL`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
