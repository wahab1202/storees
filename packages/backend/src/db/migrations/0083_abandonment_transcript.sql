-- Optional call transcript/recording attached to an abandonment note (the exec
-- team uploads the recording or transcript of the follow-up call).
ALTER TABLE cart_abandonment_notes
  ADD COLUMN IF NOT EXISTS transcript_url  text,
  ADD COLUMN IF NOT EXISTS transcript_name varchar(300);
