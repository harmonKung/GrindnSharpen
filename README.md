# GrindnSharpen
Full stack fitness app. Personalized bodybuilding routines based on user's goals and information while using AI.

stack
    frontend - react, typescript, vite
    backend - node.js, express, typescript
    database - postgresql
    auth - jwt
    ai - openai
    infra - docker, deployable to aws/render/railway/fly.io


quick start using docker
git clone <your repo>
cd grindnsharpen

# create your backend .env
    cp backend/.env.example backend/.env

local setup
    npm install
    cp .env.example .env
    npm run db:migrate
    npm run dev

frontend setup
    cd frontend
    npm install
    npm run dev

local URLs
    backend health - http://localhost:4000/health
    frontend - http://localhost:5173

notes
    keep .env private and only commit .env.example
    make sure PostgreSQL is running before npm run db:migrate

