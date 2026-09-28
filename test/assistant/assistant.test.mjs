import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { ANALYZER_INSTRUCTIONS, ReadonlyGroupAssistant, attachReadonlyAssistant, formatZaloReply, loadGroupHistory, parseAnalysisResult, shouldHandleTrigger } from "../../dist/assistant/index.js";
import { groupMessage, quoteOf } from "./helpers.mjs";

const now = new Date("2026-09-28T08:30:00.000Z");

test("ignores a caller outside the whitelist", async () => {
    let historyCalls = 0;
    const assistant = new ReadonlyGroupAssistant({
        bridge: { async getGroupChatHistory() { historyCalls++; return { groupMsgs: [] }; } },
        analyzer: { async analyze() { throw new Error("must not run"); } },
        internalUsers: new Set(["internal"]),
        now: () => now,
    });
    const response = await assistant.handle({ groupId: "group-1", senderId: "external", text: "@Trợ lý hôm nay đã chốt gì?" });
    assert.equal(response, null);
    assert.equal(historyCalls, 0);
});

test("accepts an actual mention for an internal caller", () => {
    assert.equal(shouldHandleTrigger(
        { groupId: "g", senderId: "internal", text: "đã chốt gì?", mentions: [{ uid: "bot" }] },
        new Set(["internal"]),
        "bot",
    ), true);
});

test("loads only the current group and range while retaining yesterday quote context", async () => {
    const yesterday = groupMessage({ msgId: "60", text: "Má phanh trước Avante", ts: Date.parse("2026-09-27T10:00:00Z") });
    const today = groupMessage({ msgId: "61", text: "Lấy 1", ts: Date.parse("2026-09-28T02:00:00Z"), quote: quoteOf(yesterday) });
    const otherGroup = groupMessage({ msgId: "62", text: "Lấy 9", ts: Date.parse("2026-09-28T02:01:00Z"), groupId: "group-2" });
    const page = await loadGroupHistory(
        { async getGroupChatHistory(groupId) { assert.equal(groupId, "group-1"); return { groupMsgs: [yesterday, today, otherGroup] }; } },
        "group-1",
        { start: new Date("2026-09-27T17:00:00Z"), end: now, label: "hôm nay" },
    );
    assert.deepEqual(page.messages.map((item) => item.data.msgId), ["61"]);
});

test("runs confirmed-items flow with traceable structured output", async () => {
    const product = groupMessage({ msgId: "70", text: "Má phanh trước Avante", ts: Date.parse("2026-09-27T10:00:00Z") });
    const price = groupMessage({ msgId: "71", text: "500 MOBIS", ts: Date.parse("2026-09-28T01:00:00Z"), quote: quoteOf(product) });
    const take = groupMessage({ msgId: "72", text: "Lấy 1", ts: Date.parse("2026-09-28T02:00:00Z"), quote: quoteOf(price) });
    let analyzerInput;
    const assistant = new ReadonlyGroupAssistant({
        bridge: { async getGroupChatHistory() { return { groupMsgs: [take, price, product] }; } },
        analyzer: { async analyze(input) {
            analyzerInput = input;
            return {
                intent: "CONFIRMED_ITEMS",
                events: [{
                    type: "PURCHASE_CONFIRMED",
                    product: "Má phanh trước Avante",
                    quantity: 1,
                    price: 500,
                    source_or_brand: "MOBIS",
                    confidence: "high",
                    source_message_ids: ["70", "71", "72"],
                }],
            };
        } },
        internalUsers: new Set(["internal"]),
        now: () => now,
    });

    const response = await assistant.handle({ groupId: "group-1", senderId: "internal", text: "@Trợ lý hôm nay đã chốt lấy những gì?" });
    assert.deepEqual(analyzerInput.messages.find((item) => item.message_id === "72").quote_chain, ["500 MOBIS", "Má phanh trước Avante"]);
    assert.deepEqual(response.result.events[0], {
        type: "PURCHASE_CONFIRMED",
        product: "Má phanh trước Avante",
        quantity: 1,
        price: 500,
        source_or_brand: "MOBIS",
        confidence: "high",
        source_message_ids: ["70", "71", "72"],
    });
    assert.match(response.reply, /SL: 1/u);
    assert.match(response.reply, /Giá: 500/u);
});

