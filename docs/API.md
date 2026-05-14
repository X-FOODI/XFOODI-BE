# 📖 FoodX API Documentation

The FoodX API follows RESTful principles and emits structured JSON payloads.

## Global Headers
When querying protected endpoints, inject your Access Token:
```
Authorization: Bearer <Your_Access_Token>
```
If you are operating against tenant-specific routes, the system automatically checks your tenant claims inside the JWT.

## Standard Response Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

## Authentication Routes
- `POST /api/auth/login` - Authenticate users and yield Access + Refresh Tokens.
- `POST /api/auth/register` - Create a new user profile.
- `POST /api/auth/refresh` - Generate a new Access Token.
- `POST /api/auth/logout` - Invalidate current session and blacklist token.

## Tenant Routes
Tenant logic operations heavily depend on route prefixes or domain parsing (e.g. handled via the reverse proxy/frontend mapping to API). See the implementation inside `src/routes/` for granular documentation of specific entity paths like Orders, Menu, etc.
