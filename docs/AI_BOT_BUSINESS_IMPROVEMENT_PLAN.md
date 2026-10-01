# Kế hoạch cải thiện nghiệp vụ AI bot Zalo

Ngày: 01/10/2026. Trạng thái: **KẾ HOẠCH — CHƯA TRIỂN KHAI CODE**.

Phạm vi khảo sát: ZALO-BOT tại `d3155b4`, PTAP-NEXT tại `0b37af37`, cùng code và tài liệu hiện hành đã đọc. Không kiểm tra trạng thái remote mới, không gọi AI/Zalo thật, không gửi ảnh/tin hoặc ghi dữ liệu nghiệp vụ trong lần lập kế hoạch này. Các báo cáo test trước đây là bằng chứng lịch sử, không phải test mới của kế hoạch.

## 1. Yêu cầu đã được người dùng xác nhận

1. Khách được tag đúng tài khoản bot trong nhóm đã liên kết khách hàng để sử dụng các nghiệp vụ trong kế hoạch này.
2. Báo giá/đơn nháp trong hội thoại tiếp tục gửi **text như hiện tại**.
3. Đơn đã tạo trong dữ liệu đơn hàng PTAP gửi **ảnh A5**. Yêu cầu gửi đơn không chỉ định điều kiện riêng mặc định chọn đơn gần nhất của khách trong nhóm.
4. Khi có điều kiện riêng, bot phải hiểu và tìm đúng đơn; không bỏ điều kiện để gửi đơn gần nhất.
5. Khách yêu cầu ảnh sản phẩm thì gửi ảnh của sản phẩm phù hợp trong PTAP.
6. Trả lời đúng hai nghiệp vụ: nhắc lại hàng khách đã hỏi; xác định hàng khách đã hỏi nhưng chưa được báo giá.
7. Ưu tiên độ chính xác; dùng AI API để hiểu ngữ nghĩa và quan hệ hội thoại khi cần. Không biến các câu ví dụ thành danh sách câu bắt buộc khách phải nói.

Cho phép khách gọi các nghiệp vụ này chưa phải cấp quyền tạo/sửa/hủy đơn, thay giá, thay khách hoặc chuyển đơn sang nhóm khác. Gate tạo đơn hiện hành cần được bảo toàn khi thay cơ chế tiếp nhận khách.

## 2. Hiện trạng và các khoảng trống đã xác định

| Thành phần | Đã có | Phần cần cải thiện |
| --- | --- | --- |
| Nhận yêu cầu | AI ROUTE hiểu ngữ cảnh, quote, nháp đang chờ | Admission hiện gắn với nhân viên; cần phạm vi khách gọi đã được xác nhận |
| Xem/gửi đơn | ORDER_READ có selector mã, gần nhất, nhiều đơn, đơn chứa sản phẩm; trả text | Chuyển phần gửi đơn đã lưu sang A5; thêm điều kiện thời gian, tham chiếu và bộ lọc kết hợp |
| Ảnh đơn | Renderer `A5_FULL_QR`, PrintData, queue, claim/START/ACK, version và mapping checks | Nối yêu cầu từ chat tới luồng này bằng entry point backend có quyền phù hợp |
| Gửi lại đơn | Delivery hiện dedupe theo order/version/mapping/snapshot | Phân biệt yêu cầu mới xin gửi lại với retry/redelivery của cùng tin gốc |
| Ảnh sản phẩm | PTAP có ảnh chính, ảnh theo phiên bản, thư viện ảnh; sender gửi được attachment | Projection assistant chưa đưa ra ảnh; cần đọc và gửi ảnh đã kiểm tra đúng sản phẩm/phiên bản |
| Thống kê hội thoại | AI trích event, validator nguồn, reducer theo thời gian, cờ incomplete | Hai câu hỏi cần projection riêng; không chỉ lọc theo trạng thái cuối |
| Dữ liệu báo giá | Structured text có parser; thống kê đang ẩn giá và có thể thay toàn bộ báo giá của bot bằng marker | Giữ bằng chứng từng dòng đã báo giá trong DTO được lọc, tránh mất quan hệ món–giá |

