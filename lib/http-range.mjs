function parseInteger(value) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseSingleRange(header, size) {
  if (!Number.isSafeInteger(size) || size <= 0 || typeof header !== "string") return null;
  if (header.includes(",")) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = parseInteger(match[2]);
    if (suffixLength === null || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = parseInteger(match[1]);
  if (start === null || start >= size) return null;

  if (!match[2]) return { start, end: size - 1 };

  const requestedEnd = parseInteger(match[2]);
  if (requestedEnd === null || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}
