# Project Web — NeoStats Hackathon

A locally runnable collaborative project-management platform built for the NeoStats Full Stack Engineering Hackathon. The app uses React + Vite for the frontend, Express for the API, and SQLite as a local relational database. SQLite is intentionally used to keep the project easy to run without a cloud service or a separate database installation.

## Features

- Login with four seeded roles: Admin, Project Manager, Team Member, and Viewer.
- Server-side authorization on protected API routes.
- Dashboard with project/task counts and progress.
- Create and archive projects (Admin); manage project members and their project-level roles.
- Create and assign tasks; change task status; delete tasks as an Admin/Project Manager.
- Task comments with author and timestamp; comment deletion is permission-checked by the API.
- Admin can create users, change global roles, edit names, and deactivate/reactivate accounts.
- Optimistic concurrency control: task updates include a version and stale updates return HTTP `409 Conflict`. The SQL update also checks the version atomically to avoid a lost update.
- Persistent local database, schema migration, and sample seed data.
- Responsive layout for desktop and mobile.

## Requirements

- Node.js 22 or later
- npm (included with Node.js)

No cloud database, backend-as-a-service, or deployment is required. The database file is created locally at `data/project-web.db`.

## Run on Windows, macOS, or Linux

1. Extract this repository ZIP.
2. Open a terminal in the extracted project folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. (Recommended) Copy `.env.example` to `.env` and set a long random `JWT_SECRET`. The fallback secret is for local development only.
5. Start the frontend and API together:

   ```bash
   npm run dev
   ```

6. Open **http://localhost:5173**.

The frontend runs on port `5173`; the Express API runs on port `3001`. Vite proxies `/api` calls to the API. Check the API at **http://localhost:3001/api/health**.

For a production build of the frontend, run `npm run build`. To run only the API, use `npm start`.

## Demo accounts

Password for all seeded accounts: `password123`

| Role | Email |
|---|---|
| Admin | `admin@projectweb.local` |
| Project Manager | `manager@projectweb.local` |
| Team Member | `member@projectweb.local` |
| Viewer | `viewer@projectweb.local` |

Use the role buttons on the login screen to fill a demo account quickly. To test role isolation, sign in in a normal browser window and then use an incognito window for a different account.

## Reset demo data

Stop the app, delete `data/project-web.db`, and start `npm run dev` again. The schema is applied and sample accounts/projects/tasks are seeded automatically on startup when the database is empty.

## Architecture

- `src/main.jsx`: React application, login, dashboard, projects, tasks, team, and dialogs.
- `src/style.css`: responsive UI styles.
- `server/index.js`: Express API, JWT authentication, authorization checks, validation, CRUD, and conflict detection.
- `server/migrations/001_init.sql`: schema for `users`, `projects`, `project_members`, `tasks`, and `comments`.
- `.env.example`: environment variable template.

### Data model

- `users`: account identity, password hash, global role, active flag.
- `projects`: project details, creator, status, archive flag.
- `project_members`: project membership and project-level role.
- `tasks`: project, title, description, status, assignee, due date, and version.
- `comments`: task discussion and author.

### Authorization and concurrent edits

The frontend conditionally shows actions for usability, but the API independently checks the current user's role and project membership. Do not treat hidden buttons as security. Each task update must send the version it read. The server compares the requested version and performs an atomic `UPDATE ... WHERE id = ? AND version = ?`; if the version is stale, it returns `409 Conflict` so the client can refresh and review the latest task.

## Useful API routes

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/:id/archive`
- `GET /api/projects/:id/members`, `POST /api/projects/:id/members`, `DELETE /api/projects/:id/members/:userId`
- `GET /api/tasks`, `POST /api/tasks`, `GET /api/tasks/:id`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`
- `GET /api/tasks/:id/comments`, `POST /api/tasks/:id/comments`, `DELETE /api/comments/:id`
- `GET /api/team`, `POST /api/users`, `PATCH /api/users/:id`

## Before submission

- Run `npm install` and `npm run build` successfully on your laptop.
- Start the app and test all four demo roles.
- Test task conflict handling with two browser sessions.
- Push the final working code to GitHub and verify the latest commit is present.
- Be ready to explain the schema, server-side role checks, and `409 Conflict` handling. AI tools are allowed, but the hackathon brief expects you to understand the code you submit.

## Important note

This is a hackathon MVP, not a production-ready service. The demo accounts and password are intentionally simple. Set a strong local `JWT_SECRET` and do not reuse the demo credentials for real data.
