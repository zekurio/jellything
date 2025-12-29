# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jellything is a user management and invitation system for Jellyfin. It uses Next.js (App Router) for the frontend and Elysia for the backend API, with Eden providing type-safe API calls between them.

**Tech Stack:**

- Next.js 16 (React 19, App Router)
- Elysia (backend API framework)
- Drizzle ORM + PostgreSQL
- Tailwind CSS 4 + shadcn/ui (new-york style)
- TypeScript (strict mode)
- oxlint + oxfmt (linting & formatting)

## Commands

```bash
bun dev          # Start development server (localhost:3000)
bun run build    # Production build
bun run lint     # Run oxlint
bun run format   # Format code with oxfmt
```

### Database

```bash
bun run db:generate  # Generate Drizzle migrations from schema changes
bun run db:migrate   # Apply pending migrations
bun run db:push      # Push schema directly (development only)
bun run db:studio    # Open Drizzle Studio for database inspection
```

## Architecture

### API Pattern (Elysia + Eden)

The backend API runs inside Next.js via a catch-all route:

- **API definition**: `app/api/[[...slugs]]/route.ts` - Elysia app with `/api` prefix, exports `App` type
- **Client**: `lib/eden.ts` - Type-safe Eden treaty client that imports the `App` type

When adding new API routes, define them in the Elysia app and the types flow automatically to the frontend via Eden.

### Auth & Sessions

- Auth validates against Jellyfin's AuthenticateByName endpoint, then creates DB-backed sessions
- **User tokens are stored encrypted** in sessions for user-specific operations (change password, update profile)
- Admin operations use a single server-level API key
- Sessions store user ID, encrypted access token, admin status, and admin status verification timestamp (60s TTL)
- Admin status is fetched from Jellyfin user policy and cached with short TTL

### Jellyfin Integration

**No proxying** - Direct Jellyfin URLs are used for assets (avatars, images).

**Module structure** (`server/jellyfin/`):

- `client.ts` - Base SDK configuration, API instance creation
- `admin.ts` - Admin operations using server API key (user management, policies, etc.)
- `user.ts` - User operations using user's access token (change password, update profile)
- `index.ts` - Re-exports all public APIs

**Security**:

- Access tokens encrypted at rest using AES-256-GCM (`server/crypto.ts`)
- Encryption key from `ENCRYPTION_KEY` env var (32 bytes hex)

### API Routes

```
/api
├── /auth
│   ├── POST /login              # Public - creates encrypted session
│   ├── POST /logout             # Authenticated
│   └── GET  /me                 # Authenticated
├── /server
│   └── GET  /info               # Public
├── /admin/users                 # Admin only (withAdmin middleware)
│   ├── GET  /                   # List all users (includes avatarUrl)
│   ├── GET  /libraries          # List media libraries
│   ├── GET  /:userId            # Get user details
│   ├── GET  /:userId/policy     # Get user policy
│   ├── PATCH /:userId/policy    # Update user policy
│   ├── DELETE /:userId          # Delete user
│   ├── POST /bulk/policy        # Bulk policy update
│   └── DELETE /bulk             # Bulk delete
├── /admin/invites               # Admin only
│   ├── GET  /                   # List all invites
│   ├── GET  /history            # Invite usage history
│   ├── POST /                   # Create invite
│   └── DELETE /:id              # Delete invite
├── /user/profile                # Authenticated (withUserApi middleware)
│   ├── GET  /                   # Get own profile
│   ├── PATCH /                  # Update own name
│   └── POST /password           # Change password
├── /user/profiles               # User-managed profiles
│   ├── GET  /                   # List own profiles
│   ├── GET  /:id                # Get profile details
│   ├── POST /                   # Create profile
│   ├── PATCH /:id               # Update profile
│   └── DELETE /:id              # Delete profile
└── /invite/:code               # Public invite registration
    └── GET  /                   # Check invite validity
    └── POST /                   # Register using invite
```

### Frontend Pages

**Public Routes:**

