# EduMate AI

A study companion for university students: organise subjects, upload course modules, and practise with flashcards, quizzes, Q&A and reviewer notes, while your progress is tracked automatically.

- **Frontend:** React 19, Vite, Tailwind CSS v4 (`src/`)
- **Backend:** Node.js + Express 5 (`server/`)
- **Database:** SQLite, using Node's built-in `node:sqlite`, so there is nothing to install or compile (`server/db/schema.sql`)
- **Auth:** bcrypt-hashed passwords and an httpOnly JWT session cookie
- **AI (optional):** Google Gemini (free tier) or Claude for the assistant and for generating study material from PDFs

## Requirements

- Node.js **22.13 or newer** (`node -v`)
- pnpm (`npm i -g pnpm`) or npm

## Run it locally

```bash
pnpm install          # or: npm install
pnpm dev:full         # starts the API (port 4000) and the website together
```

Open the URL Vite prints (default http://localhost:8443) and sign in with the demo account:

| Email | Password |
| --- | --- |
| `demo@university.edu` | `demo1234` |

Or click **Sign Up** to create your own account, which starts out empty.

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Website only (Vite). The API must be running separately. |
| `pnpm dev:api` | API only, restarts when files in `server/` change |
| `pnpm build` | Builds the website into `dist/` |
| `pnpm start` | Production: one server on `$PORT`/4000 that serves the site and the API |
| `pnpm db:reset` | Deletes the local database. The demo account is recreated on the next start. |

## Configuration

Copy `.env.example` to `.env`. All values are optional:

- `GEMINI_API_KEY` (free at https://aistudio.google.com/apikey) or `ANTHROPIC_API_KEY` + `AI_PROVIDER=anthropic`: turns on real AI answers in the Assistant and the **Generate with AI** action on modules (reviewer, flashcards and quiz questions). PDFs are sent to the model directly. Without a key, the Assistant answers by searching your own flashcards and notes, and you can still write material by hand.
- `JWT_SECRET`: if you leave it empty, a random secret is generated once and stored in `server/data/.session-secret`.
- `DATABASE_FILE`, `UPLOAD_DIR`: where data is stored (defaults are under `server/`).

## Deploying

Any host that runs Node 22.13+ and has **persistent disk** works: a VPS, Railway, Render with a disk, Fly.io with a volume, and so on.

```bash
pnpm install --prod=false
pnpm build
JWT_SECRET=<long random string> pnpm start
```

Make sure `server/data/` and `server/uploads/` (or your custom paths) are on persistent storage. Serverless hosts with read-only or temporary filesystems (Vercel, Netlify Functions) won't keep the SQLite file. Use a host with a disk, or swap in a hosted database.

Back up the site by copying `server/data/edumate.db` and `server/uploads/`.

## Database

The schema is in [`server/db/schema.sql`](server/db/schema.sql) and is applied automatically when the server starts.

| Table | Purpose |
| --- | --- |
| `users`, `user_settings` | Accounts, profile and notification preferences |
| `subjects` | A student's courses |
| `modules` | Uploaded files (stored on disk) and reviewer notes |
| `flashcards`, `flashcard_reviews` | Cards and each "I know this" / "Need to review" rating |
| `quiz_questions` | Multiple-choice question bank per module |
| `quiz_attempts`, `quiz_answers` | Every quiz / Q&A session and each answer (source of all analytics) |
| `study_sessions` | Time spent in Study Mode |
| `tasks`, `events` | To-do list and calendar |
| `chat_messages` | AI assistant history |
| `activities` | Recent-activity feed |

Every row belongs to a user, and every API query is scoped to the signed-in user, so students never see each other's data. Deleting an account cascades to all of that user's rows and files.

## API overview

All routes are under `/api` and use JSON, except uploads, which use `multipart/form-data`.

```
POST   /auth/signup | /auth/login | /auth/logout      GET /auth/me
PUT    /me   PUT /me/password   DELETE /me
GET    /subjects            POST /subjects            GET|PUT|DELETE /subjects/:id
GET    /subjects/:id/modules                          POST /subjects/:id/modules  (file upload)
GET|PUT|DELETE /modules/:id     GET /modules/:id/file  POST /modules/:id/generate
GET|POST /modules/:id/flashcards   DELETE /flashcards/:id   POST /flashcards/:id/review
GET|POST /modules/:id/questions    DELETE /questions/:id
POST   /attempts   POST /attempts/:id/answers   POST /attempts/:id/complete
POST   /sessions   POST /sessions/:id/end
GET|POST /tasks     PUT|DELETE /tasks/:id
GET|POST /events    PUT|DELETE /events/:id
GET|POST|DELETE /chat
GET    /dashboard   GET /performance?days=30   GET /ai/status
```

## Not included yet

- Password reset by email (needs an email provider such as Resend or SendGrid)
- Text extraction from DOCX/PPTX for AI generation (PDF and TXT work). Convert slides to PDF for the best results.

## Android app (Capacitor)

The Android app is a native shell that loads a running EduMate server, so login, uploads and file previews behave exactly like the website.

1. Start the server where the phone can reach it. For testing on your Wi-Fi: `pnpm build && pnpm start:lan` (`--lan` allows login over plain http; don't use it on a public server). Allow Node through Windows Firewall when asked.
2. Point the app at it and sync: `CAP_SERVER_URL=http://<your-PC-IPv4>:4000 pnpm cap:sync` (defaults to the value in `capacitor.config.ts`). For a deployed server use its `https://` URL.
3. `pnpm android` opens Android Studio → Run ▶. In Android Studio, set **Settings → Build Tools → Gradle → Gradle JDK** to JDK 21. The bundled JDK 25 is too new for this Gradle version.

A debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
