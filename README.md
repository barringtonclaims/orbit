# Orbit - Contact & Task Management

A mobile-responsive web app for salespeople and organizations to manage contacts/leads with automated task scheduling, M/W/F follow-up logic, and team collaboration features.

## Features

- **Contact Management**: Store all lead info, photos, documents, and notes in one organized timeline
- **Smart Task Scheduling**: Tasks auto-schedule to M/W/F so your week stays organized
- **Lead Stages**: Track leads from first contact through approval or seasonal follow-up
- **Message Templates**: Pre-composed SMS and email templates for quick follow-ups
- **Team Collaboration**: Role-based access for organizations with lead assignment
- **Mobile First**: PWA support for app-like experience on any device

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth
- **File Storage**: Supabase Storage

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Supabase account (free tier works)

### 1. Clone and Install

```bash
cd orbit-app
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API to get your credentials
3. Go to Project Settings → Database to get connection strings

### 3. Configure Environment

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Database URLs (from Supabase -> Project Settings -> Database)
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### 5. Configure Supabase Auth

In your Supabase Dashboard:

1. Go to Authentication → URL Configuration
2. Set Site URL to `http://localhost:3000` (or your domain)
3. Add `http://localhost:3000/auth/callback` to Redirect URLs

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
orbit-app/
├── prisma/
│   └── schema.prisma      # Database schema
├── public/
│   └── manifest.json      # PWA manifest
├── src/
│   ├── app/
│   │   ├── (auth)/        # Auth pages (login, signup, etc.)
│   │   ├── (dashboard)/   # Protected app pages
│   │   ├── auth/          # Auth callback routes
│   │   └── page.tsx       # Landing page
│   ├── components/
│   │   ├── layout/        # Layout components (sidebar, etc.)
│   │   └── ui/            # shadcn/ui components
│   └── lib/
│       ├── supabase/      # Supabase client utilities
│       ├── prisma.ts      # Prisma client
│       ├── scheduling.ts  # M/W/F task scheduling logic
│       └── utils.ts       # Utility functions
```

## M/W/F Scheduling Logic

Tasks are automatically scheduled to the nearest Monday, Wednesday, or Friday:

| Lead received on | Task scheduled for |
|-----------------|-------------------|
| Monday          | Wednesday         |
| Tuesday         | Wednesday         |
| Wednesday       | Friday            |
| Thursday        | Friday            |
| Friday          | Monday            |
| Saturday        | Monday            |
| Sunday          | Monday            |

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Add your environment variables in Vercel's dashboard
4. Deploy!

### Post-Deployment

1. Update your Supabase Auth URLs to use your production domain
2. Set up a custom domain (optional)

## License

Private - Barrington Dynamics
