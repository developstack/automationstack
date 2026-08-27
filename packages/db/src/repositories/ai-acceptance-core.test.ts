/**
 * 采纳准入的三道拒绝，重点是**跨项目**那道。
 *
 * 提案只由请求里的 id 定位，而 `findModuleProjectId` 只反推得出目标模块的
 * 项目；两边不比对，A 项目生成会话的提案就能被采纳进 B 项目的模块——接口
 * 全绿、用例正常落库，没有任何一处会报错。所以这里逐条钉死。
 *
 * 同时钉住「三类拒绝返回值必须一模一样」：一旦有人为了「报错更友好」把跨项目
 * 单独拆一个 kind 出去，这个接口就变成了探测提案是否存在的预言机。
 */
import { describe, expect, it } from "vitest";

import type { AcceptanceProposalRow } from "./ai-acceptance-core";
import { selectAcceptableProposals } from "./ai-acceptance-core";

const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function row(
	id: string,
	sessionProjectId: string,
	status: AcceptanceProposalRow["status"] = "proposed"
): AcceptanceProposalRow {
	return {
		id,
		proposal: {
			caseType: "functional",
			name: `用例 ${id}`,
			preconditions: null,
			priority: "P1",
			steps: [{ expected: "成功", id: `${id}-step`, step: "点一下" }],
			tags: [],
		},
		sessionProjectId,
		status,
	};
}

describe("selectAcceptableProposals", () => {
	it("同项目且待评审：按入参 id 顺序返回，而不是数据库返回顺序", () => {
		const rows = [row("p2", PROJECT_A), row("p1", PROJECT_A)];

		const ordered = selectAcceptableProposals(rows, ["p1", "p2"], PROJECT_A);

		expect(ordered?.map((item) => item.id)).toEqual(["p1", "p2"]);
	});

	it("提案属于别的项目：整批拒绝——这是跨项目采纳漏洞的闸门", () => {
		const rows = [row("p1", PROJECT_B)];

		expect(selectAcceptableProposals(rows, ["p1"], PROJECT_A)).toBeNull();
	});

	it("一批里混进一条跨项目的，同批合法的也一起拒——不做部分采纳", () => {
		const rows = [row("p1", PROJECT_A), row("p2", PROJECT_B)];

		expect(selectAcceptableProposals(rows, ["p1", "p2"], PROJECT_A)).toBeNull();
	});

	it("跨项目与「不存在」「已处理」不可区分：都是同一个 null，不泄露提案是否存在", () => {
		const crossProject = selectAcceptableProposals(
			[row("p1", PROJECT_B)],
			["p1"],
			PROJECT_A
		);
		const missing = selectAcceptableProposals([], ["p1"], PROJECT_A);
		const alreadyAccepted = selectAcceptableProposals(
			[row("p1", PROJECT_A, "accepted")],
			["p1"],
			PROJECT_A
		);

		expect(crossProject).toBeNull();
		expect(missing).toEqual(crossProject);
		expect(alreadyAccepted).toEqual(crossProject);
	});

	it("已被拒绝的提案不能再采纳", () => {
		const rows = [row("p1", PROJECT_A, "rejected")];

		expect(selectAcceptableProposals(rows, ["p1"], PROJECT_A)).toBeNull();
	});

	it("空入参返回空数组而不是 null：没什么可采纳 ≠ 请求非法", () => {
		expect(selectAcceptableProposals([], [], PROJECT_A)).toEqual([]);
	});
});
