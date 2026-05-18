# Email Confirmation Flow Implementation Guide

## Overview

This document describes how to implement email confirmation for user registration in RestX API.

## Current State

The existing backend (`RestX-API-ex`) uses **auto-login** after registration:
- Endpoint: `POST /api/auth/customer/phone-register`
- Flow: Register → Auto-login → Return tokens immediately
- No email confirmation required

## Proposed Email Confirmation Flow

### 1. Registration Flow

```
User submits registration form
    ↓
POST /api/auth/register
    ↓
Backend creates user with EmailConfirmed = false
    ↓
Generate email confirmation token
    ↓
Send confirmation email with link
    ↓
Return success message (no tokens)
    ↓
Frontend shows "Check your email" page
```

### 2. Email Confirmation Flow

```
User clicks link in email
    ↓
GET /api/auth/confirm-email?token={token}&email={email}
    ↓
Backend validates token
    ↓
Set EmailConfirmed = true
    ↓
Redirect to login page or auto-login
```

## Implementation Steps

### Backend Changes

#### 1. Add Email Confirmation Fields to User Model

```csharp
public class ApplicationUser : IdentityUser<Guid>
{
    // Existing fields...
    
    public bool EmailConfirmed { get; set; } = false;
    public string? EmailConfirmationToken { get; set; }
    public DateTime? EmailConfirmationTokenExpiry { get; set; }
}
```

#### 2. Create DTOs

**RegisterRequest.cs**
```csharp
public class RegisterRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; }
    
    [Required]
    [Phone]
    public string PhoneNumber { get; set; }
    
    [Required]
    [MinLength(6)]
    public string Password { get; set; }
    
    [Required]
    public string FullName { get; set; }
}
```

**ConfirmEmailRequest.cs**
```csharp
public class ConfirmEmailRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; }
    
    [Required]
    public string Token { get; set; }
}
```

#### 3. Add Controller Endpoints

**AuthController.cs**
```csharp
[HttpPost("register")]
[AllowAnonymous]
public async Task<IActionResult> Register([FromBody] RegisterRequest request)
{
    try
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var result = await authService.RegisterAsync(request);
        
        if (!result.Success)
        {
            return BadRequest(result);
        }
        
        // Return success without tokens (user needs to confirm email)
        return Ok(new 
        { 
            success = true, 
            message = "Registration successful! Please check your email to confirm your account." 
        });
    }
    catch (AppException ex)
    {
        return BadRequest(ex.Message);
    }
    catch (Exception ex)
    {
        exceptionHandler.RaiseException(ex);
        return BadRequest("An internal error occurred");
    }
}

[HttpGet("confirm-email")]
[AllowAnonymous]
public async Task<IActionResult> ConfirmEmail([FromQuery] string email, [FromQuery] string token)
{
    try
    {
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(token))
        {
            return BadRequest("Email and token are required");
        }
        
        var result = await authService.ConfirmEmailAsync(email, token);
        
        if (!result.Success)
        {
            return BadRequest(result);
        }
        
        // Option 1: Return success message (user needs to login manually)
        return Ok(new 
        { 
            success = true, 
            message = "Email confirmed successfully! You can now login." 
        });
        
        // Option 2: Auto-login after confirmation
        // if (result.Data is LoginResponse loginData)
        // {
        //     SetAuthCookies(loginData);
        //     return Ok(result);
        // }
    }
    catch (AppException ex)
    {
        return BadRequest(ex.Message);
    }
    catch (Exception ex)
    {
        exceptionHandler.RaiseException(ex);
        return BadRequest("An internal error occurred");
    }
}

[HttpPost("resend-confirmation-email")]
[AllowAnonymous]
public async Task<IActionResult> ResendConfirmationEmail([FromBody] ResendConfirmationEmailRequest request)
{
    try
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var result = await authService.ResendConfirmationEmailAsync(request.Email);
        
        if (!result.Success)
        {
            return BadRequest(result);
        }
        
        return Ok(new 
        { 
            success = true, 
            message = "Confirmation email sent! Please check your inbox." 
        });
    }
    catch (AppException ex)
    {
        return BadRequest(ex.Message);
    }
    catch (Exception ex)
    {
        exceptionHandler.RaiseException(ex);
        return BadRequest("An internal error occurred");
    }
}
```

