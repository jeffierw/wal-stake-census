import { NextResponse } from "next/server";
import { AddressQueryError, loadAddressIndex, queryAddresses } from "@/lib/addresses";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请提供地址数组" }, { status: 400 });
  }
  const addresses = (body as { addresses?: unknown }).addresses;
  if (!Array.isArray(addresses) || addresses.some((item) => typeof item !== "string")) {
    return NextResponse.json({ error: "请提供地址数组" }, { status: 400 });
  }

  try {
    const index = await loadAddressIndex();
    return NextResponse.json({
      checkpoint: index.checkpoint,
      results: queryAddresses(index.map, addresses),
    });
  } catch (error) {
    if (error instanceof AddressQueryError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
