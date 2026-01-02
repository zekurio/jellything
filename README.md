# Jellything

User management and invitation system for Jellyfin.

## Tech Stack

- Next.js 16 (React 19, App Router)
- Elysia (backend API framework)
- Drizzle ORM + PostgreSQL
- Tailwind CSS 4 + shadcn/ui (new-york style)
- TypeScript (strict mode)
- oxlint + oxfmt

## Prerequisites

- Bun >= 1.0
- PostgreSQL
- Jellyfin server with admin API key

## Setup

1. Clone the repository and install dependencies:

```bash
bun install
```

2. Copy the environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

- `DATABASE_URL` - PostgreSQL connection string
- `JELLYFIN_URL` - Your Jellyfin server URL
- `JELLYFIN_API_KEY` - Admin API key from Jellyfin
- `ENCRYPTION_KEY` - Generate with `openssl rand -hex 32`

3. Set up the database:

```bash
bun run db:push       # Push schema to database
# or
bun run db:migrate    # Run migrations
```

4. Start the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

```bash
bun dev               # Start development server
bun run build         # Build for production
bun run lint          # Run oxlint
bun run format        # Format code with oxfmt

# Database commands
bun run db:generate   # Generate migrations from schema changes
bun run db:migrate    # Apply pending migrations
bun run db:push       # Push schema directly (development only)
bun run db:studio     # Open Drizzle Studio
```

## Architecture

### API Pattern

Backend API runs inside Next.js via a catch-all route using Elysia. Type-safe API calls are provided through Eden treaty client.

- API definition: `app/api/[[...slugs]]/route.ts`
- API routes: `app/api/**/*.ts` (modular route files)
- Client: `lib/eden.ts`

### Authentication

Authentication validates against Jellyfin's API, creating database-backed sessions. User access tokens are encrypted at rest using AES-256-GCM.

- Admin operations use server-level API key
- User operations use encrypted access tokens
- Admin status cached with 60-second TTL

### Project Structure

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
│   ├── forgot-password/          # Request password reset email
│   ├── reset-password/           # Verify PIN and set new password
│   ├── invite/
│   │   └── [code]/               # Invite registration
│   ├── login/                    # Login page
│   ├── verify-email/
│   │   └── [token]/              # Email verification page
│   ├── api/
│   │   └── [[...slugs]]/         # Elysia API catch-all route
│   │       └── route.ts          # API entry point, exports App type
│   ├── auth.ts                   # Authentication logic
│   ├── crypto.ts                 # AES-256-GCM encryption utilities
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

## License

MIT
