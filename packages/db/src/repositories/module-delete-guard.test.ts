/**
 * 这道闸门唯一会被写错的地方是**范围**：只查模块自己或直接子级的用例，
 * 深层子模块下被测试任务引用的用例就漏过去了，级联删到它们时数据库抛 23503，
 * 脑图批量事务里那一整批改动会一起回滚。所以这里钉住两件事：
 * 引用查询必须带上递归 CTE 返回的**每一个**子树 id；以及被挡住时返回的是
 * 结构化的 blocked 结果（数量 + 点名），而不是布尔或异常。
 *
 * 这里不连库（packages/db 的 vitest project 只跑不 import `../index` 的文件），
 * SQL 本身的正确性由 Postgres 保证，本文件测的是「查了什么范围、返回了什么形态」。
 */
import { describe, expect, it } from "vitest";

import type { Module } from "../schema/modules";
import {
	type BlockedCaseRef,
	checkModuleDeleteBlock,
	describeModuleDeleteBlock,
	type ModuleDeleteBlocked,
} from "./module-delete-guard";
import type { DbTransaction } from "./repository-types";

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const GRANDCHILD_ID = "33333333-3333-4333-8333-333333333333";

const ROOT_MODULE: Module = {
	createdAt: new Date(0),
	id: ROOT_ID,
	name: "登录",
	parentId: null,
	projectId: "99999999-9999-4999-8999-999999999999",
	sortOrder: 0,
	updatedAt: new Date(0),
};

interface TotalsRow {
	caseCount: number;
	runCount: number;
}

/** 被测代码用到的链式方法，全部返回自身；await 时吐出预置的行。 */
interface FakeChain {
	from: () => FakeChain;
	groupBy: () => FakeChain;
	innerJoin: () => FakeChain;
	limit: () => FakeChain;
	orderBy: () => FakeChain;
	then: (resolve: (value: unknown) => unknown) => unknown;
	where: (condition: unknown) => FakeChain;
}

interface FakeTxOptions {
	sample?: BlockedCaseRef[];
	subtreeIds: string[];
	totals?: TotalsRow[];
}

/**
 * `execute` 冒充 module-subtree 的递归 CTE（直接给出子树 id），
 * 两次 `select` 依次是「引用汇总」和「挡路用例样本」。
 * where 条件原样存下来，用来验证过滤范围。
 */
function createFakeTx(options: FakeTxOptions) {
	const whereConditions: unknown[] = [];
	let selectCount = 0;
	const makeChain = (rows: unknown[]): FakeChain => {
		const chain: FakeChain = {
			from: () => chain,
			groupBy: () => chain,
			innerJoin: () => chain,
			limit: () => chain,
			orderBy: () => chain,
			// biome-ignore lint/suspicious/noThenProperty: drizzle 的查询构造器就是 thenable，假货必须能被 await
			then: (resolve) => resolve(rows),
			where: (condition) => {
				whereConditions.push(condition);
				return chain;
			},
		};
		return chain;
	};
	const tx = {
		execute: () =>
			Promise.resolve({ rows: options.subtreeIds.map((id) => ({ id })) }),
		select: () => {
			selectCount += 1;
			return makeChain(
				selectCount === 1 ? (options.totals ?? []) : (options.sample ?? [])
			);
		},
	};
	return { tx: tx as unknown as DbTransaction, whereConditions };
}

/** drizzle 的条件对象里有环（列 ↔ 表），按引用去重地把里面的字符串全捞出来。 */
function collectStrings(
	value: unknown,
	seen: WeakSet<object>,
	found: string[]
): void {
	if (typeof value === "string") {
		found.push(value);
		return;
	}
	if (typeof value !== "object" || value === null || seen.has(value)) {
		return;
	}
	seen.add(value);
	for (const item of Object.values(value)) {
		collectStrings(item, seen, found);
	}
}

/** where 条件里出现的所有字面量字符串（含 inArray 绑定的每个 id）。 */
function conditionStrings(condition: unknown): string[] {
	const found: string[] = [];
	collectStrings(condition, new WeakSet(), found);
	return found;
}