Một điểm quan trọng: command gửi A5 từ giao diện hiện yêu cầu JWT actor và quyền `tenant.data.write`. Không thể gọi nguyên command đó dưới danh tính khách Zalo bằng cách tự gán khách thành nhân viên. Cần facade/backend authorization dành riêng cho gửi ảnh theo yêu cầu chat, tái sử dụng phần enqueue/render/delivery bên trong.

## 3. Nguyên tắc xử lý chung

Luồng dự kiến:

`Tin có mention/phiên hỏi tiếp hợp lệ → backend xác định người gửi và nhóm/khách → AI hiểu yêu cầu và trích điều kiện → đọc dữ liệu chuẩn → xác minh kết quả → gửi text/ảnh hoặc hỏi lại → ghi trạng thái gửi`.

- AI xử lý ý định, đại từ, tên gọi tự nhiên, mốc thời gian và quan hệ giữa các tin. Backend quyết định quyền, khách, orderId, product/version, ảnh và dữ liệu chuẩn.
- AI trả kết quả có cấu trúc và nguồn. Runtime kiểm tra schema, reference, điều kiện tìm, khả năng đầy đủ của dữ liệu và mối liên hệ nguồn trước khi thực hiện.
- ID, URL ảnh, giá và nội dung PrintData không lấy từ dữ kiện model tự viết. Chọn entity qua reference do công cụ đọc cấp.
- Mơ hồ thật sự thì hỏi một câu phân biệt. Chưa tìm được kết quả thì nói chưa tìm được; không tự bỏ điều kiện hay lấy một kết quả khác.
- Có thể xử lý yêu cầu kết hợp như gửi ảnh sản phẩm và nhắc món chưa báo giá, nhưng từng thao tác phải có đối tượng và bằng chứng riêng.
- Hành động gửi text/ảnh cần bước dispatch có kiểm soát sau khi đọc/xác minh. Không thêm tùy tiện thao tác gửi vào registry công cụ chỉ đọc hiện hành.
- Dùng lại Supabase, PTAP contracts, Product Search, renderer và queue hiện có. Kế hoạch chưa có bằng chứng cần thêm vector database, service hoặc thuật toán tìm kiếm sản phẩm riêng.
- Quy tắc regex phù hợp để kiểm tra định dạng mã, số, dữ liệu kỹ thuật; nhận diện nghiệp vụ chủ yếu dùng ngữ nghĩa. Ví dụ test là các tình huống, không phải câu khẩu lệnh.

## 4. Nghiệp vụ gửi đơn và báo giá

### 4.1. Chọn loại nội dung

| Đối tượng được yêu cầu | Cách gửi |
| --- | --- |
| Báo giá/nháp chưa lưu, hoặc reply đúng báo giá để yêu cầu gửi lại | Text theo structured-text hiện hành |
| Đơn đã lưu trong PTAP | Ảnh A5 từ PrintData canonical |
| Chỉ nói gửi đơn, không có điều kiện riêng và không chỉ vào một báo giá | Đơn PTAP gần nhất của khách, ảnh A5 |
| Chỉ nói gửi lại cái đó, có nhiều đối tượng khả dĩ | Hỏi lại để chọn báo giá hoặc đơn cụ thể |
| Yêu cầu có thể đồng thời hiểu là gửi báo giá hoặc tạo đơn từ báo giá | Làm rõ; không ngầm tạo đơn |

Gửi một đơn đã lưu không tạo lại đơn. Việc bot nói trước đây rằng đã tạo đơn không thay được kết quả đọc từ PTAP xác nhận đơn thực sự tồn tại.

### 4.2. Selector và tìm đúng đơn

AI trích lựa chọn có cấu trúc: mã đơn chính xác, thời gian/khoảng ngày, thứ tự gần nhất/trước đó, sản phẩm/phiên bản, trạng thái và tham chiếu tin đang reply. Giữ đồng thời các điều kiện nếu người dùng nêu nhiều điều kiện.