#### 4. Implement Service Methods

**IAuthService.cs**
```csharp
public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> ConfirmEmailAsync(string email, string token);
    Task<AuthResponse> ResendConfirmationEmailAsync(string email);
}
```

**AuthService.cs**
```csharp
public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
{
    // 1. Check if email already exists
    var existingUser = await userManager.FindByEmailAsync(request.Email);
    if (existingUser != null)
    {
        return AuthResponse.FailureResponse("Email already registered");
    }
    
    // 2. Check if phone already exists
    var existingPhone = await userManager.Users
        .FirstOrDefaultAsync(u => u.PhoneNumber == request.PhoneNumber);
    if (existingPhone != null)
    {
        return AuthResponse.FailureResponse("Phone number already registered");
    }
    
    // 3. Create user
    var user = new ApplicationUser
    {
        Email = request.Email,
        UserName = request.Email,
        PhoneNumber = request.PhoneNumber,
        FullName = request.FullName,
        EmailConfirmed = false,
        EmailConfirmationToken = GenerateEmailConfirmationToken(),
        EmailConfirmationTokenExpiry = DateTime.UtcNow.AddHours(24)
    };
    
    var result = await userManager.CreateAsync(user, request.Password);
    
    if (!result.Succeeded)
    {
        return AuthResponse.FailureResponse(string.Join(", ", result.Errors.Select(e => e.Description)));
    }
    
    // 4. Assign Customer role
    await userManager.AddToRoleAsync(user, "Customer");
    
    // 5. Send confirmation email
    await SendConfirmationEmailAsync(user);
    
    return AuthResponse.SuccessResponse("Registration successful! Please check your email.");
}

public async Task<AuthResponse> ConfirmEmailAsync(string email, string token)
{
    // 1. Find user
    var user = await userManager.FindByEmailAsync(email);
    if (user == null)
    {
        return AuthResponse.FailureResponse("User not found");
    }
    
    // 2. Check if already confirmed
    if (user.EmailConfirmed)
    {
        return AuthResponse.FailureResponse("Email already confirmed");
    }
    
    // 3. Validate token
    if (user.EmailConfirmationToken != token)
    {
        return AuthResponse.FailureResponse("Invalid confirmation token");
    }
    
    // 4. Check token expiry
    if (user.EmailConfirmationTokenExpiry < DateTime.UtcNow)
    {
        return AuthResponse.FailureResponse("Confirmation token expired. Please request a new one.");
    }
    
    // 5. Confirm email
    user.EmailConfirmed = true;
    user.EmailConfirmationToken = null;
    user.EmailConfirmationTokenExpiry = null;
    
    await userManager.UpdateAsync(user);
    
    return AuthResponse.SuccessResponse("Email confirmed successfully!");
}

public async Task<AuthResponse> ResendConfirmationEmailAsync(string email)
{
    // 1. Find user
    var user = await userManager.FindByEmailAsync(email);
    if (user == null)
    {
        return AuthResponse.FailureResponse("User not found");
    }
    
    // 2. Check if already confirmed
    if (user.EmailConfirmed)
    {
        return AuthResponse.FailureResponse("Email already confirmed");
    }
    
    // 3. Generate new token
    user.EmailConfirmationToken = GenerateEmailConfirmationToken();
    user.EmailConfirmationTokenExpiry = DateTime.UtcNow.AddHours(24);
    
    await userManager.UpdateAsync(user);
    
    // 4. Send email
    await SendConfirmationEmailAsync(user);
    
    return AuthResponse.SuccessResponse("Confirmation email sent!");
}

private string GenerateEmailConfirmationToken()
{
    return Convert.ToBase64String(Guid.NewGuid().ToByteArray())
        .Replace("+", "")
        .Replace("/", "")
        .Replace("=", "");
}

private async Task SendConfirmationEmailAsync(ApplicationUser user)
{
    var confirmationLink = $"{frontendUrl}/confirm-email?email={user.Email}&token={user.EmailConfirmationToken}";
    
    var emailBody = $@"
        <h2>Welcome to RestX!</h2>
        <p>Hi {user.FullName},</p>
        <p>Thank you for registering. Please confirm your email address by clicking the link below:</p>
        <p><a href='{confirmationLink}'>Confirm Email</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
    ";
    
    await emailService.SendEmailAsync(user.Email, "Confirm Your Email", emailBody);
}
```

