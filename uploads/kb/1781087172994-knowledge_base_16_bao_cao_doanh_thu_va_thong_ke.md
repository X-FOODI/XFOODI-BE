# Báo cáo Doanh thu, Thống kê và Phân tích Phản hồi (Analytics & Reports)

Hệ thống quản trị XFoodi cung cấp bảng phân tích dữ liệu kinh doanh thông minh giúp chủ cửa hàng theo dõi doanh thu, hiệu suất đơn hàng và mức độ hài lòng của khách hàng để tối ưu hóa vận hành nhà hàng.

---

## 1. Hệ thống Biểu đồ Phân tích Doanh thu & Đơn hàng
Trên trang Dashboard chính của Nhà hàng, các biểu đồ được cập nhật liên tục:
- **Biểu đồ cột Đơn hàng (Orders Bar Chart)**: Thống kê số lượng đơn hàng theo chu kỳ bộ lọc (Hôm nay, Tuần này, Tháng này, Năm nay). Hiển thị tỷ lệ đơn hàng hoàn thành (Completed) so với đơn hàng bị hủy (Cancelled).
- **Biểu đồ đường Doanh thu (Revenue Chart)**: Trực quan hóa biến động doanh thu theo thời gian, giúp phát hiện các khung giờ vàng hoặc ngày bán chạy nhất trong tuần để điều phối nhân sự phù hợp.
- **Thẻ KPI (Key Performance Indicators)**:
  - Tổng doanh thu thực nhận.
  - Tổng số lượng đơn hàng và tỷ lệ chuyển đổi.
  - Số lượng đặt bàn ăn (Reservations) thành công.
  - Số lượng khách hàng mới đăng ký (New Customers).

---

## 2. Thống kê món ăn bán chạy nhất (Best-Selling Dishes)
- Thẻ **"Nhà hàng doanh thu cao nhất"** (ở admin dashboard) hoặc **"Món ăn bán chạy nhất"** (ở restaurant dashboard) hiển thị danh sách các món ăn phổ biến nhất kèm theo số lượt gọi món và tỷ trọng doanh thu.
- **Mục đích vận hành**: Giúp bếp trưởng chuẩn bị sẵn lượng nguyên liệu tươi sống phù hợp cho các món bán chạy, tránh lãng phí tồn kho đối với các món ít khách gọi, và đưa ra quyết định điều chỉnh giá bán hoặc bổ sung combo khuyến mãi.

---

## 3. Phân tích Phản hồi và Đánh giá (Feedback Analysis)
Khách hàng sau khi hoàn tất thanh toán hóa đơn VietQR PayOS có thể viết đánh giá trực tiếp trên điện thoại di động:
- **Thang điểm**: Đánh giá từ 1 đến 5 sao cho chất lượng món ăn và thái độ phục vụ.
- **Tải ảnh thực tế**: Cho phép chụp ảnh đĩa ăn gửi kèm đánh giá.
- **Màn hình Phản hồi mới nhất (Latest Feedbacks)**: Hiển thị ngay lập tức trên Dashboard của Quản lý. Hệ thống tự động phân loại các đánh giá 1-2 sao vào danh mục "Cảnh báo khẩn cấp" để quản lý có thể nhanh chóng liên hệ giải quyết khiếu nại, nâng cao uy tín thương hiệu.
- **Báo cáo tổng hợp**: Tính toán điểm xếp hạng trung bình (Rating score) của nhà hàng hàng tháng để Super Admin đánh giá hiệu quả kinh doanh của các tenant đối tác.
