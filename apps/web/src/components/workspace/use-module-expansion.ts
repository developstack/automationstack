/**
 * 模块树展开状态的 React 层：把 module-expansion.ts 的纯规则接到组件上，
 * 并把「用户手动展开/折叠」持久化到 sessionStorage。
 *
 * 两条硬约束决定了这里的写法：
 * 1. 覆盖表存在这一个 hook 里，而不是每个节点各自 useState —— modules.tree
 *    每次 invalidate 都会换新树引用，节点级 state 只要节点重建就丢；
 *    集中存放才能保证「刷新数据不冲掉用户展开的状态」。
 * 2. 首帧不读 sessionStorage，挂载后才读 —— 这一页是 SSR 的，
 *    首帧读会话存储会让服务端 HTML 与客户端首次渲染不一致，触发 hydration 报错。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
	countModules,
	findModuleAncestorIds,
	isModuleOpen,
	type ModuleOpenOverrides,
	parseModuleOverrides,
	serializeModuleOverrides,
} from "@/components/workspace/module-expansion";

const STORAGE_PREFIX = "automationstack:module-expansion:";

/** 模块级常量：空覆盖表要保持同一个引用，否则每次渲染都算「变了」。 */
const EMPTY_OVERRIDES: ModuleOpenOverrides = new Map<string, boolean>();

function storageKey(projectId: string): string {
	return `${STORAGE_PREFIX}${projectId}`;
}

function readOverrides(projectId: string): ModuleOpenOverrides {
	try {
		return parseModuleOverrides(
			window.sessionStorage.getItem(storageKey(projectId))
		);
	} catch {
		// 隐私模式/禁用存储时 sessionStorage 会抛，退回默认展开规则即可。
		return EMPTY_OVERRIDES;
	}
}

function writeOverrides(
	projectId: string,
	overrides: ModuleOpenOverrides
): void {
	try {
		window.sessionStorage.setItem(
			storageKey(projectId),
			serializeModuleOverrides(overrides)
		);
	} catch {
		// 同上：写不进去只是下次刷新回到默认展开，不影响本次会话。
	}
}

export interface ModuleExpansion {
	isOpen: (moduleId: string, depth: number) => boolean;
	setOpen: (moduleId: string, open: boolean) => void;
}

export function useModuleExpansion(
	projectId: string,
	nodes: readonly ModuleTreeNode[],
	selectedModuleId: string | undefined
): ModuleExpansion {
	const [overrides, setOverrides] =
		useState<ModuleOpenOverrides>(EMPTY_OVERRIDES);

	useEffect(() => {
		setOverrides(readOverrides(projectId));
	}, [projectId]);

	const totalModules = useMemo(() => countModules(nodes), [nodes]);
	const ancestorIds = useMemo(
		() => new Set(findModuleAncestorIds(nodes, selectedModuleId)),
		[nodes, selectedModuleId]
	);

	const isOpen = useCallback(
		(moduleId: string, depth: number) =>
			isModuleOpen({ ancestorIds, overrides, totalModules }, moduleId, depth),
		[ancestorIds, overrides, totalModules]
	);

	const setOpen = useCallback(
		(moduleId: string, open: boolean) => {
			const next = new Map(overrides);
			next.set(moduleId, open);
			setOverrides(next);
			writeOverrides(projectId, next);
		},
		[overrides, projectId]
	);

	return useMemo(() => ({ isOpen, setOpen }), [isOpen, setOpen]);
}
