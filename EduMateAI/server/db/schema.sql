-- =====================================================================
-- EduMate AI — database schema (SQLite)
-- Applied automatically on server start (idempotent: CREATE IF NOT EXISTS).
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name      TEXT    NOT NULL,
  last_name       TEXT    NOT NULL DEFAULT '',
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT    NOT NULL,
  university      TEXT    NOT NULL DEFAULT '',
  program         TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  study_reminders     INTEGER NOT NULL DEFAULT 1 CHECK (study_reminders IN (0,1)),
  upcoming_deadlines  INTEGER NOT NULL DEFAULT 1 CHECK (upcoming_deadlines IN (0,1)),
  weekly_summary      INTEGER NOT NULL DEFAULT 0 CHECK (weekly_summary IN (0,1))
);

-- ---------------------------------------------------------------------
-- Courses & learning material
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  code          TEXT    NOT NULL DEFAULT '',
  icon          TEXT    NOT NULL DEFAULT '',
  color         TEXT    NOT NULL DEFAULT '#DCFCE7',
  semester      TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);

CREATE TABLE IF NOT EXISTS modules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  file_name     TEXT    NOT NULL,             -- original name shown to the user
  stored_name   TEXT,                         -- name on disk in server/uploads (NULL for seeded demo rows)
  mime_type     TEXT    NOT NULL DEFAULT '',
  file_type     TEXT    NOT NULL DEFAULT '',  -- PDF / DOCX / PPTX / TXT ...
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  pages         INTEGER,
  status        TEXT    NOT NULL DEFAULT 'Ready to Study'
                CHECK (status IN ('Processing','Ready to Study','Failed')),
  reviewer      TEXT    NOT NULL DEFAULT '',  -- AI/hand-written study notes (markdown)
  uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_modules_subject ON modules(subject_id);

CREATE TABLE IF NOT EXISTS flashcards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id   INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question    TEXT    NOT NULL,
  answer      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flashcards_module ON flashcards(module_id);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  flashcard_id  INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result        TEXT    NOT NULL CHECK (result IN ('known','review')),
  reviewed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON flashcard_reviews(user_id, reviewed_at);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id      INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question       TEXT    NOT NULL,
  choices        TEXT    NOT NULL,            -- JSON array of strings
  correct_index  INTEGER NOT NULL,
  explanation    TEXT    NOT NULL DEFAULT '',
  topic          TEXT    NOT NULL DEFAULT 'General',
  difficulty     TEXT    NOT NULL DEFAULT 'Medium' CHECK (difficulty IN ('Easy','Medium','Hard')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_module ON quiz_questions(module_id);

-- ---------------------------------------------------------------------
-- Learning activity / analytics
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id    INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  module_id     INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  mode          TEXT    NOT NULL DEFAULT 'quiz' CHECK (mode IN ('quiz','qa')),
  difficulty    TEXT    NOT NULL DEFAULT 'Medium',
  score         INTEGER NOT NULL DEFAULT 0,   -- number correct
  total         INTEGER NOT NULL DEFAULT 0,   -- number answered
  started_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id, completed_at);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id    INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id   INTEGER REFERENCES quiz_questions(id) ON DELETE SET NULL,
  topic         TEXT    NOT NULL DEFAULT 'General', -- copied so analytics survive question deletion
  chosen_index  INTEGER,
  answer_text   TEXT,
  is_correct    INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  answered_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON quiz_answers(attempt_id);

CREATE TABLE IF NOT EXISTS study_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id        INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  module_id         INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  started_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  ended_at          TEXT,
  duration_minutes  REAL    NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON study_sessions(user_id, started_at);

CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id  INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('upload','quiz','reviewer','flashcards','subject','session')),
  text        TEXT    NOT NULL,
  meta        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id, created_at);

-- ---------------------------------------------------------------------
-- Planner
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  due_date    TEXT,                                -- YYYY-MM-DD
  priority    TEXT    NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High')),
  done        INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id        INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title             TEXT    NOT NULL,
  event_date        TEXT    NOT NULL,              -- YYYY-MM-DD
  event_time        TEXT    NOT NULL DEFAULT '10:00',
  duration_minutes  INTEGER NOT NULL DEFAULT 60,
  type              TEXT    NOT NULL DEFAULT 'Study' CHECK (type IN ('Study','Exam','Assignment','Reminder')),
  notes             TEXT    NOT NULL DEFAULT '',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, event_date);

-- ---------------------------------------------------------------------
-- AI assistant
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id  INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  role        TEXT    NOT NULL CHECK (role IN ('user','ai')),
  content     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, id);
