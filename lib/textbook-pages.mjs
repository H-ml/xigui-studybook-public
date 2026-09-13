export const TEXTBOOK_PAGE_COUNT = 362;

export function parseTextbookPage(value, pageCount = TEXTBOOK_PAGE_COUNT) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) return null;
  return page;
}

export function textbookPageFileName(page) {
  if (!Number.isSafeInteger(page) || page < 1) throw new TypeError("教材页码必须是正整数");
  return `page-${String(page).padStart(4, "0")}.webp`;
}
