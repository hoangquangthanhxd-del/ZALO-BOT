import type { AnalysisResult } from "./types.js";

export function formatZaloReply(result: AnalysisResult, rangeLabel: string): string {
    const relevant = result.events.filter((event) =>
        result.intent === "CONFIRMED_ITEMS" ? event.type === "PURCHASE_CONFIRMED" : event.type === "UNQUOTED_ITEM",
    );
    const title = result.intent === "CONFIRMED_ITEMS" ? `${rangeLabel} đã chốt:` : `${rangeLabel} chưa được báo giá:`;
    if (relevant.length === 0) return `${title}\nKhông tìm thấy trường hợp nào đủ dữ liệu.`;

    const lines = relevant.flatMap((event, index) => {
        const item = [`${index + 1}. ${event.product ?? "Chưa xác định sản phẩm"}`];
        if (event.quantity !== null) item.push(`   SL: ${event.quantity}`);
        if (event.price !== null) item.push(`   Giá: ${event.price}`);
        if (event.source_or_brand) item.push(`   ${event.source_or_brand}`);
        return [...item, ""];
    });
    if (result.uncertain_count > 0) {
        lines.push(`⚠️ Có ${result.uncertain_count} trường hợp chưa đủ dữ liệu hoặc AI chưa chắc chắn.`);
    }
    return [title, "", ...lines].join("\n").trim();
}
