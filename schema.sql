CREATE TABLE IF NOT EXISTS activity_submissions (
    id TEXT PRIMARY KEY,
    profile_name TEXT NOT NULL,
    profile_email TEXT NOT NULL,
    title TEXT NOT NULL,
    organization TEXT NOT NULL,
    hours REAL NOT NULL,
    activity_date TEXT NOT NULL,
    notes TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    approval_token_hash TEXT NOT NULL UNIQUE,
    submission_token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS activity_submissions_status_idx
    ON activity_submissions(status);