- Mã hoặc entity được reply trực tiếp xác định đúng đơn đó trong phạm vi khách hiện hành; các điều kiện bổ sung vẫn được kiểm tra để phát hiện mâu thuẫn.
- Yêu cầu có điều kiện riêng lọc trước, sau đó mới áp dụng thứ tự/số lượng được yêu cầu.
- Chỉ dùng mặc định gần nhất khi thực sự không có điều kiện riêng.
- Tìm trên toàn bộ tập phù hợp qua backend/pagination; không kết luận từ một trang đầu khi còn dữ liệu.
- Điều kiện sản phẩm dùng Product Search chuẩn. Kết quả nhiều SKU/phiên bản cần hỏi phân biệt nếu ảnh hưởng đến việc chọn đơn.
- Nếu một bộ điều kiện trả nhiều đơn và người dùng chưa chọn thứ tự/số lượng thì hỏi ngắn bằng mã/ngày và dấu hiệu phân biệt.
- Điều kiện không có kết quả không được chuyển thành gửi đơn gần nhất.
- Mốc hôm nay/hôm qua dùng Asia/Bangkok. Cách hiểu ngày đơn theo field/contract PTAP phải được ghi trong đặc tả trước code.

Đề xuất mặc định kỹ thuật: chọn đơn đã lưu gần nhất theo thứ tự canonical của danh sách PTAP, thuộc khách được mapping, sau đó kiểm tra điều kiện gửi hiện hành. Đơn hủy hiện bị command gửi chặn; nếu đơn được chọn đã hủy thì giải thích/đề nghị nhân viên xử lý, không tự chọn đơn cũ hơn để thay thế. Định nghĩa gần nhất theo ngày tạo hay ngày nghiệp vụ phải được xác minh/chốt khi cập nhật spec, không dựa vào ngày sửa đơn.

### 4.3. Tạo và gửi A5

- Tái sử dụng `A5_FULL_QR`, PrintData và các quy tắc ghi chú thanh toán đã chốt trong ORDER_ZALO_SEND_SPEC.
- Trước ranh giới gửi, kiểm tra lại khách/nhóm, quyền, trạng thái và version của đơn. Nếu dữ liệu đã đổi, tải lại/xác minh và render theo snapshot hợp lệ; không gửi ảnh cũ.
- Caption nhận diện mã đơn để khách biết bot vừa gửi đơn nào; thông tin khách/thanh toán lấy từ dữ liệu chuẩn.
- Đơn dài tiếp tục theo cách renderer hiện hành tạo ảnh; UAT phải kiểm tra chữ, dòng cuối, tổng và QR, cũng như giới hạn attachment thực tế. Nếu ảnh dài không đọc được/không gửi được, dừng với kết quả rõ; thay quy tắc chia ảnh cần được đặc tả riêng trước code.
- Chỉ ghi gửi thành công sau ACK hợp lệ. Kết quả không rõ giữ DELIVERY_UNKNOWN, cần đối soát trước gửi lại.
- Identity retry dựa vào sự kiện Zalo gốc được lưu, không tạo identity mới mỗi lần retry. Cùng tin gốc chỉ có một kết quả gửi.
- Một tin mới chủ động xin gửi lại sau lần SENT là yêu cầu mới hợp lệ; cần điều chỉnh dedupe đúng phạm vi chat để không trả delivery SENT cũ mà không gửi ảnh. Giữ chống double-click của giao diện hiện hành.
- Nếu delivery trước còn SENDING/UNKNOWN thì yêu cầu mới không được tự vượt ranh giới đó để gửi thêm; cần đối soát hoặc phản hồi đang chờ xác minh.

## 5. Nghiệp vụ gửi ảnh sản phẩm

