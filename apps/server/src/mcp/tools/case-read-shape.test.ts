/**
 * 这一层出错的两种方式都不会报警，所以逐条钉住：
 * ① `full` 档的 pageSize 上限失守——工具照常返回，只是把 agent 的上下文吃光，
 *    而这个工具存在的理由就是给正文腾出预算；
 * ② `summary` 档漏裁 `steps` / `preconditions`——两档变成同一档，默认档就从
 *    「便宜的摘要」悄悄变成「最贵的全文」。
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";
import { describe, expect, it } from "vitest";

import {
	FULL_DEFAULT_PAGE_SIZE,
	FULL_MAX_PAGE_SIZE,
	resolveReadPageSize,
	shapeReadCases,
} from "./case-read-shape";

const sampleCase: TestCase = {
	caseType: "functional",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	currentVersion: 3,
	id: "11111111-1111-4111-8111-111111111111",
	lastModifiedBy: "qa-bot",
	maintainer: "qa-bot",
	moduleId: "22222222-2222-4222-8222-222222222222",
	name: "用户名 21 字符时提示长度超限",
	preconditions: "已打开注册页",
	priority: "P1",
	projectId: "33333333-3333-4333-8333-333333333333",
	sortOrder: 7,
	sourceRef: "gen:PROJ-1234#username-too-long",
	status: "draft",
	steps: [
		{
			expected: "提示「用户名长度需为 4–20 个字符」",
			id: "s1",
			step: "输入 21 个字符",
		},
	],
	tags: ["边界值"],
	updatedAt: new Date("2026-02-01T00:00:00Z"),
};

const listResult = { items: [sampleCase], page: 1, pageSize: 10, total: 1 };

describe("resolveReadPageSize", () => {
	it("passes summary page sizes straight through", () => {
		expect(resolveReadPageSize("summary", 100)).toBe(100);
		expect(resolveReadPageSize("summary", undefined)).toBeUndefined();
	});

	it("defaults full detail to a small page", () => {
		expect(resolveReadPageSize("full", undefined)).toBe(FULL_DEFAULT_PAGE_SIZE);
	});

	it("caps full detail even when a larger page size is requested", () => {
		expect(resolveReadPageSize("full", 100)).toBe(FULL_MAX_PAGE_SIZE);
		expect(resolveReadPageSize("full", 5)).toBe(5);
	});
});

describe("shapeReadCases", () => {
	it("drops case bodies in summary detail", () => {
		const page = shapeReadCases(listResult, "summary");
		const [row] = page.items;
		expect(page.detail).toBe("summary");
		expect(row).not.toHaveProperty("steps");
		expect(row).not.toHaveProperty("preconditions");
		expect(row?.name).toBe(sampleCase.name);
		expect(row?.sourceRef).toBe(sampleCase.sourceRef);
	});

	it("keeps case bodies in full detail", () => {
		const page = shapeReadCases(listResult, "full");
		const [row] = page.items;
		expect(row).toHaveProperty("steps", sampleCase.steps);
		expect(row).toHaveProperty("preconditions", sampleCase.preconditions);
	});

	it("never leaks project-internal bookkeeping fields", () => {
		for (const detail of ["summary", "full"] as const) {
			const [row] = shapeReadCases(listResult, detail).items;
			expect(row).not.toHaveProperty("projectId");
			expect(row).not.toHaveProperty("sortOrder");
			expect(row).not.toHaveProperty("currentVersion");
		}
	});

	it("carries pagination metadata through unchanged", () => {
		const page = shapeReadCases(
			{ items: [], page: 2, pageSize: 20, total: 41 },
			"full"
		);
		expect(page).toMatchObject({ page: 2, pageSize: 20, total: 41 });
	});
});