- `/` - Landing page
- `/login` - Login form (authenticates against Jellyfin)
- `/invite/:code` - Registration via invite link
- `/verify-email/:token` - Email verification
- `/reset-password/:token` - Password reset
- `/forgot-password` - Request password reset

**Protected Routes (require authentication):**

- `/dashboard` - Main dashboard
- `/dashboard/users` - User management list
- `/dashboard/users/:id` - Individual user details & settings
- `/dashboard/profiles` - Profile management
- `/dashboard/profiles/:id` - Profile details
- `/dashboard/invites` - Invite management
- `/dashboard/invites/history` - Invite usage history
- `/dashboard/settings` - Settings (profile, quotas, server)

**Components Organization:**

- `components/layout/` - Navigation, sidebar, header
- `components/users/` - User management UI (table, settings dialogs)
- `components/invites/` - Invite management (forms, tables)
- `components/profiles/` - Profile management UI
- `components/settings/` - Settings tabs (profile, quotas, server)
- `components/ui/` - shadcn/ui base components
- `components/shared/` - Cross-cutting components (theme provider)

## Project Structure

```
jellything/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard layout group
│   │   ├── dashboard/            # Main dashboard page
│   │   ├── invites/              # Invite management
│   │   │   ├── history/          # Invite usage history
│   │   │   └── page.tsx          # Invite list & create
│   │   ├── profiles/             # Profile management
│   │   │   ├── [id]/             # Profile details
│   │   │   └── page.tsx          # Profile list
│   │   ├── settings/             # Settings pages
│   │   │   └── page.tsx          # Settings tabs
│   │   ├── users/                # User management
│   │   │   ├── [id]/             # User details
│   │   │   └── page.tsx          # Users list
│   │   └── layout.tsx            # Dashboard layout with sidebar
│   ├── actions/                  # Server actions (Next.js)
│   │   ├── admin/                # Admin operations
│   │   ├── auth.ts               # Auth actions
│   │   ├── email.ts              # Email sending
│   │   ├── index.ts              # Action exports
│   │   ├── invite.ts             # Invite actions
│   │   ├── password-reset.ts     # Password reset
│   │   ├── server.ts             # Server actions
│   │   └── types.ts              # Action types
│   ├── forgot-password/          # Forgot password page
│   ├── invite/
│   │   └── [code]/               # Invite registration
│   ├── login/                    # Login page
│   ├── reset-password/
│   │   └── [token]/              # Reset password page
│   ├── verify-email/
│   │   └── [token]/              # Email verification page
│   ├── api/
│   │   └── [[...slugs]]/         # Elysia API catch-all route
│   │       └── route.ts          # API entry point, exports App type
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── not-found.tsx             # 404 page
│
├── components/
│   ├── invites/                  # Invite components
│   │   ├── invite-form-dialog.tsx
│   │   ├── invite-history-table.tsx
│   │   └── invites-table.tsx
│   ├── layout/                   # Layout components
│   │   ├── app-sidebar.tsx       # Dashboard sidebar navigation
│   │   ├── nav-main.tsx          # Main navigation links
│   │   ├── nav-secondary.tsx     # Secondary navigation
│   │   ├── nav-user.tsx          # User menu dropdown
│   │   └── site-header.tsx       # Site header
│   ├── profiles/                 # Profile components
│   │   ├── profile-form-dialog.tsx
│   │   └── profiles-table.tsx
│   ├── settings/                 # Settings components
│   │   ├── profile-tab.tsx
│   │   ├── quotas-tab.tsx
│   │   └── server-settings-tab.tsx
│   ├── shared/                   # Shared components
│   │   └── theme-provider.tsx
│   ├── ui/                       # shadcn/ui components
│   └── users/                    # User components
│       ├── user-settings-dialog.tsx
│       └── users-table.tsx
│
├── server/
│   ├── auth.ts                   # Authentication logic
│   ├── crypto.ts                 # AES-256-GCM encryption utilities
│   ├── db/                       # Database
│   │   ├── index.ts              # Database connection
│   │   └── schema.ts             # Drizzle schema (users, sessions, invites, profiles)
│   ├── elysia/                   # Elysia API server
│   │   ├── app.ts                # Main Elysia app definition
│   │   ├── middleware.ts         # Auth middleware (withAuth, withAdmin, withUserApi)
│   │   └── controllers/
│   │       ├── admin/
│   │       │   ├── users.ts      # Admin user management routes
│   │       │   └── invites.ts    # Admin invite management routes
│   │       ├── auth.ts           # Authentication routes
│   │       ├── server.ts         # Server info routes
│   │       └── user/
│   │           └── profile.ts    # User profile routes
│   ├── email/                    # Email system
│   │   ├── index.ts              # Email sender
│   │   └── templates/            # Email templates
│   │       ├── layout.tsx
│   │       ├── password-reset.tsx
│   │       └── verify-email.tsx
│   ├── invite.ts                 # Invite logic & validation
│   ├── jellyfin/                 # Jellyfin SDK integration
│   │   ├── client.ts             # Base SDK configuration
│   │   ├── admin.ts              # Admin operations (server API key)
│   │   ├── user.ts               # User operations (user access token)
│   │   └── index.ts              # Public API exports
│   ├── session.ts                # Session management
│   └── tokens.ts                 # Token generation (email verification, password reset)
│
├── lib/
│   ├── auth.ts                   # Auth utilities
│   ├── eden.ts                   # Type-safe Eden API client
│   ├── env.ts                    # Environment validation
│   ├── schemas.ts                # Zod schemas (validation)
│   └── utils.ts                  # Utility functions (cn, etc.)
│
├── drizzle/                      # Database migrations
├── .env.example                  # Environment template
├── .envrc                        # Direnv config
├── .gitignore
├── .oxlintrc.json                # oxlint configuration
├── drizzle.config.ts             # Drizzle configuration
├── next.config.ts                # Next.js configuration
├── package.json
└── tsconfig.json
```

