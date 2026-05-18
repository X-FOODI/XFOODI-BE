# 🏗️ Backend Architecture

The FoodX Backend is engineered with Node.js, Express, and Prisma ORM, optimized for multi-tenant scalability and performance.

## 1. Multi-Tenant Database Strategy
Instead of segregating databases completely, FoodX leverages PostgreSQL Row-Level mapping alongside robust Application-Layer logic managed by **Prisma 6**. This replaces legacy `.NET` trigger paradigms with a type-safe API that enforces tenant isolation.

## 2. Authentication Flow (Redis + JWT)
- **Access Tokens**: Short-lived, used for resource authorization.
- **Refresh Tokens**: Long-lived, strictly maintained inside **Redis** with a TTL equivalent to the session expiry.
- **Logout Strategy**: When a user logs out, the Refresh Token is purged from Redis and the Access Token gets blacklisted to prevent malicious usage windows.

## 3. Email Infrastructure
All critical transactional emails (Verification, Password Resets) are asynchronously piped through the **SendGrid API** ensuring guaranteed delivery rates and robust template mapping.

## 4. Service-Oriented Project Structure
```
src/
├── controllers/    # Route controllers mapped directly to Express
├── services/       # Core business logic separated from HTTP transports
├── routes/         # Express endpoint definitions
├── middleware/     # Global auth, tenant checking, and error handling
├── prisma/         # Schema definitions and migration histories
└── lib/            # External integration clients (SendGrid, Redis)
```



