import { structuredOutputSchema } from "./contract.js";
import type { AssistantQuestion } from "./types.js";

export const ANALYZER_INSTRUCTIONS = `Bạn phân tích lịch sử của đúng một nhóm Zalo ở chế độ read-only.
Chỉ xử lý một trong hai intent:
- UNQUOTED_ITEMS: yêu cầu hỏi hàng không có phản hồi báo giá tương ứng.
- CONFIRMED_ITEMS: biểu hiện chốt/lấy/đặt; lần ngược quote_chain để tìm sản phẩm, giá, nguồn/brand và số lượng.

quote_chain được xếp từ quote trực tiếp đến quote cũ hơn. Không tự bịa trường thiếu. Dùng null khi không xác định.
Mọi kết luận phải dẫn source_message_ids có trong input. Nếu quote_incomplete=true, hạ confidence khi phần thiếu ảnh hưởng kết luận.
Chỉ trả JSON đúng schema, không trả prose và không đề nghị hành động ghi dữ liệu.`;

export function buildAnalyzerRequest(input: AssistantQuestion) {
    return {
        instructions: ANALYZER_INSTRUCTIONS,
        input,
        schema: structuredOutputSchema(),
    } as const;
}
