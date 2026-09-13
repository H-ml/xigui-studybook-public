import assert from "node:assert/strict";
import test from "node:test";
import { parseSingleRange } from "../lib/http-range.mjs";

test("解析正常闭区间", () => {
  assert.deepEqual(parseSingleRange("bytes=10-19", 100), { start: 10, end: 19 });
});

test("解析 open-ended range 到文件末尾", () => {
  assert.deepEqual(parseSingleRange("bytes=10-", 100), { start: 10, end: 99 });
});

test("解析 suffix range 为文件尾部", () => {
  assert.deepEqual(parseSingleRange("bytes=-20", 100), { start: 80, end: 99 });
  assert.deepEqual(parseSingleRange("bytes=-200", 100), { start: 0, end: 99 });
});

test("将超出文件大小的 end 限制到文件末尾", () => {
  assert.deepEqual(parseSingleRange("bytes=90-200", 100), { start: 90, end: 99 });
});

test("拒绝 start 越界", () => {
  assert.equal(parseSingleRange("bytes=100-", 100), null);
});

test("拒绝非法、反向及空范围", () => {
  assert.equal(parseSingleRange("bytes=abc-def", 100), null);
  assert.equal(parseSingleRange("bytes=20-10", 100), null);
  assert.equal(parseSingleRange("bytes=-", 100), null);
});

test("拒绝多范围请求", () => {
  assert.equal(parseSingleRange("bytes=0-9,20-29", 100), null);
});

test("拒绝空文件和 0 长度 suffix", () => {
  assert.equal(parseSingleRange("bytes=0-", 0), null);
  assert.equal(parseSingleRange("bytes=-0", 100), null);
});
