# Backlog triển khai ZALO-BOT

> Ghi chú ngày 01/10/2026: Đây là bản kế hoạch lịch sử lập ngày 08/09/2026. Các trạng thái và mô tả hiện trạng bên dưới phản ánh thời điểm lập, không phải tiến độ hiện tại. Phần tích hợp Zalo đã có implementation trong PTAP-NEXT; cần đối chiếu code, test và log hiện hành của PTAP-NEXT trước khi triển khai task tiếp theo. Chưa tự đánh dấu các task dưới đây hoàn tất.

Ngày lập: 08/09/2026. Tất cả task dưới đây ở trạng thái **PLANNED**, chưa khởi chạy. Phạm vi chuẩn: [PROJECT_PLAN.md](PROJECT_PLAN.md).

## Quy tắc sử dụng

- Làm theo phụ thuộc, đóng từng task bằng bằng chứng nghiệm thu.
- Mỗi task ghi: quyết định đầu vào, commit nền, file thay đổi, lệnh/test đã chạy, kết quả thật, điểm chưa hoàn thành và cách rollback nếu có.
- Tách thay đổi PTAP-NEXT khỏi ZALO-BOT; không sửa đè thay đổi đang chạy ở task khác.
- Task gặp thiếu quyết định chỉ dừng phần phụ thuộc; không tự đặt quy tắc khách/giá/quyền.
- Không triển khai production, đăng nhập hoặc bật gửi tin chỉ vì task được ghi trong tài liệu này.

## ZB-001 — Chốt nghiệp vụ và quyền sử dụng

**Phụ thuộc:** Không. **Repo:** Tài liệu ZALO-BOT, tham chiếu PTAP-NEXT/TOCKY read-only.

**Công việc:** Chốt D01–D11; chọn một nhóm thử; xác định ai hỏi hàng, ai đề nghị đơn, ai duyệt; phân biệt giá do nhân viên đọc với giá khách đề nghị. Kiểm tra mặc định resolver TOCKY và trạng thái lưu đơn.

**Đầu ra:** Đặc tả được chốt, ma trận quyền/trường dữ liệu, kịch bản hội thoại và bộ câu UAT.

**Nghiệm thu:** Không còn câu hỏi mở ảnh hưởng quyền/giá/khách của bản đầu; mọi phạm vi hoãn được ghi rõ.

## ZB-002 — Thiết kế contract và lưu trạng thái

**Phụ thuộc:** ZB-001. **Repo:** ZALO-BOT và tài liệu PTAP-NEXT nếu cần.

**Công việc:** Đối chiếu operation PTAP hiện có; chốt đóng gói shared Product Search/validation; thiết kế adapter, mapping, inbox/outbox, draft version, idempotency và cơ chế mở nháp trên máy người duyệt. Chốt phần quyền nào nằm ở backend; thiết kế Auth bot và kho bảo mật phiên trên Windows.

**Đầu ra:** Contract request/response/error, sơ đồ trạng thái, mô hình lưu trữ, danh sách endpoint/migration cần thêm và danh sách module tái sử dụng.

**Nghiệm thu:** Có thiết kế xử lý timeout sau ghi, hai khách cùng nhóm, xác nhận sai người, mở nháp xuyên thiết bị; không có quyền chỉ dựa vào tên hiển thị hoặc client payload.

## ZB-003 — Nền tảng repo và runtime

**Phụ thuộc:** ZB-002. **Repo:** ZALO-BOT.

**Công việc:** Tách thư mục ứng dụng khỏi SDK upstream; scripts build/start/test phù hợp Windows; pin dependency/lockfile; xử lý audit đã ghi nhận; config validation và secret ignore; một tiến trình runtime; health và shutdown cơ bản.

**Đầu ra:** Skeleton chạy được, cấu hình mẫu không secret, hướng dẫn cài và kiểm thử nền.

**Nghiệm thu:** Cài mới/build thành công; cấu hình thiếu báo lỗi rõ; không chạy trùng listener; không có secret trong tracked files.

## ZB-004 — Đăng nhập và phiên Zalo

**Phụ thuộc:** ZB-003. **Repo:** ZALO-BOT.