#### 5. Update Login to Check Email Confirmation

```csharp
public async Task<AuthResponse<LoginResponse>> LoginAsync(LoginRequest request)
{
    var user = await userManager.FindByEmailAsync(request.Email);
    
    if (user == null)
    {
        return AuthResponse<LoginResponse>.FailureResponse("Invalid credentials");
    }
    
    // Check email confirmation
    if (!user.EmailConfirmed)
    {
        return AuthResponse<LoginResponse>.FailureResponse("Please confirm your email before logging in");
    }
    
    // Continue with normal login flow...
}
```

### Frontend Changes

#### 1. Update AuthService

```typescript
// lib/services/authService.ts

async register(data: RegisterRequest): Promise<RegisterResponse> {
  try {
    // Use new endpoint that requires email confirmation
    const response = await axiosInstance.post<any>('/auth/register', data);
    
    // Backend returns success message without tokens
    return {
      requireLogin: true,
      requireEmailConfirmation: true,
      message: response.data.message || 'Please check your email to confirm your account.',
    };
  } catch (error: any) {
    // Handle errors...
    throw error;
  }
}

async confirmEmail(email: string, token: string): Promise<void> {
  try {
    const response = await axiosInstance.get<any>('/auth/confirm-email', {
      params: { email, token }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.message || 'Email confirmation failed');
    }
  } catch (error: any) {
    throw error;
  }
}

async resendConfirmationEmail(email: string): Promise<void> {
  try {
    const response = await axiosInstance.post<any>('/auth/resend-confirmation-email', { email });
    
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to resend confirmation email');
    }
  } catch (error: any) {
    throw error;
  }
}
```

#### 2. Create Email Confirmation Page

```typescript
// app/confirm-email/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import authService from '@/lib/services/authService';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function ConfirmEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  
  const email = searchParams.get('email');
  const token = searchParams.get('token');
  
  useEffect(() => {
    if (!email || !token) {
      setStatus('error');
      setMessage('Invalid confirmation link');
      return;
    }
    
    confirmEmail();
  }, [email, token]);
  
  const confirmEmail = async () => {
    try {
      await authService.confirmEmail(email!, token!);
      setStatus('success');
      setMessage('Email confirmed successfully! You can now login.');
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'Email confirmation failed');
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="max-w-md w-full p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Confirming your email...</h2>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <h2 className="text-xl font-semibold mb-2">Email Confirmed!</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <Button onClick={() => router.push('/login')} className="w-full">
              Go to Login
            </Button>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="text-red-500 text-5xl mb-4">✗</div>
            <h2 className="text-xl font-semibold mb-2">Confirmation Failed</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <Button onClick={() => router.push('/register')} variant="outline" className="w-full">
              Back to Register
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
```

#### 3. Update Register Page

```typescript
// app/register/page.tsx

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  
  try {
    const result = await authService.register({
      email: formData.email,
      phoneNumber: formData.phone,
      password: formData.password,
      fullName: `${formData.firstName} ${formData.lastName}`,
    });
    
    if (result.requireEmailConfirmation) {
      // Show success message and redirect to check email page
      message.success(result.message || 'Please check your email to confirm your account');
      router.push(`/check-email?email=${encodeURIComponent(formData.email)}`);
    } else if (result.user) {
      // Auto-login (old flow)
      message.success('Registration successful!');
      router.push('/');
    }
  } catch (error: any) {
    message.error(error.message || 'Registration failed');
  } finally {
    setLoading(false);
  }
};
```

