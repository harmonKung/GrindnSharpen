# GrindnSharpen

GrindnSharpen is a Full stack fitness app. Personalized bodybuilding routines based on user's goals and information while using AI.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **Authentication:** JWT
- **Infrastructure:** Docker

OpenAI-powered routine generation is optional and uses validated structured output with an automatic rules-based fallback. Coaching chat and cloud deployment are planned future additions.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL 16+, either installed locally or run through Docker
- Docker Desktop, if using the included Compose configuration

From the repository root:

```bash
npm install
npm --prefix frontend install
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Update `.env` with your PostgreSQL password and secure JWT secrets.

Start only PostgreSQL with Docker:

```bash
docker compose -f src/docker-compose.yml up -d db
```

The Docker database uses `postgres` as its development password. Match that value in your local `.env`, then initialize the database:

```bash
npm run db:migrate
npm run db:seed
```

Run the backend and frontend in separate terminals:

```bash
npm run dev
```

```bash
npm --prefix frontend run dev
```

Open:

- Frontend: http://localhost:5173
- API health check: http://localhost:4000/health

## Current Features

- JWT authentication with access and refresh tokens
- Automatic access-token renewal with refresh-token rotation and logout revocation
- Editable training profiles with persistent kg/lb preferences
- Equipment-aware routine generation
- Optional AI routine generation with catalog validation and rules fallback
- Focused workout logging with reps, weight, and RIR
- Previous-performance targets and progressive-overload suggestions
- Workout history with deletion controls
- Body-weight check-ins, trends, and deletion controls
- Weekly training metrics, strength trends, and personal records
- Responsive desktop and mobile interface
- Isolated authentication, profile, workout, progress, and AI fallback test suites
- Frontend tests for measurement conversion, workout logging, and progress controls

## Environment Variables

Backend variables are documented in `.env.example`:

| Variable | Purpose |
| --- | --- |
| `PORT` | Express server port |
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `JWT_ACCESS_SECRET` | Access-token signing secret |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret |
| `FRONTEND_URL` | Allowed CORS origin |
| `OPENAI_API_KEY` | Optional OpenAI API key; rules fallback is used when blank |
| `OPENAI_MODEL` | OpenAI model used for structured routine generation |

The frontend uses `VITE_API_URL`, documented in `frontend/.env.example`.

## Useful Commands

```bash
npm run dev                 # Start the backend in development mode
npm run build               # Compile the backend
npm run db:migrate          # Apply schema.sql safely
npm run db:seed             # Seed the exercise catalog
npm test                    # Run backend API tests
npm run test:watch          # Run backend tests in watch mode
npm --prefix frontend run dev
npm --prefix frontend test
npm --prefix frontend run build
```

## Continuous Integration

GitHub Actions runs `.github/workflows/ci.yml` on every push and pull request. The backend and frontend jobs run in parallel:

- Backend: clean dependency install, automated tests, and TypeScript build
- Frontend: clean dependency install, component tests, and production Vite build

The CI tests use mocked database and AI providers, so they do not require PostgreSQL, private environment files, or OpenAI credits.

## Deployment: Render + Neon

Recommended low-cost portfolio setup:

- Render Static Site for the React frontend
- Render Web Service for the Express API
- Neon free PostgreSQL for the production database

The included `render.yaml` can be used as a Render Blueprint, or you can create both services manually in the Render dashboard.

### Backend Web Service

- Root directory: repository root
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/health`

Set these backend environment variables in Render:

```bash
NODE_ENV=production
DATABASE_URL=<your Neon pooled connection string>
JWT_ACCESS_SECRET=<long random secret>
JWT_REFRESH_SECRET=<different long random secret>
FRONTEND_URL=https://your-frontend.onrender.com
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

Leave `OPENAI_API_KEY` blank if you do not want to spend API credits. The app will use the rules-based routine generator.

### Frontend Static Site

- Root directory: repository root
- Build command: `cd frontend && npm ci && npm run build`
- Publish directory: `frontend/dist`

Set this frontend environment variable in Render:

```bash
VITE_API_URL=https://your-api.onrender.com
```

### Production Database Setup

After creating the Neon database and adding `DATABASE_URL` to Render, run the backend migrations and seed command from Render Shell or a trusted local terminal with the production `DATABASE_URL` set:

```bash
npm run db:migrate
npm run db:seed
```

Free Render web services may sleep after inactivity. The first request after a quiet period can take a few seconds to wake up.

## API Overview

All protected endpoints require `Authorization: Bearer <access-token>`.

- `/api/auth` - registration, login, refresh, logout, current user
- `/api/profile` - profile details and preferences
- `/api/routines` - generate and retrieve routines
- `/api/workouts` - start, log, complete, resume, delete, and list workouts
- `/api/progress` - dashboard summary, exercise history, and body-weight logs

## Project Structure

```text
frontend/        React and Vite client
src/controllers  Express request handlers
src/routes       API route definitions
src/services     Routine and progression logic
src/db           PostgreSQL connection and seed scripts
tests/           Isolated backend API tests
schema.sql       Idempotent database schema
```

## Security Notes

- Never commit `.env` files or real credentials.
- Use long, unique JWT secrets outside local development.
- Docker Compose defaults are for local development only.
- Rotate any credential that has previously been committed publicly.
