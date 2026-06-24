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
- Isolated backend authentication and workout API test suites

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
npm --prefix frontend run build
```

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
