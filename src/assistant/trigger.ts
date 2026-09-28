import type { AssistantIntent, TriggerMessage } from "./types.js";

export function detectIntent(question: string): AssistantIntent | null {
    const text = question.toLocaleLowerCase("vi-VN");
    if (/(chưa\s+(?:báo\s+)?giá|chưa có giá|còn hàng nào hỏi)/u.test(text)) return "UNQUOTED_ITEMS";
    if (/(đã\s+(?:chốt|lấy|đặt)|chốt\s+lấy|lấy những|đặt những)/u.test(text)) return "CONFIRMED_ITEMS";
    return null;
}

export function shouldHandleTrigger(
    message: TriggerMessage,
    internalUsers: ReadonlySet<string>,
    assistantUserId?: string,
    aliases: readonly string[] = ["@trợ lý", "trợ lý"],
) {
    if (!internalUsers.has(message.senderId)) return false;
    const mentionedById = assistantUserId
        ? (message.mentions ?? []).some((mention) => mention.uid === assistantUserId)
        : false;
    const text = message.text.toLocaleLowerCase("vi-VN");
    return mentionedById || aliases.some((alias) => text.includes(alias.toLocaleLowerCase("vi-VN")));
}
