# Cơ chế phân biệt Vector và RAG giữa các Tenant (RAG Vector Isolation)

Một trong những trường hợp xung đột lớn nhất trong hệ thống RAG đa tenant là **Trùng lặp nội dung tri thức**. Ví dụ: Nhà hàng A và Nhà hàng B đều bán món "Bò Bít Tết" nhưng có giá tiền, nguyên liệu và cách chế biến hoàn toàn khác nhau. Nếu hệ thống tìm kiếm vector (pgvector) không được cô lập, Chatbot của Nhà hàng A có thể trả lời nhầm giá tiền của Nhà hàng B. 

Tài liệu này giải thích cách XFoodi giải quyết triệt để xung đột tìm kiếm ngữ cảnh này.

---

## 1. Nguyên nhân gây xung đột Vector RAG
Khi embed các tài liệu thực đơn giống nhau, các vector kết quả sinh ra bởi mô hình Gemini (`gemini-embedding-001`) sẽ nằm rất gần nhau trong không gian vector đa chiều (độ tương đồng cosine cao).
Nếu chỉ truy vấn tìm kiếm 5 đoạn văn bản tương đồng nhất trên toàn bộ bảng `DocumentChunks`, hệ thống sẽ trả về lẫn lộn thông tin giữa các nhà hàng đối thủ, gây ảnh hưởng nghiêm trọng đến uy tín kinh doanh.

---

## 2. Giải pháp cô lập Vector ở tầng truy vấn SQL (Filtered Vector Search)
XFoodi không sử dụng tìm kiếm tương đồng thô trên toàn bảng. Mọi truy vấn tìm kiếm ngữ cảnh RAG bắt buộc phải đi kèm với bộ lọc cứng ở mức cơ sở dữ liệu (`WHERE` clause) liên quan đến `restaurantId` của tenant hiện hành.

### Đoạn truy vấn SQL thực tế được hệ thống áp dụng:
```sql
SELECT dc.content, rd.filename,
       (dc.embedding <=> $1::vector) as distance,
       (to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $3)) as ts_match
FROM "DocumentChunks" dc
JOIN "RestaurantDocuments" rd ON dc."documentId" = rd.id
WHERE rd."restaurantId" = $2 AND rd.status = 'INDEXED'
ORDER BY (dc.embedding <=> $1::vector) - (CASE WHEN to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $3) THEN 0.15 ELSE 0.0 END) ASC
LIMIT 10000
```

### Cách thức hoạt động:
1. **Ràng buộc cứng `$2` (restaurantId)**: Tham số này được truyền trực tiếp từ session hoạt động hoặc QR Code quét tại bàn của nhà hàng.
2. **Loại trừ dữ liệu lạ trước khi so sánh**: Câu lệnh `WHERE rd."restaurantId" = $2` đảm bảo cơ sở dữ liệu chỉ quét các chunks thuộc về duy nhất nhà hàng đó. Tất cả các vector tương đồng của các nhà hàng khác bị loại bỏ 100% trước khi thực hiện tính toán khoảng cách cosine (`<=>`).
3. **Bảo vệ quyền riêng tư**: Không có bất kỳ rò rỉ dữ liệu chéo nào xảy ra, dù nội dung tài liệu của các nhà hàng đối tác giống nhau tới 99%.

---

## 3. Phân biệt RAG Hệ thống và RAG Nhà hàng
Để đảm bảo Chatbot AI không nhầm lẫn giữa thông tin chung của Nền tảng (SaaS) và thông tin riêng của Nhà hàng:
- **Chatbot Trang chủ (System Bot)**: Chỉ gọi API `/api/ai/chat/system`. API này chỉ truy vấn các tài liệu tri thức liên kết với `restaurantId = 'system'` (chứa tài liệu hướng dẫn sử dụng phần mềm, bảng giá gói cước XFoodi).
- **Chatbot Tại bàn (Restaurant Bot)**: Chỉ gọi API `/api/ai/chat/restaurant` kèm theo ID cụ thể của nhà hàng (ví dụ: `restaurantId = 'quan-an-ngon'`). Nó hoàn toàn không thể tiếp cận dữ liệu của chatbot hệ thống trừ khi được thiết lập rõ ràng.
- Sự phân định rạch ròi này giúp chatbot luôn trả lời đúng vai trò: trợ lý ảo của quán ăn trả lời về món ăn, trợ lý ảo của nền tảng trả lời về phần mềm.
