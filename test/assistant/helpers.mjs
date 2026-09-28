import { GroupMessage } from "../../dist/models/index.js";

export function groupMessage({
    msgId,
    text,
    ts,
    groupId = "group-1",
    senderId = "user-1",
    quote,
}) {
    return new GroupMessage("bot-1", {
        actionId: msgId,
        msgId,
        cliMsgId: `cli-${msgId}`,
        realMsgId: msgId,
        msgType: "chat.text",
        uidFrom: senderId,
        idTo: groupId,
        dName: senderId,
        ts: String(ts),
        status: 1,
        content: text,
        notify: "",
        ttl: 0,
        userId: senderId,
        uin: senderId,
        topOut: "0",
        topOutTimeOut: "0",
        topOutImprTimeOut: "0",
        propertyExt: undefined,
        paramsExt: { countUnread: 0, containType: 0, platformType: 1 },
        cmd: 0,
        st: 0,
        at: 0,
        quote,
        mentions: undefined,
    });
}

export function quoteOf(message) {
    return {
        ownerId: message.data.uidFrom,
        cliMsgId: Number(String(message.data.msgId).replace(/\D/g, "")) || 1,
        globalMsgId: message.data.msgId,
        cliMsgType: 1,
        ts: Number(message.data.ts),
        msg: typeof message.data.content === "string" ? message.data.content : "",
        attach: "",
        fromD: message.data.dName,
        ttl: 0,
    };
}