1. AI xác định khách muốn ảnh của sản phẩm/phiên bản nào từ tin hiện tại, quote và ngữ cảnh sản phẩm đang trao đổi.
2. Dùng Product Search chuẩn để tìm đối tượng. Tên xe/vị trí/hãng/mã phải được giữ; nhiều candidate còn phù hợp thì hỏi phân biệt trước khi gửi.
3. Backend cấp danh sách ảnh được phép của đúng product/version, gồm ảnh chính và metadata cần thiết. Chỉ cấp reference cho AI chọn nếu cần; sender lấy URL/bytes từ backend đã xác minh.
4. Đề xuất mặc định gửi một ảnh chính phù hợp với phiên bản đã chọn. Nếu khách yêu cầu thêm góc/ảnh hoặc toàn bộ ảnh thì chọn từ thư viện có nguồn; giới hạn số ảnh và cách gửi nhiều ảnh chốt theo khả năng sender/UAT.
5. Ảnh chung của product không được khẳng định là ảnh riêng của hãng/phiên bản. Nếu dùng ảnh chung, caption phải ghi rõ; khi yêu cầu bắt buộc ảnh đúng phiên bản mà không có thì báo thiếu.
6. Không có ảnh trong PTAP thì phản hồi chưa có ảnh. Không dùng ảnh sản phẩm khác hoặc tự sinh ảnh để thay thế.
7. Trước gửi kiểm tra ảnh còn active, cùng tenant/product/version, tải từ nguồn media của PTAP được cho phép, đúng loại/kích thước file và metadata. Không tải URL tùy ý do model hoặc khách đưa ra qua nghiệp vụ này.
8. Caption dùng tên, phiên bản/hãng và SKU canonical. Lỗi tải/gửi có trạng thái riêng; chưa ACK không thông báo đã gửi.

Không bao gồm nhận ảnh khách để OCR/nhận dạng sản phẩm trong đợt này. Nghiệp vụ đang yêu cầu là gửi ảnh sản phẩm có sẵn.

## 6. Nhắc lại hàng khách hỏi

Mục tiêu: liệt kê các món khách đã hỏi trong ngữ cảnh/khoảng thời gian yêu cầu, bất kể sau đó món đã được báo giá hoặc chốt.

- Nhận diện lời khách hỏi hàng, hỏi giá, tìm sản phẩm và câu bổ sung xác định món qua quan hệ quote/ngữ cảnh. Không gom lời nhân viên kể hàng thành yêu cầu khách.
- Tách đủ các món trong một tin; giữ tên xe, vị trí, hãng/mã và số lượng khi có bằng chứng. Không tự điền số lượng bị thiếu.
- Hai lần nhắc cùng món trong cùng yêu cầu có thể được gom nếu có chứng cứ; hai phiên bản khác nhau hoặc hai đợt hỏi riêng giữ phân biệt.
- Món đã chốt, đã báo giá hoặc đã rút yêu cầu vẫn thuộc lịch sử khách từng hỏi; có thể gắn trạng thái để tránh hiểu rằng khách vẫn đang cần mua.
- Trả lời bằng mô tả có nguồn từ khách. Không cần ép match catalog để liệt kê một yêu cầu hỏi hàng chưa xác định được SKU.
- Mỗi dòng giữ tin nguồn và thời gian trong kết quả cấu trúc. Câu trả lời cho khách gọn; có thể truy ra bằng chứng khi kiểm tra.

Đề xuất mặc định phạm vi: ưu tiên tin đang reply và nghiệp vụ đang trao đổi nếu rõ; nếu không có tham chiếu/khoảng ngày thì dùng hôm nay theo mặc định công cụ hiện hành và ghi rõ trong câu trả lời. Đây là đề xuất cần đưa vào spec; không âm thầm dùng một đoạn lịch sử ngắn để trả lời cho mọi thời gian.

## 7. Hàng khách hỏi nhưng chưa được báo giá

### 7.1. Tách những thông tin độc lập

Giữ riêng: khách đã hỏi món, đã có phản hồi, đã có báo giá gắn đúng món/phiên bản/yêu cầu, đã chốt, đã rút yêu cầu và bằng chứng bị thiếu. Trạng thái cuối như RESPONDED hoặc CONFIRMED không tự chứng minh có hay không có báo giá.

