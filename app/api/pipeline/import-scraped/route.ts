import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { importScrapedArticles } from "@/lib/server/feeds/repository";
import { errorResponse, jsonResponse, readJsonRequest } from "@/lib/server/http";
import { scrapedArticleImportRequestSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request, ["client", "employee"], { csrf: true });
    const input = scrapedArticleImportRequestSchema.parse(await readJsonRequest(request));
    const result = await importScrapedArticles(
      getDatabase(),
      input.articles,
      session.user.id,
    );
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