#### 4. Create Check Email Page

```typescript
// app/check-email/page.tsx

'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import authService from '@/lib/services/authService';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { App } from 'antd';

export default function CheckEmailPage() {
  const { message } = App.useApp();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [resending, setResending] = useState(false);
  
  const handleResend = async () => {
    if (!email) return;
    
    setResending(true);
    try {
      await authService.resendConfirmationEmail(email);
      message.success('Confirmation email sent! Please check your inbox.');
    } catch (error: any) {
      message.error(error.message || 'Failed to resend email');
    } finally {
      setResending(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="text-blue-500 text-5xl mb-4">📧</div>
        <h2 className="text-2xl font-semibold mb-2">Check Your Email</h2>
        <p className="text-gray-600 mb-6">
          We've sent a confirmation email to <strong>{email}</strong>. 
          Please click the link in the email to confirm your account.
        </p>
        
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Didn't receive the email?
          </p>
          <Button 
            onClick={handleResend} 
            variant="outline" 
            className="w-full"
            isLoading={resending}
          >
            Resend Confirmation Email
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

## Configuration

### Email Service Setup

Configure SMTP settings in `appsettings.json`:

```json
{
  "EmailSettings": {
    "SmtpServer": "smtp.gmail.com",
    "SmtpPort": 587,
    "SenderEmail": "noreply@restx.food",
    "SenderName": "RestX",
    "Username": "your-email@gmail.com",
    "Password": "your-app-password",
    "EnableSsl": true
  },
  "FrontendUrl": "https://demo.restx.food"
}
```

### Environment Variables

```env
# Frontend
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000

# Backend
FRONTEND_URL=http://localhost:3000
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## Testing

### Manual Testing

1. Register new user → Should receive email
2. Click confirmation link → Should confirm email
3. Try to login before confirmation → Should show error
4. Confirm email → Should allow login
5. Try to confirm again → Should show "already confirmed"
6. Request resend → Should receive new email

### Unit Tests

```csharp
[Fact]
public async Task Register_ShouldSendConfirmationEmail()
{
    // Arrange
    var request = new RegisterRequest { /* ... */ };
    
    // Act
    var result = await authService.RegisterAsync(request);
    
    // Assert
    Assert.True(result.Success);
    emailServiceMock.Verify(x => x.SendEmailAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Once);
}

[Fact]
public async Task ConfirmEmail_WithValidToken_ShouldConfirmEmail()
{
    // Arrange
    var user = CreateTestUser();
    var token = user.EmailConfirmationToken;
    
    // Act
    var result = await authService.ConfirmEmailAsync(user.Email, token);
    
    // Assert
    Assert.True(result.Success);
    Assert.True(user.EmailConfirmed);
}
```

## Migration Path

To migrate from auto-login to email confirmation:

1. Deploy backend with both endpoints (`/auth/customer/phone-register` and `/auth/register`)
2. Update frontend to use new `/auth/register` endpoint
3. Monitor for issues
4. After stable period, deprecate old endpoint
5. Remove old endpoint in next major version

## Security Considerations

1. **Token Expiry**: Tokens expire after 24 hours
2. **Token Uniqueness**: Each token is unique and single-use
3. **Rate Limiting**: Limit resend requests to prevent spam
4. **HTTPS Only**: Confirmation links should only work over HTTPS in production
5. **Email Validation**: Validate email format before sending
6. **Brute Force Protection**: Implement rate limiting on confirmation attempts

## References

- ASP.NET Core Identity Email Confirmation: https://docs.microsoft.com/en-us/aspnet/core/security/authentication/accconfirm
- SendGrid Email Service: https://sendgrid.com/docs/
- SMTP Configuration: https://docs.microsoft.com/en-us/dotnet/api/system.net.mail.smtpclient



