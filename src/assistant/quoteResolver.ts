import type { GroupMessage, TGroupMessage } from "../models/index.js";
import type { SemanticMessage } from "./types.js";

function textOf(message: TGroupMessage): string | undefined {
    return typeof message.content === "string" ? message.content : undefined;
}

function messageKeys(message: TGroupMessage) {
    return [message.msgId, message.cliMsgId, message.realMsgId].filter(Boolean).map(String);
}

export function resolveQuoteChains(
    messagesInRange: GroupMessage[],
    allFetched: GroupMessage[] = messagesInRange,
    maxDepth = 10,
): SemanticMessage[] {
    const byId = new Map<string, TGroupMessage>();
    for (const wrapped of allFetched) {
        for (const key of messageKeys(wrapped.data)) byId.set(key, wrapped.data);
    }

    return messagesInRange.flatMap((wrapped) => {
        const root = wrapped.data;
        const rootText = textOf(root);
        if (!rootText) return [];

        const quoteChain: string[] = [];
        const quoteIds: string[] = [];
        const visited = new Set(messageKeys(root));
        let quote = root.quote;
        let incomplete = false;

        for (let depth = 0; quote && depth < maxDepth; depth++) {
            const quoteId = String(quote.globalMsgId || quote.cliMsgId || "");
            if (!quoteId || visited.has(quoteId)) {
                incomplete = true;
                break;
            }
            visited.add(quoteId);
            quoteIds.push(quoteId);

            const original = byId.get(quoteId);
            if (original) {
                const originalText = textOf(original);
                if (originalText) quoteChain.push(originalText);
                else incomplete = true;
                quote = original.quote;
                continue;
            }

            if (quote.msg) quoteChain.push(quote.msg);
            incomplete = true;
            break;
        }

        if (quote) incomplete = true;
        return [{
            message_id: String(root.msgId),
            sender: String(root.uidFrom),
            timestamp: new Date(Number(root.ts)).toISOString(),
            text: rootText,
            quote_chain: quoteChain,
            quote_message_ids: quoteIds,
            quote_incomplete: incomplete,
        }];
    });
}
