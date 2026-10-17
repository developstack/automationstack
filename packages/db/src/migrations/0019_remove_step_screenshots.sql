-- 删除已有的步骤截图（#74，ADR 0005）。这个迁移可以重复执行：第二次执行不改变数据。
-- 1. 创建 step_screenshot_purge。R2 清理脚本从这张表读取要删除的对象键。
-- 2. 删除只被步骤截图引用的 case_attachments 行，并先把它们的对象键复制到 step_screenshot_purge。
--    文字中用 ![](attachment:<uuid>) 引用的附件不删除。检查的文字是 test_cases、case_versions、
--    test_runs、test_run_cases、test_run_events 和 test_run_case_events 每一行的所有列
--    （to_jsonb(行)::text），不只是同一个用例。
--    JSON 文本不转义 ![]() 和 attachment: 中的字符，所以引用在 JSON 文本中保持原样。
-- 3. 从 test_cases.steps 和 case_versions.snapshot 的每个步骤中删除 screenshots 键。
--    这两步只改这两列，不改其他列。
CREATE TABLE IF NOT EXISTS "step_screenshot_purge" (
	"attachment_id" uuid PRIMARY KEY NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"storage_key" text NOT NULL
);
--> statement-breakpoint
WITH "case_steps" AS (
	SELECT "step"
	FROM "test_cases" AS "tc"
	CROSS JOIN LATERAL jsonb_array_elements("tc"."steps") AS "e"("step")
	WHERE jsonb_typeof("tc"."steps") = 'array'
	UNION ALL
	SELECT "step"
	FROM "case_versions" AS "cv"
	CROSS JOIN LATERAL jsonb_array_elements("cv"."snapshot" -> 'steps') AS "e"("step")
	WHERE jsonb_typeof("cv"."snapshot" -> 'steps') = 'array'
),
"screenshot_refs" AS (
	SELECT DISTINCT lower("shot"."id") AS "id"
	FROM "case_steps" AS "cs"
	CROSS JOIN LATERAL jsonb_array_elements_text("cs"."step" -> 'screenshots') AS "shot"("id")
	WHERE jsonb_typeof("cs"."step" -> 'screenshots') = 'array'
),
"row_texts" AS (
	SELECT to_jsonb("t")::text AS "body" FROM "test_cases" AS "t"
	UNION ALL
	SELECT to_jsonb("t")::text FROM "case_versions" AS "t"
	UNION ALL
	SELECT to_jsonb("t")::text FROM "test_run_cases" AS "t"
	UNION ALL
	SELECT to_jsonb("t")::text FROM "test_runs" AS "t"
	UNION ALL
	SELECT to_jsonb("t")::text FROM "test_run_events" AS "t"
	UNION ALL
	SELECT to_jsonb("t")::text FROM "test_run_case_events" AS "t"
),
"text_refs" AS (
	SELECT DISTINCT lower("m"."found"[1]) AS "id"
	FROM "row_texts" AS "rt"
	CROSS JOIN LATERAL regexp_matches(
		"rt"."body",
		'!\[\]\(attachment:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)',
		'g'
	) AS "m"("found")
),
"doomed" AS (
	SELECT "ca"."id", "ca"."storage_key"
	FROM "case_attachments" AS "ca"
	WHERE "ca"."id"::text IN (SELECT "id" FROM "screenshot_refs")
		AND "ca"."id"::text NOT IN (SELECT "id" FROM "text_refs")
),
"queued" AS (
	INSERT INTO "step_screenshot_purge" ("attachment_id", "storage_key")
	SELECT "id", "storage_key" FROM "doomed"
	ON CONFLICT ("attachment_id") DO NOTHING
)
DELETE FROM "case_attachments"
WHERE "id" IN (SELECT "id" FROM "doomed");
--> statement-breakpoint
UPDATE "test_cases" AS "tc"
SET "steps" = (
	SELECT jsonb_agg(
		CASE WHEN jsonb_typeof("e"."step") = 'object' THEN "e"."step" - 'screenshots' ELSE "e"."step" END
		ORDER BY "e"."position"
	)
	FROM jsonb_array_elements("tc"."steps") WITH ORDINALITY AS "e"("step", "position")
)
WHERE jsonb_typeof("tc"."steps") = 'array'
	AND EXISTS (
		SELECT 1
		FROM jsonb_array_elements("tc"."steps") AS "s"("step")
		WHERE jsonb_typeof("s"."step") = 'object' AND "s"."step" ? 'screenshots'
	);
--> statement-breakpoint
UPDATE "case_versions" AS "cv"
SET "snapshot" = jsonb_set(
	"cv"."snapshot",
	'{steps}',
	(
		SELECT jsonb_agg(
			CASE WHEN jsonb_typeof("e"."step") = 'object' THEN "e"."step" - 'screenshots' ELSE "e"."step" END
			ORDER BY "e"."position"
		)
		FROM jsonb_array_elements("cv"."snapshot" -> 'steps') WITH ORDINALITY AS "e"("step", "position")
	)
)
WHERE jsonb_typeof("cv"."snapshot" -> 'steps') = 'array'
	AND EXISTS (
		SELECT 1
		FROM jsonb_array_elements("cv"."snapshot" -> 'steps') AS "s"("step")
		WHERE jsonb_typeof("s"."step") = 'object' AND "s"."step" ? 'screenshots'
	);
