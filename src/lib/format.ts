import { MIST_PER_WAL } from "./constants";

export function normalizeSuiAddress(input: string): string {
  const hex = input.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,64}$/.test(hex)) {
    throw new Error(`无法识别的 Sui 地址: ${input}`);
  }
  return `0x${hex.padStart(64, "0")}`;
}

export function parseMist(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`本金不是整数 MIST: ${value}`);
  }
  return BigInt(value);
}

export function formatWal(value: string): string {
  const negative = value.startsWith("-");
  const [whole, fraction] = (negative ? value.slice(1) : value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = fraction ? `${grouped}.${fraction}` : grouped;
  return negative ? `-${text}` : text;
}

export function mistToWal(mist: bigint): string {
  const negative = mist < 0n;
  const value = negative ? -mist : mist;
  const whole = value / MIST_PER_WAL;
  const fraction = (value % MIST_PER_WAL).toString().padStart(9, "0").replace(/0+$/, "");
  const text = fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}

/** 把分子 / 分母 的 MIST 比值格式化成 WAL 小数，截断到 9 位。 */
export function formatMistRatio(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return "0";
  const negative = numerator < 0n;
  const value = negative ? -numerator : numerator;
  const scale = denominator * MIST_PER_WAL;
  const whole = value / scale;
  let remainder = value % scale;
  let digits = "";
  for (let i = 0; i < 9; i += 1) {
    remainder *= 10n;
    digits += (remainder / scale).toString();
    remainder %= scale;
  }
  digits = digits.replace(/0+$/, "");
  const text = digits.length > 0 ? `${whole}.${digits}` : whole.toString();
  return negative ? `-${text}` : text;
}

export function checkpointFromCursor(cursor: string): bigint {
  const raw = Buffer.from(cursor, "base64");
  if (raw.length < 8) {
    throw new Error("GraphQL 游标里没有检查点号");
  }
  return raw.readBigUInt64LE(0);
}