| Tình huống | Đánh giá |
| --- | --- |
| Nhân viên nói để kiểm tra, hỏi hãng/đời xe, gửi ảnh không kèm giá | Đã phản hồi; chưa có bằng chứng báo giá |
| Nhân viên báo giá rõ gắn đúng món, kể cả giá ở tin reply ngắn | Có báo giá nếu xác định được quan hệ item–giá |
| Khách đề nghị giá hoặc hỏi có phải 200 không | Chưa coi là báo giá của bên bán |
| Báo giá text của bot có nhiều dòng nhưng một dòng thiếu giá | Chỉ các dòng có giá hợp lệ được tính đã báo giá |
| Một tin hỏi ba món, bên bán báo giá hai món | Món còn lại vẫn chưa được báo giá |
| Có giá nhưng cho hãng/phiên bản hoặc đợt hỏi khác | Không tự áp dụng sang yêu cầu hiện tại |
| Khách đổi phiên bản sau khi có giá | Xác minh giá cũ còn áp dụng; chưa đủ bằng chứng thì cần làm rõ |
| Khách chốt nhưng không thấy bằng chứng giá | Không suy ra đã báo giá từ việc chốt |
| Khách rút yêu cầu hoặc bên bán đã báo không cung cấp | Đưa vào mục đã kết thúc/đã báo không cung cấp; không trình bày như đang chờ xử lý |
| Mất quote, thiếu lịch sử hoặc quan hệ mơ hồ | Chưa xác định; không khẳng định chưa báo giá |

### 7.2. Pipeline bằng chứng và độ đầy đủ

1. Tải lịch sử đúng nhóm và khoảng cần trả lời; tải thêm quote/context cần thiết và theo dõi giới hạn/pagination. Với yêu cầu xác định sự vắng mặt của báo giá, thiếu lịch sử không được xem là không có báo giá.
2. Parse báo giá structured text hiện có để giữ bằng chứng theo từng dòng. Khi ẩn tiền/định danh riêng tư, vẫn giữ mô tả món, dấu có/thiếu giá, nguồn bot/nhân viên và tin nguồn. Không thay cả báo giá bằng marker làm mất bằng chứng.
3. AI API trích item và các sự kiện/quan hệ theo ngữ nghĩa từ đối thoại. Tách từng mệnh đề hỏi hàng và từng dòng báo giá; một quote có giá không tự bao phủ mọi món trong cluster.
4. Runtime kiểm tra ID nguồn, vai trò người nói, quote graph, item/version, thứ tự thời gian và coverage. Mở rộng coverage hiện hành sang mệnh đề hỏi hàng và báo giá, không chỉ CONFIRM/CANCEL.
5. Reducer tính quan hệ yêu cầu–báo giá và tập kết quả từ dữ kiện hợp lệ. Model không tự đếm hoặc tự quyết tổng đầy đủ.
6. Các trường hợp quan hệ giá mơ hồ/gián tiếp có thể dùng lượt AI kiểm tra độc lập trong ngân sách đã quy định. Bất đồng hoặc thiếu bằng chứng chuyển sang chưa xác định; sự đồng thuận AI không thay được kiểm tra nguồn và lịch sử đầy đủ.
7. Kết quả cấu trúc tách `đã báo giá`, `chưa báo giá xác định được`, `chưa xác định` và `đã kết thúc`; câu trả lời ghi rõ phạm vi/thời điểm kiểm tra.

Đề xuất mặc định kiểm tra hôm nay đến thời điểm yêu cầu, cùng nguyên tắc tham chiếu ngữ cảnh tại mục 6. Với câu có ngày trong quá khứ, AI cần xác định người dùng hỏi trạng thái cuối ngày đó hay trạng thái hiện tại của các món hỏi hôm đó; nếu hai cách dẫn tới kết quả khác và câu không rõ thì hỏi lại.

## 8. AI API và cách đánh giá hiệu quả

