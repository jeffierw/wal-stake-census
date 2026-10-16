export const STAKED_WAL_TYPE =
  "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::staked_wal::StakedWal";

export const GRAPHQL_URL = "https://graphql.mainnet.sui.io/graphql";
export const GRPC_URL = "https://fullnode.mainnet.sui.io:443";

export const MIST_PER_WAL = 1_000_000_000n;

export const BUCKETS = [
  { label: "1–10", min: 1n * MIST_PER_WAL, max: 10n * MIST_PER_WAL },
  { label: "10–20", min: 10n * MIST_PER_WAL, max: 20n * MIST_PER_WAL },
  { label: "20–30", min: 20n * MIST_PER_WAL, max: 30n * MIST_PER_WAL },
  { label: "30–40", min: 30n * MIST_PER_WAL, max: 40n * MIST_PER_WAL },
  { label: "40–50", min: 40n * MIST_PER_WAL, max: 50n * MIST_PER_WAL },
  { label: "50–100", min: 50n * MIST_PER_WAL, max: 100n * MIST_PER_WAL },
  { label: "100–1000", min: 100n * MIST_PER_WAL, max: 1_000n * MIST_PER_WAL },
  { label: "1000–10000", min: 1_000n * MIST_PER_WAL, max: 10_000n * MIST_PER_WAL },
  { label: "10000+", min: 10_000n * MIST_PER_WAL, max: null },
] as const;