**Công việc:** QR lifecycle, lưu/khôi phục phiên, logout, trạng thái listener, tải danh sách nhóm; adapter nhận/gửi có thể thay bằng fake trong test. Người dùng tự quét QR ở bước kiểm thử thực tế.

**Đầu ra:** Kết nối một tài khoản, danh sách nhóm và trạng thái lỗi/phiên.

**Nghiệm thu:** QR mới/hết hạn/từ chối; restart khôi phục phiên; phiên bị thay thế dừng đúng; chưa tự bật nhóm hoặc gửi tin khi chưa cấu hình.

## ZB-005 — Kết nối PTAP và giới hạn quyền

**Phụ thuộc:** ZB-002, ZB-003. **Repo:** ZALO-BOT; PTAP-NEXT nếu thiếu contract.

**Công việc:** Auth, refresh/logout, access context; adapter qua ptapApi/contracts; customer/group binding có xác minh; policy dữ liệu công bố; thêm facade/backend checks khi thiết kế yêu cầu. Chốt triển khai shared Product Search đúng spec, có version compatibility.

**Đầu ra:** PTAP client được xác thực, mapping đã kiểm tra, contract test và migration nếu cần.

**Nghiệm thu:** Token hết hạn/thu hồi xử lý đúng; sai scope bị từ chối ở backend; đổi môi trường không tái dùng cache/identity cũ; không dựa service-role để bỏ qua quyền.

## ZB-006 — Trả lời tra cứu trong nhóm

**Phụ thuộc:** ZB-004, ZB-005.

**Công việc:** Điều kiện kích hoạt; loại tin self/trùng/cũ; nhận diện ý định; truy vấn chuẩn; lọc trường trước AI/output; hỏi lại khi mơ hồ; chọn phiên bản theo đúng người/lần hỏi; giới hạn độ dài và tốc độ gửi.

**Đầu ra:** Luồng text → dữ liệu PTAP → câu trả lời trong nhóm thử.

**Nghiệm thu:** Fixture exact mã/alias, tên, xe/đời, nhiều phiên bản, không kết quả, báo hết; không lộ giá nhập/ghi chú riêng; prompt injection không mở thêm dữ liệu; nhóm chưa bật không nhận trả lời.

## ZB-007 — Tạo bản nháp theo TOCKY

**Phụ thuộc:** ZB-005, ZB-006.

**Công việc:** Dùng Edge draft hiện có; identity ổn định; lưu actionId và nguồn Zalo; trình bày dòng hàng/giá/thành tiền/điểm chưa khớp; phân biệt giá đề nghị và giá đã duyệt theo ZB-001.

**Đầu ra:** Bản nháp có thể xem lại và đối chiếu với TOCKY; chưa lưu đơn thật ở task này.

**Nghiệm thu:** Câu GARA Minh Hồ Xá và fixture chuẩn đạt; SERVICE fallback giữ đủ dòng; thiếu số lượng/tiền lệch không bị che; retry không nhân đôi audit draft; khách trong câu không ghi đè mapping đáng tin cậy.

## ZB-008 — Kiểm tra, chỉnh sửa và xác nhận nháp

**Phụ thuộc:** ZB-007.

**Công việc:** Mở draft trên giao diện được chốt; chỉnh sửa bằng form PTAP khi cần; ràng buộc actor, nhóm, khách, draft version, thời hạn; hủy nháp; sửa làm mất hiệu lực xác nhận cũ. Liên kết mở nháp phải xác thực quyền, không chứa credential.

**Đầu ra:** Bản nháp đã duyệt và bằng chứng xác nhận có thể kiểm tra lại.

**Nghiệm thu:** Người khác/nhóm khác không duyệt được; link không tự lưu đơn; sửa sau xem trước, xác nhận quá hạn và thu hồi quyền bị chặn; người duyệt nhìn đầy đủ phần cần quyết định.

## ZB-009 — Lưu đơn thật và đối soát kết quả

**Phụ thuộc:** ZB-008.

