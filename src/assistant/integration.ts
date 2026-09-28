import { randomUUID } from "node:crypto";
import { ThreadType, type Message } from "../models/index.js";
import type { ReadonlyGroupAssistant } from "./assistant.js";
import type { AssistantIntent } from "./types.js";

export interface AssistantZaloApi {
    listener: {
        on(event: "message", handler: (message: Message) => void): unknown;
    };
    sendMessage(message: string, threadId: string, type: ThreadType): Promise<unknown>;
}

export type TechnicalLog = {
    requestId: string;
    groupId: string;
    caller: string;
    startedAt: string;
    latencyMs: number;
    status: "ignored" | "replied" | "error";
    messageCount?: number;
    timeRange?: { start: string; end: string; label: string };
    analysis?: { intent: AssistantIntent; eventCount: number; uncertainCount: number; truncated: boolean };
    error?: string;
};

export function attachReadonlyAssistant(
    api: AssistantZaloApi,
    assistant: ReadonlyGroupAssistant,
    log: (metadata: TechnicalLog) => void = () => {},
) {
    api.listener.on("message", (message) => {
        if (message.type !== ThreadType.Group || message.isSelf || typeof message.data.content !== "string") return;
        const requestId = randomUUID();
        const startedAt = new Date();

        void assistant.handle({
            groupId: message.threadId,
            senderId: String(message.data.uidFrom),
            text: message.data.content,
            mentions: message.data.mentions,
        }).then(async (response) => {
            if (!response) {
                log({
                    requestId,
                    groupId: message.threadId,
                    caller: String(message.data.uidFrom),
                    startedAt: startedAt.toISOString(),
                    latencyMs: Date.now() - startedAt.getTime(),
                    status: "ignored",
                });
                return;
            }

            await api.sendMessage(response.reply, message.threadId, ThreadType.Group);
            log({
                requestId,
                groupId: message.threadId,
                caller: String(message.data.uidFrom),
                startedAt: startedAt.toISOString(),
                latencyMs: Date.now() - startedAt.getTime(),
                status: "replied",
                messageCount: response.metadata.messageCount,
                timeRange: response.metadata.timeRange,
                analysis: {
                    intent: response.result.intent,
                    eventCount: response.result.events.length,
                    uncertainCount: response.result.uncertain_count,
                    truncated: response.metadata.truncated,
                },
            });
        }).catch((error: unknown) => {
            log({
                requestId,
                groupId: message.threadId,
                caller: String(message.data.uidFrom),
                startedAt: startedAt.toISOString(),
                latencyMs: Date.now() - startedAt.getTime(),
                status: "error",
                error: error instanceof Error ? error.name : "UnknownError",
            });
        });
    });
}
