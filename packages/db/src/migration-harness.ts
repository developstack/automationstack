import { readFileSync } from "node:fs";

import type { PGlite } from "@electric-sql/pglite";

/** 测试用：在内存数据库（PGlite）中按顺序执行仓库中的迁移文件。 */

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

interface JournalEntry {
	tag: string;
}

function journalTags(): string[] {
	const journal = JSON.parse(
		readFileSync(new URL("meta/_journal.json", MIGRATIONS_DIR), "utf8")
	) as { entries: JournalEntry[] };
	return journal.entries.map((entry) => entry.tag);
}

/** 执行一个迁移文件。drizzle-kit 用 statement-breakpoint 分开语句，这里也一条一条执行。 */
export async function runMigration(db: PGlite, tag: string): Promise<void> {
	const content = readFileSync(new URL(`${tag}.sql`, MIGRATIONS_DIR), "utf8");
	for (const statement of content.split(STATEMENT_BREAKPOINT)) {
		if (statement.trim() !== "") {
			// biome-ignore lint/performance/noAwaitInLoops: 迁移中的语句必须按顺序执行
			await db.exec(statement);
		}
	}
}

/** 按顺序执行仓库中的所有迁移。 */
export async function migrateAll(db: PGlite): Promise<void> {
	for (const tag of journalTags()) {
		// biome-ignore lint/performance/noAwaitInLoops: 迁移必须按顺序执行
		await runMigration(db, tag);
	}
}

/** 执行 tag 之前的所有迁移，不执行 tag 本身。 */
export async function migrateUpTo(db: PGlite, tag: string): Promise<void> {
	const tags = journalTags();
	const end = tags.indexOf(tag);
	if (end === -1) {
		throw new Error(`迁移 ${tag} 不在 _journal.json 中`);
	}
	for (const earlier of tags.slice(0, end)) {
		// biome-ignore lint/performance/noAwaitInLoops: 迁移必须按顺序执行
		await runMigration(db, earlier);
	}
}
