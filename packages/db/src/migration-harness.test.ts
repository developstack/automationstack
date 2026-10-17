import type { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

import { migrateUpTo } from "./migration-harness";

it("refuses a tag that the migration journal does not list", async () => {
	// 检查在执行任何语句之前，所以不需要真的数据库
	await expect(migrateUpTo({} as PGlite, "9999_unknown")).rejects.toThrow(
		"9999_unknown"
	);
});
