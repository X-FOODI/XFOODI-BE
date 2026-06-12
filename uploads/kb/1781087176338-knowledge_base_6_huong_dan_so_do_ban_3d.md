# Hướng dẫn Quản lý Sơ đồ Bàn ăn 3D (3D Table Map)

Sơ đồ bàn ăn 3D là tính năng công nghệ đột phá trên XFoodi, hỗ trợ trực quan hóa toàn bộ không gian phòng ăn của nhà hàng theo thời gian thực dưới dạng không gian ba chiều tương tác.

---

## 1. Tính năng nổi bật của Sơ đồ Bàn 3D
- **Thiết kế Kéo & Thả (Drag-and-Drop Editor)**: Cho phép chủ nhà hàng tự do sắp đặt vị trí bàn ăn, ghế, tường ngăn, cửa ra vào, sân khấu, quầy thu ngân và cây cảnh trang trí theo tỉ lệ kích thước thực tế.
- **Tương tác Đa Chiều**: Khách hàng và nhân viên có thể xoay góc nhìn 360 độ, thu phóng (zoom-in/zoom-out) toàn bộ không gian nhà hàng trực tiếp trên trình duyệt mà không cần cài đặt ứng dụng bổ sung.
- **Đồng bộ Trạng thái Thời gian thực**: Màu sắc của các bàn ăn trên sơ đồ 3D tự động thay đổi dựa trên trạng thái hoạt động:
  - **Màu xám**: Bàn trống (sẵn sàng đón khách).
  - **Màu đỏ**: Bàn đang có khách ăn (được liên kết với Table Session hoạt động).
  - **Màu vàng**: Bàn đã được khách đặt trước (Reservation) và sắp đến giờ hẹn.
  - **Màu cam**: Bàn chưa dọn dẹp (sau khi khách thanh toán xong, chờ nhân viên lau dọn).

---

## 2. Quy trình thiết kế sơ đồ bàn 3D (Dành cho Quản lý)

Chỉ có người dùng có phân quyền **Owner** hoặc **Manager** mới có quyền chỉnh sửa sơ đồ bàn 3D của nhà hàng:

1. **Truy cập Trình chỉnh sửa**: Vào mục **Quản lý** -> Chọn **Bàn ăn** -> Nhấp nút **Chỉnh sửa sơ đồ 3D**.
2. **Khai báo không gian**: Thiết lập chiều dài, chiều rộng của mặt sàn nhà hàng (ví dụ: 15m x 20m) và số lượng tầng (lầu).
3. **Sắp xếp bàn ghế**:
   - Chọn loại bàn trong thư viện mẫu: Bàn tròn (4-6 người), Bàn vuông (2-4 người), Bàn chữ nhật dài (8-12 người).
   - Nhập thông tin số bàn (ví dụ: Bàn 101, Bàn 102) và gán ID tương ứng.
4. **Vẽ chướng ngại vật & không gian phụ**: Kéo các mô hình tường chắn, cửa sổ, cây xanh, khu vực sân khấu biểu diễn hoặc quầy bar vào đúng vị trí thực địa.
5. **Lưu và áp dụng**: Nhấn nút **Lưu cấu hình**. Sơ đồ mới sẽ ngay lập tức được áp dụng cho cả giao diện đặt bàn của khách hàng và giao diện theo dõi của nhân viên phục vụ.

---

## 3. Trải nghiệm đặt bàn 3D của Khách hàng
- Khi khách hàng truy cập vào tính năng đặt bàn trực tuyến trên trang web nhà hàng, hệ thống sẽ tải lên sơ đồ 3D tương tác.
- Khách hàng có thể tự do dạo bước ảo trong không gian nhà hàng, nhấp chọn trực tiếp chiếc bàn mà mình yêu thích (ví dụ: bàn cạnh cửa sổ view sông, bàn biệt lập yên tĩnh hoặc phòng VIP đóng kín).
- Hệ thống tự động khóa tạm thời chiếc bàn đã chọn trong 5 phút để khách hoàn tất quy trình đặt bàn và thanh toán cọc (nếu có), đảm bảo không xảy ra hiện tượng trùng bàn (double-booking).
