export type OwnerKind = "address" | "object" | "other";
export type StakeState = "Staked" | "Withdrawing";

export type StakeObject = {
  ownerKind: OwnerKind;
  owner: string;
  principal: string;
  state: StakeState;
};

export type Ledger = {
  checkpoint: string;
  objects: Record<string, StakeObject>;
};

export type BucketRow = {
  label: string;
  count: number;
  percent: string;
};

export type Distribution = {
  checkpoint: string | null;
  syncing: boolean;
  generatedAt: string | null;
  addressCount: number;
  objectCount: number;
  totalPrincipal: string;
  average: string;
  median: string;
  max: string;
  buckets: BucketRow[];
  belowOne: BucketRow;
  states: Record<StakeState, number>;
  objectOwned: {
    objectCount: number;
    holderCount: number;
    totalPrincipal: string;
  };
};

export type ObjectEffect =
  | { kind: "remove"; objectId: string }
  | { kind: "upsert"; objectId: string; object: StakeObject };