- Tái sử dụng provider policy hiện hành. Ưu tiên cải thiện contract/context/evidence trước khi chọn model khác; so sánh model/cấu hình bằng cùng dữ liệu kiểm thử khi cần tăng độ chính xác.
- Dùng structured output. JSON hợp lệ chỉ là điều kiện kỹ thuật; còn phải kiểm tra tính đúng nghiệp vụ, nguồn và đầy đủ của từng món. DeepSeek hỗ trợ JSON output/tool calls và ghi rõ khả năng output bị cắt khi đạt giới hạn token. [Tài liệu DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).
- Đo riêng intent/selector, chọn entity, đủ item, quan hệ báo giá, hỏi lại đúng chỗ, timeout/fallback, thời gian và chi phí. Không coi trả lời được một câu hoặc HTTP 200 là thành công nghiệp vụ.
- Giữ câu người dùng và quan hệ reply làm dữ liệu; không ép người dùng theo mẫu. Prompt mô tả nghiệp vụ và bằng chứng cần có, không chồng thêm từng câu fixture để vượt test.
- Tạo bộ phát triển và holdout độc lập trước chỉnh prompt. Holdout gồm cùng ý định bằng nhiều cách diễn đạt chưa từng dùng sửa prompt, thiếu dấu/viết tắt, nhiều người xen kẽ, phủ định, điều kiện kết hợp và trường hợp thiếu nguồn thật sự.
- Đề xuất tối thiểu 100 ca holdout chia cho bốn nghiệp vụ, thêm các ca quyền/gửi lỗi. Chạy ít nhất hai lượt độc lập cho mỗi cấu hình; báo kết quả từng lượt và từng nghiệp vụ.
- Đề xuất mục tiêu semantic precision và recall tối thiểu 98% trên các ca đủ dữ liệu ở cả hai lượt. Không bù lỗi nghiêm trọng bằng điểm trung bình: sai khách/nhóm, gửi nhầm đơn/phiên bản, mất điều kiện, ảnh chứa dữ liệu bịa và gửi lặp cùng tin là các gate phải có 0 lỗi.
- Chấm hỏi lại có đúng nhu cầu hay không. Hỏi lại mọi câu hoặc trả chưa xác định cho ca vốn đủ dữ liệu không được tính là đạt độ chính xác.
- Mọi ca bắt buộc về quyền, dữ liệu không đầy đủ, báo giá text/đơn A5 và delivery phải PASS. Các tỷ lệ là mục tiêu nghiệm thu đề xuất, không cam kết hệ thống đạt tuyệt đối trong mọi hội thoại thật.
- Nếu không đạt, phân tích lỗi ở context/extraction/query/verification/delivery rồi sửa đúng tầng hoặc thử cấu hình/model tốt hơn. Không sửa scorer/expected của holdout để hợp thức hóa output; sau khi đã xem holdout thì bộ đó trở thành regression và vòng nghiệm thu mới cần holdout mới.

## 9. Các task và thứ tự triển khai đề xuất

Tất cả task dưới đây ở trạng thái PLANNED. Không có task nào được triển khai trong lần lập kế hoạch.

| Task | Công việc / đầu ra | Điều kiện nghiệm thu |
| --- | --- | --- |
| AI-BIZ-01 | Cập nhật spec: quyền khách tag trong nhóm, DTO route/selector, báo giá text/đơn A5, default gần nhất, thời gian, resend | Tình huống thường, mơ hồ và thiếu dữ liệu có expected; freeze bộ phát triển/holdout |
| AI-BIZ-02 | Backend xác định khách/người gọi và facade đọc/gửi có scope; audit/idempotency | Khách chỉ thao tác trong nhóm/khách được mapping; không nhận quyền/khách/nhóm tùy ý từ AI |
| AI-BIZ-03 | Semantic selection đơn + nối queue A5; báo giá giữ text; legitimate resend | Không bỏ filter; đúng order/version/mapping; ACK và unknown được xử lý đúng; UI cũ không hồi quy |
| AI-BIZ-04 | Product image DTO/selection và dispatch ảnh | Đúng product/version; hỏi khi mơ hồ; ảnh thiếu/lỗi không gây gửi ảnh khác |
| AI-BIZ-05 | Dữ liệu ngữ nghĩa chung cho hai câu hỏi lịch sử; quote DTO và item coverage | Nhắc đủ hàng đã hỏi; chưa báo giá chính xác theo từng món; lịch sử thiếu trả incomplete |
| AI-BIZ-06 | Holdout AI thật và E2E staging được cho phép, thử lỗi/concurrency/delivery | Các gate bắt buộc PASS; đạt mục tiêu từng nghiệp vụ và có bằng chứng gửi ảnh thật |
| AI-BIZ-07 | Runbook, counters, canary và release checklist | Bật/tắt theo phạm vi được thử; version/runtime đúng; chất lượng/delivery có theo dõi |

Phụ thuộc: 01 → 02; 03 và 04 theo contract 01/02; 05 dùng chung phạm vi khách và lịch sử; 06 sau các nghiệp vụ; 07 trước rollout. Có thể nghiên cứu/chuẩn bị fixture cho 05 ngay từ 01 vì đây là phần rủi ro ngữ nghĩa cao.

