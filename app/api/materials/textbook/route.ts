import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { parseSingleRange } from "../../../../lib/http-range.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textbookPath() {
  return process.env.TEXTBOOK_PATH || "materials/textbook.pdf";
}

function fileHeaders(info: { size: number; mtime: Date; mtimeMs: number }) {
  return {
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    "ETag": `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`,
    "Last-Modified": info.mtime.toUTCString(),
    "Cache-Control": "private, max-age=3600",
  };
}

function rangeNotSatisfiable(size: number) {
  return new Response(null, {
    status: 416,
    headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
  });
}

export async function GET(request: NextRequest) {
  const file = textbookPath();
  const info = await fs.stat(/* turbopackIgnore: true */ file);
  const range = request.headers.get("range");
  if (range) {
    const parsed = parseSingleRange(range, info.size);
    if (!parsed) return rangeNotSatisfiable(info.size);
    const { start, end } = parsed;
    const stream = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...fileHeaders(info),
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ file)) as ReadableStream;
  return new Response(stream, {
    headers: { ...fileHeaders(info), "Content-Length": String(info.size) },
  });
}

export async function HEAD() {
  const info = await fs.stat(/* turbopackIgnore: true */ textbookPath());
  return new Response(null, {
    headers: { ...fileHeaders(info), "Content-Length": String(info.size) },
  });
}
