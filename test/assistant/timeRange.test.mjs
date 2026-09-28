import assert from "node:assert/strict";
import test from "node:test";
import { resolveTimeRange } from "../../dist/assistant/index.js";

const now = new Date("2026-09-28T08:30:00.000Z"); // 15:30 Bangkok, Monday

test("defaults to today in Asia/Bangkok", () => {
    const range = resolveTimeRange("@Trợ lý đã chốt gì?", now);
    assert.equal(range.label, "hôm nay");
    assert.equal(range.start.toISOString(), "2026-09-27T17:00:00.000Z");
    assert.equal(range.end, now);
});

test("resolves this week from Monday", () => {
    const range = resolveTimeRange("@Trợ lý tuần này đã chốt lấy những gì?", now);
    assert.equal(range.start.toISOString(), "2026-09-27T17:00:00.000Z");
    assert.equal(range.end, now);
});

test("resolves yesterday and recent calendar days", () => {
    const yesterday = resolveTimeRange("hôm qua đã lấy gì", now);
    assert.equal(yesterday.start.toISOString(), "2026-09-26T17:00:00.000Z");
    assert.equal(yesterday.end.toISOString(), "2026-09-27T16:59:59.999Z");

    const recent = resolveTimeRange("3 ngày nay đã lấy gì", now);
    assert.equal(recent.start.toISOString(), "2026-09-25T17:00:00.000Z");
    assert.equal(recent.end, now);
});

test("resolves an explicit inclusive date range", () => {
    const range = resolveTimeRange("từ 20/9 đến 25/9 đã lấy gì", now);
    assert.equal(range.start.toISOString(), "2026-09-19T17:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-09-25T16:59:59.999Z");
});

test("rejects invalid and future explicit ranges", () => {
    assert.throws(() => resolveTimeRange("từ 31/9 đến 31/9", now), RangeError);
    assert.throws(() => resolveTimeRange("từ 29/9 đến 30/9", now), RangeError);
});
