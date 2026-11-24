-- Adults who signed up before emails were confirmed (D-098) keep working: the
-- lab was not deployed then, so these are development and test accounts only.
UPDATE "users" SET "email_verified_at" = "created_at"
WHERE "kind" = 'adult' AND "email" IS NOT NULL AND "email_verified_at" IS NULL;