test("runs unquoted-items flow without inventing a price", async () => {
    const request = groupMessage({ msgId: "80", text: "Báo giúp rotuyn cân bằng Ertiga", ts: Date.parse("2026-09-28T02:00:00Z") });
    const assistant = new ReadonlyGroupAssistant({
        bridge: { async getGroupChatHistory() { return { groupMsgs: [request] }; } },
        analyzer: { async analyze() {
            return {
                intent: "UNQUOTED_ITEMS",
                events: [{
                    type: "UNQUOTED_ITEM",
                    product: "Rotuyn cân bằng Ertiga",
                    quantity: null,
                    price: null,
                    source_or_brand: null,
                    confidence: "high",
                    source_message_ids: ["80"],
                }],
            };
        } },
        internalUsers: new Set(["internal"]),
        now: () => now,
    });

    const response = await assistant.handle({ groupId: "group-1", senderId: "internal", text: "@Trợ lý còn hàng nào hỏi mà chưa báo giá?" });
    assert.equal(response.result.events[0].price, null);
    assert.match(response.reply, /Rotuyn cân bằng Ertiga/u);
    assert.doesNotMatch(response.reply, /Giá:/u);
});

test("does not ask AI to conclude from truncated history", async () => {
    const recent = groupMessage({ msgId: "90", text: "Lấy 1", ts: Date.parse("2026-09-28T08:00:00Z") });
    let analyzed = false;
    const assistant = new ReadonlyGroupAssistant({
        bridge: { async getGroupChatHistory() { return { groupMsgs: [recent], hasMore: true }; } },
        analyzer: { async analyze() { analyzed = true; return {}; } },
        internalUsers: new Set(["internal"]),
        maxHistoryMessages: 1,
        now: () => now,
    });
    const response = await assistant.handle({ groupId: "group-1", senderId: "internal", text: "@Trợ lý hôm nay đã chốt gì?" });
    assert.equal(analyzed, false);
    assert.equal(response.metadata.truncated, true);
    assert.match(response.reply, /Không thể đọc đủ lịch sử/u);
});

test("rejects invented source ids and reports uncertain AI output", () => {
    assert.throws(() => parseAnalysisResult({
        intent: "CONFIRMED_ITEMS",
        events: [{ type: "PURCHASE_CONFIRMED", product: "Bịa", quantity: 1, price: null, source_or_brand: null, confidence: "high", source_message_ids: ["unknown"] }],
    }, "CONFIRMED_ITEMS", new Set(["known"])), /unknown source/u);

    const parsed = parseAnalysisResult({
        intent: "CONFIRMED_ITEMS",
        events: [{ type: "PURCHASE_CONFIRMED", product: null, quantity: 1, price: null, source_or_brand: null, confidence: "low", source_message_ids: ["known"] }],
    }, "CONFIRMED_ITEMS", new Set(["known"]));
    assert.equal(parsed.uncertain_count, 1);
    assert.match(formatZaloReply(parsed, "hôm nay"), /⚠️ Có 1 trường hợp/u);
    assert.match(ANALYZER_INSTRUCTIONS, /Không tự bịa/u);
});

test("integration replies to a group and logs metadata without message content", async () => {
    const trigger = groupMessage({ msgId: "100", text: "@Trợ lý hôm nay đã chốt gì?", ts: Date.parse("2026-09-28T02:00:00Z"), senderId: "internal" });
    const listener = new EventEmitter();
    let sent;
    const assistant = new ReadonlyGroupAssistant({
        bridge: { async getGroupChatHistory() { return { groupMsgs: [trigger] }; } },
        analyzer: { async analyze() { return { intent: "CONFIRMED_ITEMS", events: [] }; } },
        internalUsers: new Set(["internal"]),
        now: () => now,
    });
    const logged = new Promise((resolve) => {
        attachReadonlyAssistant({
            listener,
            async sendMessage(message, threadId, type) { sent = { message, threadId, type }; },
        }, assistant, resolve);
    });

    listener.emit("message", trigger);
    const metadata = await logged;
    assert.equal(sent.threadId, "group-1");
    assert.equal(metadata.status, "replied");
    assert.deepEqual(metadata.analysis, { intent: "CONFIRMED_ITEMS", eventCount: 0, uncertainCount: 0, truncated: false });
    assert.equal(JSON.stringify(metadata).includes(trigger.data.content), false);
});
