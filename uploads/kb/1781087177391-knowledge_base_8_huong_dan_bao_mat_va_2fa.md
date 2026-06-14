# Hướng dẫn Bảo mật Tài khoản & Thiết lập Xác thực 2 Yếu tố (2FA)

XFoodi chú trọng bảo vệ an toàn thông tin kinh doanh và dữ liệu khách hàng. Tài liệu này cung cấp hướng dẫn về bảo mật phân quyền và hướng dẫn chi tiết cách cấu hình xác thực 2 yếu tố (2FA) bằng ứng dụng di động Google Authenticator.

---

## 1. Phân quyền Người dùng trên Hệ thống (User Access Control)
Hệ thống phân chia quyền truy cập thành 5 nhóm chính để đảm bảo bảo mật dữ liệu nội bộ:
- **Super Admin (System Admin)**: Quyền cao nhất toàn hệ thống. Quản lý toàn bộ hệ thống SaaS, kiểm duyệt đơn đăng ký nhà hàng, quản lý thanh toán phí dịch vụ của các đối tác, truy cập logs hệ thống toàn diện.
- **Restaurant Owner (Chủ nhà hàng)**: Quyền cao nhất của một tenant nhà hàng cụ thể. Quản lý cài đặt chung, menu món ăn, sơ đồ bàn 3D, thiết lập cổng thanh toán và quản lý thông tin nhân viên.
- **Restaurant Manager (Quản lý nhà hàng)**: Thực hiện hầu hết các quyền vận hành như quản lý đặt bàn, điều phối đơn hàng, xem báo cáo doanh thu, duyệt danh sách nguyên liệu nhập kho.
- **Restaurant Staff (Nhân viên phục vụ/nhà bếp)**: Chỉ truy cập vào giao diện làm việc được chỉ định (màn hình KDS nhà bếp hoặc giao diện ghi order tại bàn POS). Không thể xem doanh thu hay thay đổi cài đặt hệ thống.
- **Customer (Khách hàng)**: Chỉ truy cập xem thực đơn điện tử và gửi yêu cầu order tại bàn thông qua website không cần đăng nhập.

---

## 2. Quy định bảo mật mật khẩu tài khoản
Tất cả các tài khoản quản trị khi đăng ký hoặc thay đổi mật khẩu bắt buộc phải tuân thủ các quy tắc bảo mật sau:
- Độ dài tối thiểu: **8 ký tự**.
- Phải chứa ít nhất **1 ký tự viết hoa** (A-Z).
- Phải chứa ít nhất **1 ký tự viết thường** (a-z).
- Phải chứa ít nhất **1 chữ số** (0-9).
- Hệ thống tự động khóa tài khoản tạm thời trong **15 phút** nếu nhập sai mật khẩu quá 10 lần liên tiếp (áp dụng cho tài khoản thông thường) và khóa **1 giờ** nếu nhập sai quá 3 lần liên tiếp (đối với tài khoản Admin).

---

## 3. Hướng dẫn cấu hình Xác thực 2 Yếu tố (2FA)

Xác thực 2 yếu tố (2FA) là bắt buộc đối với các tài khoản quản trị cấp cao để ngăn chặn việc bị đánh cắp thông tin tài khoản.

### Bước 1: Chuẩn bị thiết bị di động
- Tải xuống và cài đặt ứng dụng **Google Authenticator** hoặc **Microsoft Authenticator** từ CH Play (Android) hoặc App Store (iOS) trên điện thoại di động của bạn.

### Bước 2: Kích hoạt 2FA trên XFoodi
- Đăng nhập vào trang quản trị -> Vào mục **Tài khoản cá nhân** -> Chọn tab **Bảo mật**.
- Tại mục **Xác thực 2 yếu tố (2FA)**, nhấp chọn **Kích hoạt**.
- Hệ thống sẽ hiển thị một mã QR Code bảo mật kèm theo khóa cấu hình thủ công (mã secret key dạng chữ).

### Bước 3: Liên kết với ứng dụng di động
- Mở ứng dụng Google Authenticator trên điện thoại -> Chọn dấu **"+"** ở góc dưới bên phải -> Chọn **Quét mã QR**.
- Hướng camera điện thoại quét mã QR hiển thị trên màn hình máy tính của XFoodi.
- Ứng dụng di động lập tức sinh ra một dòng mã xác thực gồm **6 chữ số** thay đổi liên tục mỗi 30 giây (Ví dụ: `123 456`).

### Bước 4: Xác nhận kích hoạt
- Nhập mã 6 chữ số đang hiển thị trên điện thoại vào ô xác thực trên website XFoodi -> Nhấn **Xác nhận**.
- Hệ thống hiển thị 10 "Mã dự phòng (Backup Codes)". Hãy lưu trữ 10 mã này ở nơi an toàn. Bạn có thể dùng mã dự phòng này để đăng nhập trong trường hợp bị mất điện thoại di động.
- Kích hoạt thành công. Từ lần đăng nhập tiếp theo, sau khi nhập đúng Email và Mật khẩu, bạn bắt buộc phải nhập thêm mã OTP 6 số từ ứng dụng điện thoại để vào hệ thống.
