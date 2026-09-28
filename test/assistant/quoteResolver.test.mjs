import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuoteChains } from "../../dist/assistant/index.js";
import { groupMessage, quoteOf } from "./helpers.mjs";

const base = Date.parse("2026-09-28T01:00:00Z");

test("resolves Lấy 1 -> 500 MOBIS -> Má phanh trước Avante", () => {
    const product = groupMessage({ msgId: "1", text: "Má phanh trước Avante", ts: base });
    const price = groupMessage({ msgId: "2", text: "500 MOBIS", ts: base + 1, quote: quoteOf(product) });
    const confirmed = groupMessage({ msgId: "3", text: "Lấy 1", ts: base + 2, quote: quoteOf(price) });

    const [resolved] = resolveQuoteChains([confirmed], [confirmed, price, product]);
    assert.deepEqual(resolved.quote_chain, ["500 MOBIS", "Má phanh trước Avante"]);
    assert.deepEqual(resolved.quote_message_ids, ["2", "1"]);
    assert.equal(resolved.quote_incomplete, false);
});

test("resolves one level and five levels", () => {
    const one = groupMessage({ msgId: "10", text: "Sản phẩm A", ts: base });
    const reply = groupMessage({ msgId: "11", text: "Chốt", ts: base + 1, quote: quoteOf(one) });
    assert.deepEqual(resolveQuoteChains([reply], [reply, one])[0].quote_chain, ["Sản phẩm A"]);

    const chain = [groupMessage({ msgId: "20", text: "Tầng 1", ts: base })];
    for (let index = 2; index <= 6; index++) {
        chain.push(groupMessage({
            msgId: String(19 + index),
            text: `Tầng ${index}`,
            ts: base + index,
            quote: quoteOf(chain.at(-1)),
        }));
    }
    assert.deepEqual(resolveQuoteChains([chain.at(-1)], chain)[0].quote_chain, ["Tầng 5", "Tầng 4", "Tầng 3", "Tầng 2", "Tầng 1"]);
});

test("uses quote snapshot and marks a missing original", () => {
    const message = groupMessage({
        msgId: "31",
        text: "Lấy 1",
        ts: base,
        quote: { ownerId: "u", cliMsgId: 30, globalMsgId: 30, cliMsgType: 1, ts: base - 1, msg: "500 MOBIS", attach: "", fromD: "u", ttl: 0 },
    });
    const resolved = resolveQuoteChains([message], [message])[0];
    assert.deepEqual(resolved.quote_chain, ["500 MOBIS"]);
    assert.equal(resolved.quote_incomplete, true);
});

test("handles no quote and stops cycles", () => {
    const plain = groupMessage({ msgId: "40", text: "Không quote", ts: base });
    assert.deepEqual(resolveQuoteChains([plain], [plain])[0].quote_chain, []);

    const cyclic = groupMessage({ msgId: "41", text: "Cycle", ts: base, quote: { ownerId: "u", cliMsgId: 41, globalMsgId: 41, cliMsgType: 1, ts: base, msg: "Cycle", attach: "", fromD: "u", ttl: 0 } });
    assert.equal(resolveQuoteChains([cyclic], [cyclic])[0].quote_incomplete, true);
});

test("keeps interleaved products in separate chains", () => {
    const a = groupMessage({ msgId: "50", text: "Sản phẩm A", ts: base });
    const b = groupMessage({ msgId: "51", text: "Sản phẩm B", ts: base + 1 });
    const takeA = groupMessage({ msgId: "52", text: "Lấy 1", ts: base + 2, quote: quoteOf(a) });
    const takeB = groupMessage({ msgId: "53", text: "Lấy 2", ts: base + 3, quote: quoteOf(b) });
    const resolved = resolveQuoteChains([takeA, takeB], [a, b, takeA, takeB]);
    assert.deepEqual(resolved.map((item) => item.quote_chain), [["Sản phẩm A"], ["Sản phẩm B"]]);
});
