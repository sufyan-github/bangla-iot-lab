ALTER TABLE "users" ADD COLUMN "sign_in_key_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sign_in_key_hash_unique" UNIQUE("sign_in_key_hash");