## Environment Variables

Required environment variables (see `.env.example`):

```bash
DATABASE_URL=postgres://...          # PostgreSQL connection string
JELLYFIN_URL=http://...              # Jellyfin server URL
JELLYFIN_API_KEY=...                 # Jellyfin admin API key
ENCRYPTION_KEY=...                   # 64-char hex key (openssl rand -hex 32)
SMTP_HOST=...                        # SMTP server for emails
SMTP_PORT=...                        # SMTP port
SMTP_USER=...                        # SMTP user
SMTP_PASS=...                        # SMTP password
FROM_EMAIL=...                       # From email address
```

## Database Schema

**users** table:

- `id` (uuid, primary key)
- `jellyfinUserId` (text, unique) - Maps to Jellyfin user ID
- `createdAt` (timestamp)

**sessions** table:

- `id` (text, primary key)
- `userId` (uuid, foreign key)
- `accessToken` (text, encrypted) - User's Jellyfin access token
- `isAdmin` (boolean)
- `adminCheckedAt` (timestamp) - Admin status cache (60s TTL)
- `expiresAt` (timestamp)

**invites** table:

- `id` (uuid, primary key)
- `code` (text, unique) - Invite code
- `maxUses` (integer) - Maximum number of uses
- `currentUses` (integer) - Current use count
- `expiresAt` (timestamp)
- `createdBy` (uuid, foreign key) - Admin who created it
- `createdAt` (timestamp)

**invite_usage** table:

- `id` (uuid, primary key)
- `inviteId` (uuid, foreign key)
- `userId` (uuid, foreign key)
- `usedAt` (timestamp)

**profiles** table:

- `id` (uuid, primary key)
- `userId` (uuid, foreign key) - Owner
- `name` (text) - Profile name
- `jellyfinUserId` (text) - Linked Jellyfin user
- `avatarUrl` (text, nullable)
- `createdAt` (timestamp)

## Code Style

- Uses oxlint for linting and oxfmt for formatting (2-space indent)
- TypeScript strict mode enabled
- Tabs for Elysia code (see existing route.ts)
- Path alias: `@/*` maps to project root
