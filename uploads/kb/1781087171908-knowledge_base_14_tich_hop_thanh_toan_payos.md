# Tích hợp Cổng Thanh toán PayOS & Đối soát Tự động (PayOS Integration)

XFoodi tích hợp cổng thanh toán trực tuyến không tiền mặt thông qua **PayOS** (hệ thống thanh toán qua mã VietQR chuyển khoản ngân hàng nhanh 24/7), hỗ trợ tối ưu hóa quy trình thu ngân và giảm thiểu sai sót đối soát tiền mặt.

---

## 1. Cơ chế Tạo mã QR Thanh toán tự động (VietQR Dynamic Code)
Khi khách hàng gửi yêu cầu thanh toán hóa đơn từ bàn ăn:
1. **Tính toán hóa đơn**: Hệ thống tổng hợp toàn bộ các món đã gọi thuộc Table Session hiện tại, áp dụng mã giảm giá (nếu có), tính điểm tích lũy và cho ra số tiền cuối cùng.
2. **Gọi API PayOS**: Backend nhà hàng gửi yêu cầu tạo cổng thanh toán đến PayOS kèm thông số:
   - Số tiền cần thanh toán chính xác.
   - Nội dung chuyển khoản duy nhất (ví dụ: `XFOODI ORDER [Order_ID]`).
   - Tài khoản ngân hàng thụ hưởng cấu hình riêng của từng nhà hàng (Tenant Bank Account).
3. **Hiển thị mã VietQR**: Trình duyệt của khách hiển thị màn hình thanh toán chứa mã QR động chứa đầy đủ thông tin số tài khoản, số tiền và nội dung chuyển khoản mã hóa.

---

## 2. Xử lý Đối soát Tự động qua Webhook (Automatic Reconciliation)
Khi khách hàng quét mã QR bằng ứng dụng ngân hàng di động (Mobile Banking) và thực hiện chuyển tiền thành công:
- Ngân hàng thụ hưởng nhận tiền và gửi tín hiệu báo có về PayOS.
- PayOS lập tức gửi một yêu cầu POST trực tiếp (Webhook) về API Endpoint của XFoodi: `/api/payments/payos-webhook`.
- Backend XFoodi xử lý Webhook:
  - Xác thực chữ ký bảo mật (checksum) đi kèm từ PayOS để tránh tin giả mạo.
  - Tìm kiếm đơn hàng tương ứng với `Order_ID` nằm trong nội dung chuyển khoản.
  - Cập nhật trạng thái đơn hàng từ `UNPAID` sang `PAID` (Đã thanh toán).
  - Tự động thay đổi trạng thái Table Session thành `COMPLETED` để giải phóng bàn ăn trên sơ đồ 3D.
  - Phát tín hiệu báo thanh toán thành công qua WebSocket về màn hình POS của quầy thu ngân và in hóa đơn tự động ra máy in nhiệt tại quầy.

---

## 3. Quy trình Xử lý Sự cố & Hoàn trả (Dispute Management)
Trường hợp khách hàng đã chuyển tiền thành công nhưng do nghẽn mạng ngân hàng hoặc lỗi chữ ký Webhook khiến hóa đơn không tự động cập nhật:
- Thu ngân truy cập tab **Quản lý đơn hàng** -> Tìm đơn tương ứng -> Nhấp nút **Kiểm tra trạng thái đối soát**. Hệ thống sẽ gọi trực tiếp API đối soát thủ công của PayOS để cập nhật trạng thái ngay lập tức.
- Đối với các đơn hàng cần hủy và hoàn trả tiền cho khách (ví dụ do nhà bếp hết món sau khi khách đã chuyển khoản), nhà hàng thực hiện quy trình hoàn tiền thủ công ngoài hệ thống dựa trên thông tin số tài khoản ngân hàng ghi nhận trong lịch sử giao dịch PayOS để đảm bảo an toàn tuyệt đối dòng tiền.
