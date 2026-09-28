import type { AnalysisResult, AssistantEvent, AssistantIntent, Confidence } from "./types.js";

const eventTypes = new Set(["PURCHASE_CONFIRMED", "QUOTE_REQUESTED", "PRICE_QUOTED", "UNQUOTED_ITEM"]);
const confidences = new Set<Confidence>(["low", "medium", "high"]);

function nullableString(value: unknown) {
    return value === null || typeof value === "string";
}

function nullableNumber(value: unknown) {
    return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function parseEvent(value: unknown, allowedIds: ReadonlySet<string>): AssistantEvent {
    if (!value || typeof value !== "object") throw new TypeError("AI event must be an object");
    const event = value as Record<string, unknown>;
    if (!eventTypes.has(String(event.type))) throw new TypeError("AI event type is invalid");
    if (!nullableString(event.product) || !nullableNumber(event.quantity) || !nullableNumber(event.price)) {
        throw new TypeError("AI event fields are invalid");
    }
    if (!nullableString(event.source_or_brand) || !confidences.has(event.confidence as Confidence)) {
        throw new TypeError("AI event metadata is invalid");
    }
    if (!Array.isArray(event.source_message_ids) || event.source_message_ids.length === 0) {
        throw new TypeError("Every AI event needs source_message_ids");
    }
    const sourceIds = event.source_message_ids.map(String);
    if (sourceIds.some((id) => !allowedIds.has(id))) throw new TypeError("AI returned an unknown source_message_id");
    return { ...event, source_message_ids: sourceIds } as AssistantEvent;
}

export function parseAnalysisResult(
    value: unknown,
    intent: AssistantIntent,
    allowedSourceIds: ReadonlySet<string>,
): AnalysisResult {
    if (!value || typeof value !== "object") throw new TypeError("AI result must be an object");
    const result = value as Record<string, unknown>;
    if (result.intent !== intent || !Array.isArray(result.events)) throw new TypeError("AI result has an invalid intent/events");
    const events = result.events.map((event) => parseEvent(event, allowedSourceIds));
    const uncertainCount = events.filter((event) => event.confidence !== "high" || !event.product).length;
    return { intent, events, uncertain_count: uncertainCount };
}

export function structuredOutputSchema() {
    return {
        type: "object",
        additionalProperties: false,
        required: ["intent", "events"],
        properties: {
            intent: { enum: ["UNQUOTED_ITEMS", "CONFIRMED_ITEMS"] },
            events: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "product", "quantity", "price", "source_or_brand", "confidence", "source_message_ids"],
                    properties: {
                        type: { enum: [...eventTypes] },
                        product: { type: ["string", "null"] },
                        quantity: { type: ["number", "null"] },
                        price: { type: ["number", "null"] },
                        source_or_brand: { type: ["string", "null"] },
                        confidence: { enum: [...confidences] },
                        source_message_ids: { type: "array", minItems: 1, items: { type: "string" } },
                    },
                },
            },
        },
    } as const;
}
