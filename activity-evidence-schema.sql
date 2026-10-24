ALTER TABLE activity_submissions ADD COLUMN duration_minutes INTEGER;
ALTER TABLE activity_submissions ADD COLUMN before_photo TEXT;
ALTER TABLE activity_submissions ADD COLUMN after_photo TEXT;

CREATE INDEX IF NOT EXISTS activity_submissions_duration_idx
    ON activity_submissions(duration_minutes);
