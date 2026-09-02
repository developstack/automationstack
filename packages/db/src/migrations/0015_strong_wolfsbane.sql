CREATE TYPE "public"."farm_node_backend" AS ENUM('local', 'docker');--> statement-breakpoint
CREATE TABLE "farm_nodes" (
	"backend" "farm_node_backend" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone,
	"max_slots" integer DEFAULT 2 NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	CONSTRAINT "farm_nodes_name_uq" UNIQUE("name"),
	CONSTRAINT "farm_nodes_token_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "farm_sessions" ADD COLUMN "node_id" uuid;--> statement-breakpoint
ALTER TABLE "farm_sessions" ADD CONSTRAINT "farm_sessions_node_id_farm_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."farm_nodes"("id") ON DELETE set null ON UPDATE no action;