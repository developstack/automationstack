/**
 * 选模块时的 URL search reducer，原先与两个链接组件同住 module-node-links.tsx。
 * 拆成独立文件是因为那个文件按「一个文件一个对外组件」拆成了
 * module-node-link.tsx 与 module-mindmap-link.tsx，而这个 hook 是两边共用的。
 */
import { useCallback } from "react";

import {
	clearCaseSelection,
	type WorkspaceSearch,
} from "@/components/workspace/workspace-search";

/**
 * 选中该模块。列表与脑图共用 URL 上的同一个 `moduleId`，所以模块名链接与
 * 脑图链接必须用同一个 reducer —— 两处各写一遍迟早会分叉。
 */
export function useSelectModuleSearch(moduleId: string) {
	return useCallback(
		(prev: WorkspaceSearch) => ({
			...clearCaseSelection(prev),
			// 换模块时把新建抽屉收掉：`create` 跟着走会让抽屉在另一个模块下
			// 凭空弹开，而那个模块的草稿与当前这份毫无关系。
			create: undefined,
			moduleId,
			// 换模块相当于换了一份列表，停在旧页码上多半是空页。
			page: undefined,
		}),
		[moduleId]
	);
}