describe("checkModuleDeleteBlock", () => {
	it("lets the delete through when nothing in the subtree is referenced", async () => {
		const { tx } = createFakeTx({
			subtreeIds: [ROOT_ID, CHILD_ID],
			totals: [{ caseCount: 0, runCount: 0 }],
		});
		expect(await checkModuleDeleteBlock(tx, ROOT_MODULE)).toBeNull();
	});

	it("returns a structured block carrying counts, the module and named cases", async () => {
		const { tx } = createFakeTx({
			sample: [
				{ id: "case-a", name: "登录成功" },
				{ id: "case-b", name: "登录失败" },
			],
			subtreeIds: [ROOT_ID, CHILD_ID],
			totals: [{ caseCount: 5, runCount: 2 }],
		});
		const blocked = await checkModuleDeleteBlock(tx, ROOT_MODULE);
		expect(blocked).not.toBeNull();
		expect(blocked?.kind).toBe("blocked");
		expect(blocked?.referencedCaseCount).toBe(5);
		expect(blocked?.referencedByRunCount).toBe(2);
		expect(blocked?.module.id).toBe(ROOT_ID);
		expect(blocked?.blockedCases.map((item) => item.name)).toEqual([
			"登录成功",
			"登录失败",
		]);
	});

	it("filters by every id in the subtree, not just the module itself", async () => {
		// 孙模块只出现在递归 CTE 的返回里。若引用查询退化成「只看直接子级」，
		// GRANDCHILD_ID 就不会出现在过滤条件里——这条断言就是那个回归的哨兵。
		const { tx, whereConditions } = createFakeTx({
			subtreeIds: [ROOT_ID, CHILD_ID, GRANDCHILD_ID],
			totals: [{ caseCount: 0, runCount: 0 }],
		});
		await checkModuleDeleteBlock(tx, ROOT_MODULE);
		const bound = conditionStrings(whereConditions[0]);
		expect(bound).toContain(ROOT_ID);
		expect(bound).toContain(CHILD_ID);
		expect(bound).toContain(GRANDCHILD_ID);
	});

	it("skips the reference query when the subtree came back empty", async () => {
		// 模块被并发删掉时 CTE 返回空集；拿空 id 列表去 inArray 会退化成
		// 「匹配不到任何行」，看着像没引用，实则什么都没查。
		const { tx, whereConditions } = createFakeTx({ subtreeIds: [] });
		expect(await checkModuleDeleteBlock(tx, ROOT_MODULE)).toBeNull();
		expect(whereConditions).toHaveLength(0);
	});
});

function blockedFixture(
	overrides: Partial<ModuleDeleteBlocked>
): ModuleDeleteBlocked {
	return {
		blockedCases: [{ id: "case-a", name: "登录成功" }],
		kind: "blocked",
		module: ROOT_MODULE,
		referencedByRunCount: 2,
		referencedCaseCount: 1,
		...overrides,
	};
}

describe("describeModuleDeleteBlock", () => {
	it("names the module, both counts and the blocking cases", () => {
		const message = describeModuleDeleteBlock(
			blockedFixture({
				blockedCases: [
					{ id: "case-a", name: "登录成功" },
					{ id: "case-b", name: "登录失败" },
				],
				referencedCaseCount: 2,
			})
		);
		expect(message).toBe(
			"模块「登录」下有 2 条用例被 2 个测试任务引用，无法删除（登录成功、登录失败）；可先把这些用例改为「废弃」状态"
		);
	});

	it("marks the sample as partial when more cases are blocking", () => {
		const message = describeModuleDeleteBlock(
			blockedFixture({ referencedCaseCount: 9 })
		);
		expect(message).toContain("（登录成功等）");
		expect(message).toContain("9 条用例");
	});

	it("omits the parenthesised sample when no case names are available", () => {
		const message = describeModuleDeleteBlock(
			blockedFixture({ blockedCases: [] })
		);
		expect(message).not.toContain("（");
		expect(message).toContain("无法删除；");
	});
});
