/**
 * 用例列表里「名称」那一格。从 case-table.tsx 拆出来，行的其余部分仍在那边。
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";
import { TableCell } from "@automationstack/ui/components/table";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

interface CaseNameCellProps {
	testCase: TestCase;
}

/**
 * 用例名的目的地是真实 URL（?caseId=...，刷新可复原），所以必须是链接而不是按钮：
 * 否则 Cmd/中键新开标签、右键复制链接全部失效，读屏也会把「导航」播成「按钮」。
 *
 * 这里曾经在链接后面挂一枚琥珀色小圆点表示「有人在编辑」。协作列上线后就撤了：
 * 同一条信息在一行里编码两次，圆点还只能表达「在编辑」这一半，
 * 读者要在两处之间反复确认哪个才是全貌。协作状态现在只由协作列负责。
 */
export function CaseNameCell({ testCase }: CaseNameCellProps) {
	const selectCase = useCallback(
		(prev: WorkspaceSearch): WorkspaceSearch => ({
			...prev,
			caseId: testCase.id,
			history: undefined,
		}),
		[testCase.id]
	);

	return (
		<TableCell>
			<Link
				className="text-left font-medium hover:underline"
				params={{ projectId: testCase.projectId }}
				search={selectCase}
				to="/projects/$projectId"
			>
				{testCase.name}
			</Link>
		</TableCell>
	);
}
