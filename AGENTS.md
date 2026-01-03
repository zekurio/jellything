# AGENTS.md

## Commands

- `bun dev` - Start dev server at localhost:3000
- `bun build` - Production build
- `bun lint` - Lint with oxlint (not ESLint)
- `bun format` - Format with oxfmt (not Prettier)
- `bun db:generate` / `bun db:migrate` / `bun db:push` / `bun db:studio` - Drizzle migrations

## Code Style

- **TypeScript**: Strict mode. Explicit types for function params/returns.
- **Imports**: Use `@/*` path alias (e.g., `@/lib/utils`, `@/components/ui/button`).
- **Components**: Function declarations (`function Button() {}`), not arrow functions.
- **Naming**: camelCase for variables/functions, PascalCase for types/components.
- **Server Actions**: `"use server"` directive, return `ActionResult<T>` via `success()`/`error()` from `@/app/actions/types`.
- **Client Components**: `"use client"` directive at file top.
- **Validation**: Zod 4 schemas from `@/lib/schemas` (use `.required()` not `.nonempty()`).
- **Styling**: Tailwind CSS 4 with `cn()` helper for class merging.
- **UI Components**: shadcn/ui (new-york) in `components/ui/`.
- **Database**: Drizzle ORM, schema in `server/db/schema.ts`. Use `$inferSelect`/`$inferInsert` for types.
- **Error Handling**: Wrap async in try/catch; return `error("message")` for failures.
- **Security**: Never log/expose decrypted access tokens. Use `getAdminStatus(session)` for admin checks.
