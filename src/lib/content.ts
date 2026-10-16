import { normalizeSuiAddress } from "./format";
import type { OwnerKind, StakeState } from "./types";

export function readPrincipal(value: unknown): string {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && "value" in value) {
    return readPrincipal((value as { value: unknown }).value);
  }
  throw new Error(`无法读取 principal: ${JSON.stringify(value)}`);
}

export function readState(value: unknown): StakeState {
  if (!value || typeof value !== "object") return "Staked";
  const variant = (value as { "@variant"?: unknown })["@variant"];
  return variant === "Withdrawing" ? "Withdrawing" : "Staked";
}

export function ownerFromGraphql(owner: {
  __typename?: string;
  address?: { address?: string };
}): { ownerKind: OwnerKind; owner: string } {
  const address = owner.address?.address;
  if ((owner.__typename === "AddressOwner" || owner.__typename === "ConsensusAddressOwner") && address) {
    return { ownerKind: "address", owner: normalizeSuiAddress(address) };
  }
  if (owner.__typename === "ObjectOwner" && address) {
    return { ownerKind: "object", owner: normalizeSuiAddress(address) };
  }
  return { ownerKind: "other", owner: owner.__typename ?? "unknown" };
}

type ProtoValue = {
  kind?: {
    oneofKind?: string;
    stringValue?: string;
    numberValue?: number;
    boolValue?: boolean;
    structValue?: { fields: Record<string, ProtoValue> };
    listValue?: { values: ProtoValue[] };
  };
  stringValue?: string;
  structValue?: { fields: Record<string, ProtoValue> };
};

export function protoValueToJson(value: ProtoValue | undefined): unknown {
  if (!value) return null;
  const kind = value.kind?.oneofKind;
  if (kind === "stringValue") return value.kind?.stringValue ?? null;
  if (kind === "numberValue") return value.kind?.numberValue ?? null;
  if (kind === "boolValue") return value.kind?.boolValue ?? null;
  if (kind === "nullValue" || kind === undefined && value.stringValue === undefined && value.structValue === undefined) {
    if (!kind) {
      if (typeof value.stringValue === "string") return value.stringValue;
      if (value.structValue) return structToJson(value.structValue);
    }
    return null;
  }
  if (kind === "structValue" && value.kind?.structValue) return structToJson(value.kind.structValue);
  if (kind === "listValue") return (value.kind?.listValue?.values ?? []).map((item) => protoValueToJson(item));
  return null;
}

function structToJson(struct: { fields: Record<string, ProtoValue> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(struct.fields)) {
    out[key] = protoValueToJson(field);
  }
  return out;
}
