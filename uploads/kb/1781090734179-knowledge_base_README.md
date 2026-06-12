# Thư mục Cơ sở Tri thức (Knowledge Base)

Thư mục này được tạo ra để lưu trữ các tài liệu thô (PDF, TXT, MD) dùng làm Cơ sở Tri thức cho hệ thống AI của dự án XFoodi.

## Định dạng tài liệu được hỗ trợ:
- **PDF (.pdf)**: Thực đơn, quy trình phục vụ chi tiết, cẩm nang nhân viên.
- **TXT (.txt)**: Các thông tin văn bản thuần túy, mô tả món ăn.
- **Markdown (.md)**: Tài liệu được định dạng cấu trúc, hướng dẫn sử dụng.

## Cách sử dụng:
1. Bạn có thể đặt trực tiếp các tài liệu thô vào đây để tiện quản lý và phát triển.
2. Khi đăng nhập vào Dashboard quản trị (Admin/Restaurant Dashboard), bạn có thể sử dụng chức năng tải lên (Upload) để hệ thống tự động phân tách văn bản (Chunking), tạo Vector Embeddings (Gemini) và lưu vào cơ sở dữ liệu Postgres (pgvector) để chatbot RAG trả lời.
