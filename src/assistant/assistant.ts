import { parseAnalysisResult } from "./contract.js";
import { formatZaloReply } from "./formatter.js";
import { loadGroupHistory } from "./history.js";
import { resolveQuoteChains } from "./quoteResolver.js";
import { resolveTimeRange } from "./timeRange.js";
import { detectIntent, shouldHandleTrigger } from "./trigger.js";
import type { AnalysisResult, GroupHistoryBridge, StructuredAnalyzer, TriggerMessage } from "./types.js";

export type ReadonlyAssistantOptions = {
    bridge: GroupHistoryBridge;
    analyzer: StructuredAnalyzer;
    internalUsers: ReadonlySet<string>;
    assistantUserId?: string;
    aliases?: readonly string[];
    maxHistoryMessages?: number;
    now?: () => Date;
};

export type AssistantResponse = {
    reply: string;
    result: AnalysisResult;
    metadata: {
        groupId: string;
        caller: string;
        timeRange: { start: string; end: string; label: string };
        messageCount: number;
        truncated: boolean;
    };
};

export class ReadonlyGroupAssistant {
    constructor(private readonly options: ReadonlyAssistantOptions) {}

    async handle(message: TriggerMessage): Promise<AssistantResponse | null> {
        if (!shouldHandleTrigger(message, this.options.internalUsers, this.options.assistantUserId, this.options.aliases)) {
            return null;
        }
        const intent = detectIntent(message.text);
        if (!intent) return null;

        const range = resolveTimeRange(message.text, this.options.now?.() ?? new Date());
        const history = await loadGroupHistory(this.options.bridge, message.groupId, range, {
            maxMessages: this.options.maxHistoryMessages,
        });
        const semanticMessages = resolveQuoteChains(history.messages, history.fetchedMessages);
        const metadata = {
            groupId: message.groupId,
            caller: message.senderId,
            timeRange: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
            messageCount: semanticMessages.length,
            truncated: history.truncated,
        };
        if (history.truncated) {
            return {
                reply: "⚠️ Không thể đọc đủ lịch sử trong khoảng yêu cầu. Hãy thu hẹp thời gian rồi thử lại.",
                result: { intent, events: [], uncertain_count: 1 },
                metadata,
            };
        }
        const allowedIds = new Set(semanticMessages.flatMap((item) => [item.message_id, ...item.quote_message_ids]));
        const rawResult = await this.options.analyzer.analyze({ intent, question: message.text, messages: semanticMessages });
        const result = parseAnalysisResult(rawResult, intent, allowedIds);

        return {
            reply: formatZaloReply(result, range.label),
            result,
            metadata,
        };
    }
}
