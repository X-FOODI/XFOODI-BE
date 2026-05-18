# Quick Start: Email Confirmation Implementation

## 🎯 Goal

Thay đổi registration flow từ **auto-login** sang **email confirmation**.

## 📊 Current vs New Flow

### Current Flow (Auto-login)
```
Register → Auto-login → Return tokens → Redirect to app
```

### New Flow (Email Confirmation)
```
Register → Send email → User clicks link → Confirm → Login manually
```

## 🚀 Quick Implementation Steps

### 1. Backend - Add 3 Endpoints

```csharp
// POST /api/auth/register
// - Create user with EmailConfirmed = false
// - Generate token
// - Send email
// - Return success message (no tokens)

// GET /api/auth/confirm-email?email={email}&token={token}
// - Validate token
// - Set EmailConfirmed = true
// - Return success

// POST /api/auth/resend-confirmation-email
// - Generate new token
// - Send email again
```

### 2. Frontend - Add 2 Pages

```typescript
// app/check-email/page.tsx
// - Show "Check your email" message
// - Button to resend email

// app/confirm-email/page.tsx
// - Read email & token from URL
// - Call confirm API
// - Show success/error
// - Redirect to login
```

### 3. Update AuthService

```typescript
// Change endpoint
const response = await axiosInstance.post('/auth/register', data);

// Handle response
if (response.data.requireEmailConfirmation) {
  router.push(`/check-email?email=${email}`);
}
```

## 📝 Key Files to Modify

### Backend
- `Controllers/AuthController.cs` - Add 3 endpoints
- `Services/AuthService.cs` - Implement logic
- `Models/ApplicationUser.cs` - Add EmailConfirmationToken field
- `Services/EmailService.cs` - Send confirmation email

### Frontend
- `lib/services/authService.ts` - Change endpoint
- `app/register/page.tsx` - Handle new response
- `app/check-email/page.tsx` - New page
- `app/confirm-email/page.tsx` - New page

## 🔧 Configuration Needed

### Backend appsettings.json
```json
{
  "EmailSettings": {
    "SmtpServer": "smtp.gmail.com",
    "SmtpPort": 587,
    "SenderEmail": "noreply@restx.food",
    "Username": "your-email@gmail.com",
    "Password": "your-app-password"
  },
  "FrontendUrl": "http://localhost:3000"
}
```

### Frontend .env.local
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
```

## ⚠️ Important Notes

1. **Email Service Required**: Cần setup SMTP (Gmail, SendGrid, etc.)
2. **Token Expiry**: Tokens hết hạn sau 24 giờ
3. **Login Block**: Users không thể login cho đến khi confirm email
4. **Backward Compatibility**: Giữ endpoint cũ `/auth/customer/phone-register` để không break existing apps

## 📚 Full Documentation

Xem file `EMAIL_CONFIRMATION_FLOW.md` để có:
- Complete code examples
- Database schema changes
- Security considerations
- Testing strategies
- Migration path

## 🎬 Next Steps

1. Read full documentation: `EMAIL_CONFIRMATION_FLOW.md`
2. Setup email service (SMTP)
3. Implement backend endpoints
4. Implement frontend pages
5. Test flow end-to-end
6. Deploy to staging
7. Monitor and fix issues
8. Deploy to production



