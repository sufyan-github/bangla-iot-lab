CREATE TYPE "public"."progress_outcome" AS ENUM('step-done', 'lesson-done');--> statement-breakpoint
CREATE TABLE "lesson_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "progress_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"step" integer NOT NULL,
	"outcome" "progress_outcome" NOT NULL,
	"client_event_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_events_client_event_id_unique" UNIQUE("client_event_id"),
	CONSTRAINT "progress_events_step_positive" CHECK ("progress_events"."step" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lesson_assignments" ADD CONSTRAINT "lesson_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_assignments_class_idx" ON "lesson_assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "progress_events_learner_idx" ON "progress_events" USING btree ("learner_id","lesson_id");