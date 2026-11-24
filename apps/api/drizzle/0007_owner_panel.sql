CREATE TYPE "public"."school_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "status" "school_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;