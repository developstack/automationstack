/**
 * 连库测试的引导器：**唯一**允许在 `packages/db` 的测试里建立真实连接的地方。
 *
 * ## 为什么需要它
 *
 * 根 `vitest.config.ts` 的 `db` project 不给任何环境变量，CI 的 `pnpm test` 同样
 * （那里的注释写得很明确：四个 project 全是纯函数、不连库）。绝大多数仓储逻辑
 * 也确实该按那条路走——把判据提成纯函数再测。
 *
 * 但有一类东西**只有数据库答得出来**：唯一约束、外键的 `on delete` 行为、
 * 某一列究竟存进去了什么。它们的失败模式全是静默的，而写一个假 db 去测它们
 * 等于测自己写的那个假的。这个模块就是给这一类准备的开口，开口只此一个。
 *
 * ## 两条必须守住的纪律
 *
 * 1. **本模块的顶层只 import node 内置**。测试文件可以静态 import 它，但它自己
 *    绝不在顶层碰 `./index`——否则光是被 vitest 收集就会触发一次环境变量校验，
 *    CI 当场变红。真正的 import 发生在 `connectTestDb()` 里，而那个函数只在
 *    `hasTestDatabase` 为真时才会被调用。
 * 2. **默认关**。没有显式给 `DATABASE_URL` 就是跳过，因此谁都不会在不知情的
 *    情况下让 `pnpm test` 去写一个库。想跑就显式开：
 *    `DATABASE_URL=postgresql://... pnpm vitest run --project db`。
 */

import { fileURLToPath } from "node:url";

/**
 * 连库测试的总开关：**只认显式传进来的 `DATABASE_URL`**，不去 .env 里翻。
 *
 * 判据故意比 `connectTestDb` 实际需要的更窄。`.env` 里本来就有一份
 * `DATABASE_URL`（开发库），若把它也算作开关，那么任何人在本机跑一次
 * `pnpm test` 都会顺手往开发库里写测试数据——而他完全没打算这么做。
 * 「要连库就在命令行上说出来」是这里唯一能自证的意图。
 */
export const hasTestDatabase = Boolean(process.env.DATABASE_URL);

/**
 * 建立（并复用）测试用的连接。
 *
 * 先把 `apps/server/.env` 读进来再 import `./index`：`@automationstack/env/server`
 * 校验的**不止 `DATABASE_URL` 一项**（还有 CORS_ORIGIN、会话密钥等），少一项就
 * 整体拒绝，而那些值与被测的仓储毫无关系。读的是与 `drizzle.config.ts` 同一份
 * 文件——迁移和测试指向同一个库，才不会出现「测试全绿但表结构是另一套」。
 *
 * `dotenv` 默认**不覆盖**已有值，所以命令行上显式给的 `DATABASE_URL` 始终优先，
 * 上面那条开关的语义不会被 .env 悄悄改写。
 */
export async function connectTestDb(): Promise<typeof import("./index")["db"]> {
	const dotenv = (await import("dotenv")).default;
	dotenv.config({
		path: fileURLToPath(new URL("../../../apps/server/.env", import.meta.url)),
	});
	return (await import("./index")).db;
}