Thứ tự giá trị sử dụng: gửi đúng đơn A5 → gửi đúng ảnh sản phẩm → nhắc hàng/chưa báo giá bằng pipeline ngữ nghĩa chung → nghiệm thu toàn bộ. Không ước lượng ngày hoàn thành cố định trước khi spec/quyền và baseline AI được kiểm chứng.

## 10. Các nhóm nghiệm thu bắt buộc

| Nhóm | Ca cần có |
| --- | --- |
| Loại nội dung | Báo giá reply/gửi lại là text; đơn tồn tại là A5; gửi đơn không tự tạo đơn |
| Chọn đơn | Mặc định gần nhất; mã cụ thể; hôm qua/khoảng ngày; đơn trước; chứa sản phẩm; nhiều điều kiện; không có kết quả; đơn của khách khác; dữ liệu quá một trang |
| Ảnh A5 | Đúng PrintData/tổng/QR; đơn dài; thay version khi render; mapping đổi; retry cùng tin; tin mới xin gửi lại; ACK thiếu/ghi ACK thất bại |
| Ảnh sản phẩm | SKU chính xác; hãng/phiên bản; đại từ theo reply; candidate mơ hồ; ảnh chính/ảnh thêm; chỉ có ảnh chung; ảnh inactive; lỗi tải/gửi |
| Nhắc hàng | Một tin nhiều món; hỏi lại cùng món; hai phiên bản; nhiều đợt hỏi; đã chốt/hủy; nhiều người xen kẽ; chưa match catalog |
| Chưa báo giá | Phản hồi không giá; giá customer; giá TEAM/BOT; báo giá nhiều dòng thiếu một giá; đổi hãng; chốt chưa có giá; quote ngoài range; báo giá cũ; lịch sử thiếu |
| Coverage | Không bỏ mệnh đề hỏi hàng/báo giá; nguồn trỏ đúng item; giá của một món không lan sang món khác |
| Quyền | Khách tag ở nhóm ACTIVE; nhóm chưa mapping; mapping bị đổi/tắt; tenant khác; giả mạo order/product/URL/reference; không mở quyền tạo/sửa/hủy đơn |

Unit/SQL/contract tests kiểm tra logic và boundary; real-AI holdout kiểm tra ngữ nghĩa; E2E nhóm staging kiểm tra render/send/ACK và hội thoại thực. Mock send hoặc render local không thay thế bằng chứng gửi Zalo thật. Không dùng Production để thử các ca ghi/gửi trong bước phát triển.

## 11. Phạm vi file dự kiến và nguồn tham chiếu

Các vùng source có thể cần thay đổi khi được giao triển khai, chưa sửa trong kế hoạch này:

- PTAP-NEXT `supabase/functions/_shared/zalo-assistant-route.js`, `supabase/functions/zalo-readonly-assistant/handler.js`: route, selector, extraction schema và prompt ngữ nghĩa.
- PTAP-NEXT `tools/zalo-bridge/src/readonly-assistant.mjs`, `assistant-continuation.mjs`, `assistant-read-tools.mjs`, `conversation-statistics.mjs`, `supabase-queue.mjs`: admission/context/query/projection/dispatch.
- PTAP-NEXT `tools/zalo-bridge/src/order-send-runner.mjs`, `order-artifact-browser.js`, `zca-sender.mjs`: tái sử dụng A5/sender; chỉ sửa khi cần cho resend/receipt hoặc boundary có bằng chứng.
- Supabase migration/RPC mới hoặc helper dùng chung cho scope khách/gửi ảnh và evidence cần thiết; không sửa migration lịch sử đã apply.
- Contract/spec, test fixture và runbook tương ứng. Product Search behavior thay đổi phải cập nhật PRODUCT_SEARCH_SPEC và fixture trước source.

Nguồn chính đã đọc:

