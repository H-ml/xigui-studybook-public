export type ByteRange = { start: number; end: number };

export function parseSingleRange(header: string, size: number): ByteRange | null;
