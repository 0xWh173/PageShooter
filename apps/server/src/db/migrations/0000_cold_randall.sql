CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(32) NOT NULL,
	"password_hash" text,
	"google_sub" varchar(128),
	"avatar_id" varchar(64) DEFAULT 'barnaby' NOT NULL,
	"username_updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (LOWER("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (LOWER("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_idx" ON "users" USING btree ("google_sub");