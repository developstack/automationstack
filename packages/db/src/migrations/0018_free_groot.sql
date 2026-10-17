ALTER TYPE "public"."test_run_status" ADD VALUE 'voided';--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;