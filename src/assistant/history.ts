import type { GroupHistoryBridge, HistoryPage, TimeRange } from "./types.js";

export type LoadHistoryOptions = {
    maxMessages?: number;
};

function normalizedGroupId(groupId: string) {
    return groupId.startsWith("g") ? groupId.slice(1) : groupId;
}

export async function loadGroupHistory(
    bridge: GroupHistoryBridge,
    groupId: string,
    range: TimeRange,
    options: LoadHistoryOptions = {},
): Promise<HistoryPage> {
    const maxMessages = options.maxMessages ?? 1000;
    const response = await bridge.getGroupChatHistory(groupId, maxMessages);
    const expectedGroupId = normalizedGroupId(groupId);
    const allMessages = response.groupMsgs.filter((message) => normalizedGroupId(message.threadId) === expectedGroupId);
    const inRange = allMessages.filter((message) => {
        const timestamp = Number(message.data.ts);
        return Number.isFinite(timestamp) && timestamp >= range.start.getTime() && timestamp <= range.end.getTime();
    });
    const oldestFetchedTimestamp = Math.min(...allMessages.map((message) => Number(message.data.ts)));
    const truncated = Boolean(response.hasMore)
        && allMessages.length >= maxMessages
        && (!Number.isFinite(oldestFetchedTimestamp) || oldestFetchedTimestamp > range.start.getTime());

    return {
        messages: inRange,
        fetchedMessages: allMessages,
        truncated,
    };
}
