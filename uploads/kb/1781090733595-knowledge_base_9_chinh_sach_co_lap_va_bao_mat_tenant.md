# Chính sách Cô lập Dữ liệu và Bảo mật Đa Tenant (Multi-Tenant Data Isolation)

Tài liệu này quy định các biện pháp kiến trúc phần mềm và chính sách bảo mật nhằm cô lập tuyệt đối dữ liệu giữa các nhà hàng đối tác (tenants) trên nền tảng XFoodi, ngăn chặn hoàn toàn việc rò rỉ dữ liệu hoặc xung đột tài nguyên giữa các tenant với nhau.

---

## 1. Cơ chế cô lập ở tầng Cơ sở dữ liệu (Database Isolation)
Mặc dù XFoodi sử dụng kiến trúc cơ sở dữ liệu dùng chung (Shared Database, Shared Schema) để tối ưu hóa chi phí tài nguyên, hệ thống áp dụng các quy tắc cô lập nghiêm ngặt:
- **Tenant-Key Isolation**: Mọi bảng dữ liệu liên quan đến hoạt động của nhà hàng (như `Dish`, `Order`, `Table`, `Employee`, `Feedback`, `RestaurantDocument`) đều bắt buộc phải có cột `restaurantId` (gán UUID duy nhất của nhà hàng đó).
- **Ràng buộc khóa ngoại**: Cột `restaurantId` liên kết trực tiếp với bảng `Restaurants` có thuộc tính `onDelete: Cascade`. Khi một nhà hàng ngừng hoạt động hoặc bị xóa khỏi hệ thống, toàn bộ dữ liệu liên quan sẽ bị xóa sạch tự động, không để lại dữ liệu rác.

---

## 2. Cơ chế cô lập ở tầng Ứng dụng & Routing (TenantGuard Middleware)
Hệ thống sử dụng middleware **TenantGuard** để kiểm tra tính hợp lệ của mọi yêu cầu HTTP gửi đến backend:
1. **Xác định Domain**: Hệ thống đọc domain gửi yêu cầu từ header `x-tenant-domain` hoặc `host` để xác định chính xác nhà hàng đích (ví dụ: `nhahangA.xfoodi.website`).
2. **Ràng buộc Token**: Token JWT của người dùng (Owner, Manager, Staff) luôn chứa trường `restaurantId`. 
3. **Chặn truy cập chéo (Cross-Tenant Access Block)**:
   - Nếu một nhân viên thuộc `nhahangA` cố tình gửi request chỉnh sửa thực đơn của `nhahangB` (ví dụ bằng cách thay đổi ID trên thanh địa chỉ hoặc gửi REST API thủ công), middleware `TenantGuard` sẽ đối chiếu `restaurantId` trong token với `tenantId` đang truy cập.
   - Hệ thống sẽ lập tức chặn yêu cầu và trả về lỗi **403 Forbidden** cùng thông báo: *"Bạn không có quyền truy cập dữ liệu của nhà hàng này."*.

---

## 3. Cơ chế cô lập ở tầng Bộ nhớ đệm (Redis Cache Isolation)
Để tránh xung đột dữ liệu đệm (cache) giữa các nhà hàng:
- Mọi khóa lưu giữ trên Redis đều được tự động tiền tố hóa (prefixing) theo định dạng: `tenant:[restaurantId]:[key_name]`.
- Việc xóa cache hoặc hết hạn session của một nhà hàng sẽ không gây ảnh hưởng hay làm mất cache của các nhà hàng khác trên hệ thống.
- Phiên đăng nhập người dùng (`UserSession`) được định danh cụ thể kèm theo domain gốc đăng nhập.

---

## 4. Xử lý Trùng lặp Tài khoản (Email / Username)
Vì hệ thống là đa tenant, một địa chỉ Email khách hàng (ví dụ: `khachhang@gmail.com`) có thể đăng ký tài khoản thành viên ở nhiều nhà hàng khác nhau. Để tránh xung đột tài khoản:
- Hệ thống tự động tiền tố hóa email đăng ký ở tầng lưu trữ DB theo định dạng: `[tenant_slug]:[email]` (Ví dụ: `quan-an-ngon:khachhang@gmail.com`).
- Khi đăng nhập tại domain của nhà hàng nào, hệ thống sẽ tự động ghép slug tương ứng để đối chiếu mật khẩu, đảm bảo khách hàng có thể sử dụng cùng một email ở nhiều quán khác nhau với các mật khẩu và điểm tích lũy thành viên hoàn toàn độc lập mà không bị xung đột tài khoản.
