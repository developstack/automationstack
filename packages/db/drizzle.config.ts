import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: "../../apps/server/.env",
});

export default defineConfig({
	dbCredentials: {
		url: process.env.DATABASE_URL || "",
	},
	dialect: "postgresql",
	out: "./src/migrations",
	/**
	 * 指向 barrel 文件而**不是目录** `./src/schema`。
	 *
	 * 给目录时 drizzle-kit 会把目录下每个 `.ts` 都 `require()` 一遍，连
	 * `src/schema/*.test.ts` 也不放过——那些文件 import vitest，而 vitest 是
	 * ESM-only，于是 `pnpm db:generate` 直接崩在一条与 schema 毫无关系的
	 * CJS 报错上。barrel 已经导出了全部表，drizzle 也正需要这种聚合模块
	 * （`import * as schema`）来做查询类型推断。
	 */
	schema: "./src/schema/index.ts",
});
