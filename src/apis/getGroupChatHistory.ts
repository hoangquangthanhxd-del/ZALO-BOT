import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { apiFactory } from "../utils.js";

import { GroupMessage, type TGroupMessage } from "../models/index.js";

export type GetGroupChatHistoryResponse = {
    lastActionId?: string;
    lastActionIdOther?: string;
    more?: number;
    lastMsgId?: number;
    hasMore?: boolean;
    groupMsgs: GroupMessage[];
};

export const getGroupChatHistoryFactory = apiFactory<GetGroupChatHistoryResponse>()((api, ctx, utils) => {
    const serviceURL = utils.makeURL(`${api.zpwServiceMap.group_cloud_message[0]}/api/cm/getrecentv2`);

    /**
     * Get group chat history
     *
     * @param groupId group id
     * @param count count of messages to return (default: 50)
     *
     * @throws {ZaloApiError}
     */
    return async function getGroupChatHistory(groupId: string, count: number = 50) {
        if (!Number.isInteger(count) || count < 1) throw new ZaloApiError("Count must be a positive integer");

        const normalizedGroupId = groupId.startsWith("g") ? groupId.slice(1) : groupId;
        const messages = new Map<string, TGroupMessage>();
        let cursor = 0;
        let lastPage: GetGroupChatHistoryResponse | undefined;

        while (messages.size < count) {
            const params = {
                groupId: normalizedGroupId,
                globalMsgId: cursor,
                count: Math.min(50, count - messages.size),
                msgIds: [],
                imei: ctx.imei,
                src: 3,
            };
            const encryptedParams = utils.encodeAES(JSON.stringify(params));
            if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

            const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams, nretry: 0 }), {
                method: "GET",
            });

            lastPage = await utils.resolve(response, (result) => {
                const raw = result.data as unknown as GetGroupChatHistoryResponse | string;
                return typeof raw === "string" ? (JSON.parse(raw) as GetGroupChatHistoryResponse) : raw;
            });

            if (!Array.isArray(lastPage.groupMsgs)) break;
            const previousSize = messages.size;
            for (const rawMessage of lastPage.groupMsgs as unknown as TGroupMessage[]) {
                if (messages.size >= count) break;
                messages.set(String(rawMessage.msgId), rawMessage);
            }

            const nextCursor = Number(lastPage.lastMsgId);
            if (messages.size === previousSize || !lastPage.hasMore || !nextCursor || nextCursor === cursor) break;
            cursor = nextCursor;
        }

        return {
            ...lastPage,
            groupMsgs: [...messages.values()].map((message) => new GroupMessage(ctx.uid, message)),
        } as GetGroupChatHistoryResponse;
    };
});
