# Audit Bridge và phương án trợ lý read-only giai đoạn 1

Ngày audit: 28/09/2026. Branch triển khai: `BRANCH1/zalo-readonly-assistant-phase1`.

## Kết quả audit

### Payload realtime và lịch sử

| Dữ liệu cần dùng | Trường thực tế |
|---|---|
| Group ID | `GroupMessage.threadId`, lấy từ `data.idTo` |
| Sender ID | `data.uidFrom` |
| Message ID chính | `data.msgId` |
| ID bổ sung | `data.cliMsgId`, `data.realMsgId`, `data.actionId` |
| Timestamp | `data.ts` (milliseconds, dạng string trong model) |
| Nội dung text | `data.content` khi là string |
| Mentions | `data.mentions[]` với `uid`, `pos`, `len`, `type` |
| Quote ID | `data.quote.globalMsgId`; fallback kỹ thuật là `quote.cliMsgId` |
| Nội dung quote snapshot | `data.quote.msg` |
| Người gửi quote | `data.quote.ownerId`, tên hiển thị ở `fromD` |
| Thời gian quote | `data.quote.ts` |

Một payload chỉ mang snapshot của quote trực tiếp. Chuỗi quote nhiều tầng phải nối bằng cách tìm message được quote trong lịch sử rồi đọc tiếp trường `quote` của message đó. Không thể suy ra tầng sâu hơn nếu message gốc không còn trong phần lịch sử đã tải.

### API lịch sử và pagination

Implementation cũ gọi `/api/group/history`; endpoint này hiện trả 404 theo các issue upstream. Bản sửa dùng:

- service: `group_cloud_message`;
- endpoint: `/api/cm/getrecentv2`;
- cursor: `lastMsgId` truyền lại qua `globalMsgId`;
- page size tối đa: 50;
- dừng khi `hasMore=false`, cursor không tiến, page không thêm message, hoặc đủ `count`;
- dedupe theo `msgId`.

Nguồn đối chiếu: upstream issue #367 và PR #370. PR #370 báo đã kiểm tra live với 120 message duy nhất, nhưng lần audit này chưa chạy live trên tài khoản của dự án vì workspace không có credentials.

## Phương án triển khai đã rút gọn

1. Không thêm database, RAG, vector search hoặc mirror Zalo.
2. Không tích hợp PTAP/Google Sheet và không có code ghi nghiệp vụ.
3. Một pipeline thuần: whitelist + mention → time range → history của đúng group → quote chain → AI structured output → validate source IDs → format reply.
4. AI nằm sau interface `StructuredAnalyzer`; provider/key/model là cấu hình triển khai, không khóa core vào một hãng.
5. Quote resolver tối đa 10 tầng, phát hiện cycle, giữ snapshot khi thiếu message gốc và đánh dấu `quote_incomplete`.
6. History có hard limit mặc định 1.000 message và trả cờ `truncated`; không được coi kết quả thiếu lịch sử là đầy đủ.
7. Log integration chỉ chứa metadata kỹ thuật và tóm tắt AI (`intent`, số event, số trường hợp không chắc chắn); không log câu hỏi, lịch sử, chi tiết event hoặc nội dung trả lời.

## Giới hạn cần biết trước staging

- API Zalo là không chính thức và có thể thay đổi hoặc khiến tài khoản bị giới hạn.
- Muốn resolve quote ngoài range, message gốc vẫn phải nằm trong hard limit lịch sử tải được. Nếu không, chỉ snapshot quote trực tiếp còn dùng được.
- `dName` của history có báo cáo upstream đôi khi là `null`; logic dùng sender ID làm định danh, không dựa display name.
- Chưa thể smoke test live nếu chưa có credentials Zalo và một `StructuredAnalyzer` staging. Unit/integration offline không cần secret.
- Một tài khoản chỉ nên có một listener web đang chạy.

## Cổng staging

Trước khi bật ở nhóm thử:

1. Cấp credentials theo cơ chế ngoài Git và xác nhận tài khoản test.
2. Cấu hình `INTERNAL_USERS`, assistant Zalo UID/alias và hard limit.
3. Cắm adapter AI có JSON schema; không cho phép tool/function ghi dữ liệu.
4. Gọi history trên một group test và xác minh payload/quote ID thực tế.
5. Chạy các fixture quote rồi mới cho phép gửi reply vào group test.
6. Không deploy Production trong giai đoạn này.
