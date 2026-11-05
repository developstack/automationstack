import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
	countModules,
	findModuleAncestorIds,
	findModuleChain,
	isModuleOpen,
	type ModuleOpenOverrides,
	parseModuleOverrides,
	serializeModuleOverrides,
} from "@/components/workspace/module-expansion";

const STORAGE_PREFIX = "automationstack";

const EMPTY_OVERRIDES: ModuleOpenOverrides = new Map<string, boolean>();

function storageKey(scope: string, storageId: string): string {
	return `${STORAGE_PREFIX}:${scope}:${storageId}`;
}

function readOverrides(scope: string, storageId: string): ModuleOpenOverrides {
	try {
		return parseModuleOverrides(
			window.sessionStorage.getItem(storageKey(scope, storageId))
		);
	} catch {
		return EMPTY_OVERRIDES;
	}
}

function writeOverrides(
	scope: string,
	storageId: string,
	overrides: ModuleOpenOverrides
): void {
	try {
		window.sessionStorage.setItem(
			storageKey(scope, storageId),
			serializeModuleOverrides(overrides)
		);
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
}

export interface ModuleExpansion {
	isOpen: (moduleId: string, depth: number) => boolean;
	setOpen: (moduleId: string, open: boolean) => void;
}

export interface ModuleExpansionOptions {
	nodes: readonly ModuleTreeNode[];
	/** true 时选中的模块自身也展开：测试任务左栏的用例就挂在模块下面 */
	openSelected?: boolean;
	/** sessionStorage 的命名空间，不同面板各记自己的展开状态 */
	scope: string;
	selectedModuleId: string | undefined;
	/** 命名空间里的对象 id：模块树用项目 id，测试任务左栏用任务 id */
	storageId: string;
}

/**
 * 模块的展开状态：用户的点选存到 sessionStorage，选中项所在的层级始终展开。
 * 用户的点选优先于「选中项展开」，所以选中之后仍然能手动收起。
 */
export function useModuleExpansion(
	options: ModuleExpansionOptions
): ModuleExpansion {
	const {
		nodes,
		openSelected = false,
		scope,
		selectedModuleId,
		storageId,
	} = options;
	const [overrides, setOverrides] =
		useState<ModuleOpenOverrides>(EMPTY_OVERRIDES);

	useEffect(() => {
		setOverrides(readOverrides(scope, storageId));
	}, [scope, storageId]);

	const totalModules = useMemo(() => countModules(nodes), [nodes]);
	const expandedIds = useMemo(
		() =>
			new Set(
				openSelected
					? findModuleChain(nodes, selectedModuleId)
					: findModuleAncestorIds(nodes, selectedModuleId)
			),
		[nodes, openSelected, selectedModuleId]
	);

	const isOpen = useCallback(
		(moduleId: string, depth: number) =>
			isModuleOpen(
				{ ancestorIds: expandedIds, overrides, totalModules },
				moduleId,
				depth
			),
		[expandedIds, overrides, totalModules]
	);

	const setOpen = useCallback(
		(moduleId: string, open: boolean) => {
			const next = new Map(overrides);
			next.set(moduleId, open);
			setOverrides(next);
			writeOverrides(scope, storageId, next);
		},
		[overrides, scope, storageId]
	);

	return useMemo(() => ({ isOpen, setOpen }), [isOpen, setOpen]);
}