- [ORDER_ZALO_SEND_SPEC](C:/Users/Admin/Documents/PTAP-NEXT/docs/specs/ORDER_ZALO_SEND_SPEC.md)
- [ORDER_READ hiện trả text và hỏi selector khi thiếu](C:/Users/Admin/Documents/PTAP-NEXT/tools/zalo-bridge/src/readonly-assistant.mjs:956)
- [Queue/render/START/ACK của ảnh đơn](C:/Users/Admin/Documents/PTAP-NEXT/tools/zalo-bridge/src/order-send-runner.mjs)
- [Command gửi A5 và dedupe hiện hành](C:/Users/Admin/Documents/PTAP-NEXT/supabase/migrations/20261001090000_order_zalo_send.sql:66)
- [Projection sản phẩm của assistant](C:/Users/Admin/Documents/PTAP-NEXT/supabase/migrations/20260929150000_zalo_general_assistant_read_tools.sql:1)
- [Thư viện ảnh sản phẩm](C:/Users/Admin/Documents/PTAP-NEXT/apps/web/src/modules/product-search/product-image-gallery.js:180)
- [Ẩn dữ liệu báo giá trước thống kê](C:/Users/Admin/Documents/PTAP-NEXT/tools/zalo-bridge/src/conversation-statistics.mjs:175)
- [Reducer và aggregation hội thoại](C:/Users/Admin/Documents/PTAP-NEXT/tools/zalo-bridge/src/conversation-statistics.mjs:292)

Trước triển khai phải chốt các đề xuất còn mở: định nghĩa ngày/thứ tự đơn gần nhất, phạm vi thời gian mặc định của hai câu hỏi lịch sử, số ảnh sản phẩm tối đa/cách gửi ảnh chung, execution actor của facade chat theo kiến trúc PTAP và quy tắc gửi lại khi delivery trước chưa rõ. Không tự khóa những quyết định đó thành nghiệp vụ chỉ vì chúng xuất hiện trong bản kế hoạch.


## Cập nhật triển khai 01/10/2026

Đã hoàn tất bản cục bộ trong PTAP-NEXT worktree `BRANCH1-zalo-business-improvements`: đơn lưu gửi A5, báo giá gửi text; ảnh đúng phiên bản; inquiry và bằng chứng báo giá riêng từng món; dùng tài khoản bot hiện có làm actor/audit. Mặc định gần nhất và khoảng thời gian thống kê giữ quy tắc hiện có trong backend/spec.

Sau hợp nhất main mới nhất: 356/356 Bridge/Edge/A5 và 138/138 database PASS (97 của task, 41 purchase intake đã có trong main). Regression repository có 1.660 PASS, 0 FAIL, 1 Windows symlink SKIP; build PASS. Sau nạp credit, availability 2/2 và AI thật trên bộ đã chốt đạt routing 200/200, evidence 92/92, không có request unavailable. Giới hạn và các lần FAIL trước đó vẫn được ghi trong báo cáo.

Theo xác nhận mới của người dùng, Product Search, detail, giá và ảnh luôn dùng nguồn Production. Queue mới đọc đúng version Production ngay cả khi business target STAGING; ảnh mới chỉ gửi khi business target Production để giữ cùng FK/revalidation. Sửa lỗi descriptor R2 phát hiện trên dữ liệu thật. Một ảnh R2 và cả 6 ảnh URL active đã tải/chuyển PNG thành công, chưa gửi Zalo.

Đã chuẩn bị runbook và đối chiếu chỉ đọc: Bridge đang STAGING; STAGING thiếu 3 migration (2 của task, 1 purchase intake từ main), Production thiếu 8 migration so với checkout, có phần purchase ngoài task. Chưa deploy hoặc apply migration từ xa; còn review kế hoạch release đầy đủ và nghiệm thu Zalo/hội thoại khách thật.

Bản review: [PR nháp #81](https://github.com/hoangquangthanhxd-del/PTAP-NEXT/pull/81), commit `c6d799c82df5af5f2178c44cf82035e0daa6cb57`. [CI verify và database đã PASS](https://github.com/hoangquangthanhxd-del/PTAP-NEXT/actions/runs/36874295583) trên đúng commit này; chưa merge vào main.

Báo cáo đầy đủ: [Cải thiện nghiệp vụ bot](C:/Users/Admin/Documents/PTAP-NEXT/.worktrees/BRANCH1-zalo-business-improvements/docs/logs/2026-10-01-zalo-business-reads-implementation.md).
