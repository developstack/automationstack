-- 维护人为空的用例：维护人改为创建者，即最早一个版本的保存人。只填空值，不改 updated_at。
UPDATE "test_cases"
SET "maintainer" = "first_version"."saved_by"
FROM (
	SELECT DISTINCT ON ("case_id") "case_id", "saved_by"
	FROM "case_versions"
	WHERE "saved_by" IS NOT NULL AND btrim("saved_by") <> ''
	ORDER BY "case_id", "version"
) AS "first_version"
WHERE "first_version"."case_id" = "test_cases"."id"
	AND ("test_cases"."maintainer" IS NULL OR btrim("test_cases"."maintainer") = '');
