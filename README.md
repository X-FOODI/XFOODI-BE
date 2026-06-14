<div align="center">

<img src="./logo.png" alt="FoodX Logo" width="200" />

# 🍔 FoodX Backend API

**The Core API Server for FoodX — Multi-tenant Restaurant Management Platform**

[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF?style=flat-square&logo=githubactions)](#)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.x-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.x-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-5.x-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

[📖 API Docs](./docs/API.md) · [⚙️ Setup Guide](./docs/SETUP.md) · [🤝 Contributing](./docs/CONTRIBUTING.md) · [🏗️ Architecture](./docs/ARCHITECTURE.md)

</div>

---

## 📑 Table of Contents

1. [✨ Highlights](#-highlights)
2. [🏗️ Tech Stack](#️-tech-stack)
3. [🚀 Quick Start](#-quick-start)
4. [📚 Detailed Documentation](#-detailed-documentation)
5. [🤝 Contributing](#-contributing)
6. [📄 License](#-license)

---

## ✨ Highlights

- 🔐 **Advanced Authentication & Security** — Robust JWT-based auth integrated with Redis for efficient refresh token rotation, access token blacklisting, and secure session management.
- 🏢 **Multi-Tenancy Support** — Advanced data isolation and schema strategies using Prisma to seamlessly manage multiple restaurant tenants under a single unified platform.
- 🚀 **High Performance ORM** — Utilizes Prisma Client for strict type safety and optimized database interactions with PostgreSQL, replacing legacy triggers with efficient application-layer logic.
- 📧 **Integrated Email Services** — SendGrid integration for transactional emails, including registration confirmations, password resets, and notifications.
- 🛡️ **Enterprise Security** — Integrated rate-limiting against brute-force attacks, secure HTTP headers, CORS configurations, and separate secret keys for access/refresh tokens.
- 🔄 **Real-time Synchronization** — Scalable real-time event broadcasting architecture suitable for live order tracking and instant restaurant dashboard updates.
- ⚡ **Fully Type-Safe Ecosystem** — End-to-end type safety with TypeScript strict mode, preventing runtime errors and maximizing developer productivity.

---

## 🏗️ Tech Stack

| Component | Technology |
|---|---|
| **Runtime** | Node.js (≥ 20.x) |
| **Framework** | Express.js 5.x |
| **Language** | TypeScript 5.x |
| **Database ORM** | Prisma 6.x |
| **Relational DB** | PostgreSQL |
| **Caching & Auth** | Redis 5.x |
| **Security** | JWT, bcryptjs, CORS |
| **Mail Service** | SendGrid |

---

## 🚀 Quick Start

> System Requirements: **Node.js ≥ 20**, **PostgreSQL**, **Redis** (eviction policy must be `noeviction`).

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd XFoodi-BE
pnpm install
```

### 2. Environment Configuration

Copy the `.env.example` file to create a `.env` file (or `.env.local` depending on your environment):

```bash
cp .env.example .env
```

Update the necessary environment variables:
- `DATABASE_URL` (PostgreSQL connection string)
- `REDIS_URL`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `SENDGRID_API_KEY`

### 3. Database Migration

Run Prisma migrations to sync your schema with the database:

```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Start the Server

**Run in Development mode:**
```bash
pnpm run dev
```

**Run in Production mode:**
```bash
pnpm run build
pnpm start
```

---

## 📚 Detailed Documentation

All detailed documentation is organized in the `docs/` directory:

| Document | Description |
|---|---|
| [📖 **API Reference**](./docs/API.md) | Endpoint lists, API structures, request & response patterns |
| [⚙️ **Setup Guide**](./docs/SETUP.md) | Database initialization, Redis setup, and environment variables |
| [🏗️ **Architecture**](./docs/ARCHITECTURE.md) | Prisma schema design, multi-tenant strategies, auth flows |
| [🤝 **Contributing**](./docs/CONTRIBUTING.md) | Linting standards (ESLint/Prettier), and code quality rules |

---

## 🤝 Contributing

We enforce rigorous code quality standards. Please ensure you run the CI checks locally before submitting any Pull Request.

```bash
# Check for linting errors and type issues
pnpm run check
```

**Workflow Summary:**
1. Create a descriptive branch: `feature/<username>/<feature-name>`
2. Follow Conventional Commits format for your commits.
3. Keep the codebase clean and resolve ESLint warnings before merging.

---

## 📄 License

This project is proprietary and protected. It is designed specifically for the FoodX Platform ecosystem.

---

<div align="center">
  <sub>Built with ❤️ by the FoodX Backend Team</sub>
</div>

