import type { GroupMessage } from "../models/index.js";

export type AssistantIntent = "UNQUOTED_ITEMS" | "CONFIRMED_ITEMS";
export type Confidence = "low" | "medium" | "high";

export type TimeRange = {
    start: Date;
    end: Date;
    label: string;
};

export type HistoryPage = {
    messages: GroupMessage[];
    fetchedMessages: GroupMessage[];
    truncated: boolean;
};

export interface GroupHistoryBridge {
    getGroupChatHistory(groupId: string, count?: number): Promise<{ groupMsgs: GroupMessage[]; hasMore?: boolean }>;
}

export type SemanticMessage = {
    message_id: string;
    sender: string;
    timestamp: string;
    text: string;
    quote_chain: string[];
    quote_message_ids: string[];
    quote_incomplete: boolean;
};

export type AssistantQuestion = {
    intent: AssistantIntent;
    question: string;
    messages: SemanticMessage[];
};

export type AssistantEvent = {
    type: "PURCHASE_CONFIRMED" | "QUOTE_REQUESTED" | "PRICE_QUOTED" | "UNQUOTED_ITEM";
    product: string | null;
    quantity: number | null;
    price: number | null;
    source_or_brand: string | null;
    confidence: Confidence;
    source_message_ids: string[];
};

export type AnalysisResult = {
    intent: AssistantIntent;
    events: AssistantEvent[];
    uncertain_count: number;
};

export interface StructuredAnalyzer {
    analyze(input: AssistantQuestion): Promise<unknown>;
}

export type TriggerMessage = {
    groupId: string;
    senderId: string;
    text: string;
    mentions?: Array<{ uid: string }>;
};
