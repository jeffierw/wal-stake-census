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
  principal: string;
  principalPercent: string;
};

export type StateSummary = {
  objects: number;
  addresses: number;
  principal: string;
  principalPercent: string;
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
  states: Record<StakeState, StateSummary>;
  objectOwned: {
    objectCount: number;
    holderCount: number;
    totalPrincipal: string;
  };
};

export type ObjectEffect =
  | { kind: "remove"; objectId: string }
  | { kind: "upsert"; objectId: string; object: StakeObject };

/** 紧凑地址索引。十六进制不带 0x；kind 0 是地址，1 是对象。金额是 MIST。 */
export type AddressIndexFile = {
  checkpoint: string;
  entries: Array<[string, 0 | 1, string, string, number, number]>;
};

export type AddressLookup = {
  input: string;
  address: string | null;
  status: "ok" | "missing" | "invalid";
  ownerKind?: "address" | "object";
  totalPrincipal?: string;
  bucket?: string | null;
  staked?: { objects: number; principal: string };
  withdrawing?: { objects: number; principal: string };
};
