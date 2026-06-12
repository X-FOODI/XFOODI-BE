# Setup & Configuration Guide

## System Requirements

Before getting started, ensure that your system has the following installed:
- **Node.js**: Version 20.x or higher
- **PostgreSQL**: Version 16.x or higher
- **Redis**: Version 5.x or higher (IMPORTANT: Eviction policy must be set to `noeviction` to protect queue reliability)
- **Git** to clone the repository.

## Installation Steps

### 1. Install Dependencies

Navigate to the application folder and run:
```bash
pnpm install
```

### 2. Environment Setup

Copy your `.env.example` file to `.env`:
```bash
cp .env.example .env
```
_(The `.env` file should never be committed to Github to protect absolute data security)._

### Essential Environment Variables

**Required Configurations:**
| Variable | Description |
|---|---|
| `PORT` | The port the HTTP Server will listen to (e.g. 5000) |
| `DATABASE_URL` | PostgreSQL connection string for Prisma |
| `REDIS_URL` | Redis instance connection (Eviction policy must be set to `noeviction`) |
| `JWT_ACCESS_SECRET` | Secret key for access token |
| `JWT_REFRESH_SECRET` | Secret key for refresh token |
| `SENDGRID_API_KEY` | API key to trigger SendGrid emails |

## 3. Database Initialization
```bash
npx prisma generate
npx prisma migrate dev
```

## 4. Redis Configuration

The BullMQ queue processor and token blacklist require Redis to store state reliably. Under memory pressure, Redis must not evict keys, or the queue jobs will be lost.

Ensure that the eviction policy is set to `noeviction`:
- Open your `redis.conf` and set:
  ```conf
  maxmemory-policy noeviction
  ```
- Or dynamically update it in `redis-cli`:
  ```bash
  config set maxmemory-policy noeviction
  ```

## 5. Running the Application

```bash
# Development: Run the dev server with file watching and auto hot-reload
pnpm run dev

# Production: Code must be transpiled to Javascript before running
pnpm run build
pnpm start
```



