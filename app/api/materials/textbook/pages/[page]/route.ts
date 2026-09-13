import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { parseTextbookPage, textbookPageFileName } from "../../../../../../lib/textbook-pages.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textbookPagesPath() {
  return (process.env.TEXTBOOK_PAGES_PATH || "materials/pages").replace(/\/$/, "");
}

function pageHeaders(info: { size: number; mtime: Date; mtimeMs: number }) {
  return {
    "Content-Type": "image/webp",
    "Content-Length": String(info.size),
    "ETag": `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`,
    "Last-Modified": info.mtime.toUTCString(),
    "Cache-Control": "private, max-age=604800, immutable",
  };
}

async function resolvePage(rawPage: string) {
  const page = parseTextbookPage(rawPage);
  if (!page) return null;
  const file = `${textbookPagesPath()}/${textbookPageFileName(page)}`;
  try {
    return { file, info: await fs.stat(/* turbopackIgnore: true */ file) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ page: string }> }) {
  const { page } = await context.params;
  const resolved = await resolvePage(page);
  if (!resolved) return Response.json({ error: "教材页面尚未生成" }, { status: 404 });

  const headers = pageHeaders(resolved.info);
  if (request.headers.get("if-none-match") === headers.ETag) {
    return new Response(null, { status: 304, headers });
  }

  const stream = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ resolved.file)) as ReadableStream;
  return new Response(stream, { headers });
}

export async function HEAD(_request: NextRequest, context: { params: Promise<{ page: string }> }) {
  const { page } = await context.params;
  const resolved = await resolvePage(page);
  if (!resolved) return new Response(null, { status: 404 });
  return new Response(null, { headers: pageHeaders(resolved.info) });
}