**Công việc:** Builder/validation chuẩn; command transaction/audit; kiểm tra lại dữ liệu ảnh hưởng đơn; lưu identity trước gọi; liên kết nguồn tin–actionId–orderId; outbox gửi mã đơn; replay khi trạng thái ghi chưa rõ.

**Đầu ra:** Một đơn hợp lệ hiển thị trên PTAP và phản hồi đúng mã đơn trong nhóm thử.

**Nghiệm thu:** Nhấn xác nhận hai lần, đồng thời, timeout sau commit, restart và lỗi gửi tin chỉ tạo một đơn; server từ chối thì không báo thành công; không tự sửa/xóa đơn đã lưu để xử lý retry.

## ZB-010 — Hoàn thiện quản trị vận hành

**Phụ thuộc:** ZB-004, ZB-005; tích hợp ZB-006–009.

**Công việc:** Hoàn thiện các màn hình thiết lập đã xây cùng task kết nối: môi trường, QR, PTAP login, nhóm, mapping, quyền, bật tra cứu/tạo nháp/lưu, pause/resume, trạng thái xử lý và chuyển nhân viên.

**Đầu ra:** Người vận hành thực hiện các bước thường ngày bằng UI, không cần sửa JSON/source.

**Nghiệm thu:** Không expose secret; chỉ quản trị viên thao tác; cấu hình sai không bật bot; pause có hiệu lực với hành động mới; kiểm tra layout viewport sử dụng thực tế.

## ZB-011 — Độ bền, khôi phục và theo dõi chi phí

**Phụ thuộc:** ZB-006, ZB-009, ZB-010.

**Công việc:** Hàng đợi bền vững, retry/backoff, đối soát inbox/outbox sau restart, log đã lọc, giới hạn người/nhóm, TTL/dọn state, chi phí và độ trễ, backup cấu hình, start/stop Windows.

**Đầu ra:** Runbook sự cố, bảng trạng thái hoạt động và báo cáo đo tải thử.

**Nghiệm thu:** Ngắt mạng, lỗi provider 429, restart đang lưu/gửi, disk write failure, tắt/ngủ máy và phiên Zalo hết hiệu lực có kết quả rõ; không flood lại tin cũ; không mất command identity.

## ZB-012 — Kiểm thử tổng hợp và UAT staging

**Phụ thuộc:** ZB-001–011 đã đạt nghiệm thu tương ứng.

**Công việc:** Contract/unit/integration tests; kiểm tra quyền nhiều khách; fault injection ghi/gửi; regression PTAP bị ảnh hưởng; UAT một nhóm thử với người dùng; đối chiếu đơn trên PC/mobile và audit; đo latency/AI cost.

**Đầu ra:** Báo cáo test thật, danh sách lỗi đã sửa hoặc giới hạn được chấp nhận, checklist bàn giao.

**Nghiệm thu:** Không còn lỗi sai khách/sai giá/lộ dữ liệu/đơn trùng; luồng end-to-end có bằng chứng; test mock, live provider và nhóm Zalo thật được báo riêng.

## ZB-013 — Rollout và bàn giao vận hành

**Phụ thuộc:** ZB-012; môi trường/nhóm thật và chính sách vận hành được chốt.

**Công việc:** Chuẩn bị phiên bản phát hành, xác minh catalog/khách/quyền ở môi trường đích, backup và rollback; kích hoạt lần lượt nhóm/chức năng đã được cho phép; bàn giao xử lý sự cố và nâng upstream.

**Đầu ra:** Bot chạy ở môi trường đã chọn, tài liệu vận hành, phiên bản rollback và danh sách nhóm bật.

**Nghiệm thu:** Người dùng tự đăng nhập/bật-tắt/phục hồi được; quan sát pilot theo thời lượng đã chốt; rollback không mất liên kết đơn; báo rõ máy phải chạy để trực bot.

## Backlog sau phát hành

Các mục chưa cam kết triển khai: tra trạng thái đơn của khách; gửi ảnh; voice/OCR; gom nhiều tin thành giỏ; công nợ/thanh toán/hàng trả; nhiều tài khoản hoặc máy chủ 24/7. Mỗi mục có task thiết kế quyền và nghiệm thu riêng, không tự đưa vào các task trên.
