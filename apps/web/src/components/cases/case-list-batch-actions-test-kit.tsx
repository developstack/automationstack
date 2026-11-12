import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";

import { CaseListBatchActions } from "@/components/cases/case-list-batch-actions";
import { caseListFilter } from "@/components/cases/case-list-query";
import type { CaseSelection } from "@/components/cases/use-case-selection";

/**
 * 用例列表批量操作栏的测试共用的构造函数（case-list-batch-actions.test.tsx 和
 * case-list-batch-move.test.tsx）。替身在 case-list-batch-orpc-mock.ts 中。
 */

export function caseIds(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `case-${index}`);
}

export const caseRef = (id: string) => ({ id, name: `用例 ${id}` });

export function moduleNode(
	id: string,
	name: string,
	children: ModuleTreeNode[] = []
): ModuleTreeNode {
	return {
		children,
		id,
		name,
		parentId: null,
		projectId: "project-1",
		sortOrder: 0,
	};
}

export const LOGIN_MODULE = moduleNode("m-login", "登录");
const SMS_MODULE = moduleNode("m-sms", "短信验证码");
/** 两个顶层模块，其中「账号」下有子模块「短信验证码」。 */
export const MODULES = [
	moduleNode("m-account", "账号", [SMS_MODULE]),
	LOGIN_MODULE,
];

/** 最近一次渲染使用的 QueryClient，用来检查操作后重新载入了哪些查询。 */
let queryClient = new QueryClient();

export function currentQueryClient(): QueryClient {
	return queryClient;
}

/** 渲染勾选了 ids 的批量操作栏，返回勾选状态的替身。 */
export function renderActions(ids: string[]): CaseSelection {
	queryClient = new QueryClient();
	const selection: CaseSelection = {
		allMatching: false,
		clear: vi.fn(),
		ids: new Set(ids),
		selectAllMatching: vi.fn(),
		toggle: vi.fn(),
		togglePage: vi.fn(),
	};
	render(
		<QueryClientProvider client={queryClient}>
			<CaseListBatchActions
				filter={caseListFilter("project-1", {})}
				page={{ items: [], total: ids.length }}
				selection={selection}
			/>
		</QueryClientProvider>
	);
	return selection;
}
