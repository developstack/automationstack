import { describe, expect, it } from "vitest";

import {
	isNestedTestRunPath,
	workspaceViewFor,
} from "@/components/layout/workspace-path";

describe("workspaceViewFor", () => {
	it.each([
		["/projects/p1", "list"],
		["/projects/p1/", "list"],
		["/projects/p1/mindmap", "mindmap"],
		["/projects/p1/overview", "overview"],
		["/projects/p1/test-runs", "testRuns"],
		["/projects/p1/test-runs/r1", "testRuns"],
		["/projects/p1/test-runs/r1/report", "testRuns"],
		["/projects/p1/settings", "settings"],
		["/projects/p1/users", "users"],
	])("%s 属于 %s", (pathname, view) => {
		expect(workspaceViewFor(pathname)).toBe(view);
	});
});

describe("isNestedTestRunPath", () => {
	it.each([
		["/projects/p1/test-runs", false],
		["/projects/p1/test-runs/", false],
		["/projects/p1/test-runs/r1", true],
		["/projects/p1/test-runs/r1/", true],
		["/projects/p1/test-runs/r1/report", true],
		["/projects/p1/overview", false],
	])("%s → %s", (pathname, nested) => {
		expect(isNestedTestRunPath(pathname)).toBe(nested);
	});
});
