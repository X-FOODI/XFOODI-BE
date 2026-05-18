# Contribution Guidelines

Thank you for your interest in contributing source code to the FoodX backend system. Because this is a standard-scale project, we strictly conform to the following principles:

## 1. MANDATORY BRANCHING RULES

**Standard format**: `<type>/<username>/<short-description>`

**Allowed Branch Types**:
| Type | Usage |
|---|---|
| `feature/` | Developing brand new features |
| `bugfix/` | Fixing system bugs |
| `hotfix/` | Urgent fixes deploying straight to Production |
| `refactor/` | Code structure restructuring, logic optimization |
| `chore/` | Changes regarding configurations, dependencies, environment |
| `docs/` | Writing or updating Github/Wiki documentation |

**Git Workflow**:
1. Never push code directly to `develop/main`. A dedicated branch must be created for every task.
2. Upon completion, create a Pull Request (Merge Request) targeting `develop`.
3. Await Reviewer approval, CodeRabbit Bot checks, Merge execution, and then delete the original branch.

## 2. STRICT COMMIT MESSAGE RULES

**Standard Format (Conventional Commits)**: `<type>(scope): short description`

**Examples**:
- Adding a feature: `feat(auth): add google oauth login`
- Fixing booking module issue: `fix(order): prevent double processing`
- Updating package library: `chore: upgrade prisma to v6`

*❌ Strongly prohibited generic commit names like: `fix`, `update code`, `done task 5`, `123123`.*

## 3. PULL REQUEST (PR) CHECKLIST

- The PR title must adhere to the commit format (e.g., `feat(api): ...`).
- Provide a summary description detailing what you changed.
- Ensure the code passes linter checks without any red warnings. Command:
```bash
# MUST PASS before pushing code
pnpm run check
```

## 4. PRESERVATION CODING RULES (TYPESCRIPT & PRISMA)

- Fully utilize TypeScript properties for Interfaces/Types; **limit the use of type `any` as much as possible**.
- Never submit/commit files containing security information (`.env`, Actual API Keys).
- Leverage application-layer logic instead of creating manual database triggers whenever migrating schema structures via Prisma.



