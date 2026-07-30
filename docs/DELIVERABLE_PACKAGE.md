# Software Requirements

Bảng 4 cột: `No.`, `Software`, `Version`, `Description`.

| No. | Software | Version | Description |
|-----|----------|---------|-------------|
| 1 | .NET SDK | 8.0 (or latest LTS) | Run ASP.NET Core Web API backend (if applicable). |
| 2 | Node.js | 18+ (LTS) | Run frontend (React / Next.js) and development tools. |
| 3 | SQL Server | Latest | Primary relational database (or the DB used by backend). |
| 4 | Redis | Latest | Caching and performance optimization. |
| 5 | Docker & Docker Compose | Latest | Run infrastructure services locally / CI. |
| 6 | Git | Latest | Source control. |
| 7 | Visual Studio / VS Code | Latest | Development IDE. |
| 8 | Postman / Swagger | Latest | API testing and documentation. |
| 9 | Cloudinary | N/A | Image storage service (project uses Cloudinary). |
| 10 | Email Service (SMTP) | N/A | Send notifications, OTPs (configure provider). |
| 11 | Gemini API Key | N/A | AI analytics / external API access (store securely). |

**Ghi chú ngắn:**
- Phiên bản chi tiết (minor/patch) có thể ghi trong `README_SETUP.md` hoặc `docs/REQUIREMENTS.md` nếu cần quản lý chặt.
- Không commit secrets; dùng `/.env.example` và CI secrets.

***

Generated: software requirements table per user request.
