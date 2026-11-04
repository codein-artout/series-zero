import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getCard } from "@/lib/server/cards";
import { CardImage, cardFonts } from "@/lib/server/card-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZES = { post: { width: 1080, height: 1350 }, link: { width: 1200, height: 630 } } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const card = await getCard(cardId);
  if (!card) return new Response("Not found", { status: 404 });
  const size = req.nextUrl.searchParams.get("size") === "link" ? "link" : "post";
  return new ImageResponse(<CardImage d={card.data} size={size} />, { ...SIZES[size], fonts: cardFonts(), headers: { "cache-control": "public, max-age=300" } });
}
