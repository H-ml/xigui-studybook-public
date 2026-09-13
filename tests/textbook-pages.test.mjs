import assert from "node:assert/strict";
import test from "node:test";
import { parseTextbookPage, textbookPageFileName } from "../lib/textbook-pages.mjs";

test("解析教材物理页码", () => {
  assert.equal(parseTextbookPage("1"), 1);
  assert.equal(parseTextbookPage("82"), 82);
  assert.equal(parseTextbookPage("362"), 362);
});

test("拒绝越界或非法教材页码", () => {
  assert.equal(parseTextbookPage("0"), null);
  assert.equal(parseTextbookPage("363"), null);
  assert.equal(parseTextbookPage("82.5"), null);
  assert.equal(parseTextbookPage("../82"), null);
});

test("生成固定宽度的安全页面文件名", () => {
  assert.equal(textbookPageFileName(1), "page-0001.webp");
  assert.equal(textbookPageFileName(82), "page-0082.webp");
  assert.throws(() => textbookPageFileName(0), TypeError);
});
