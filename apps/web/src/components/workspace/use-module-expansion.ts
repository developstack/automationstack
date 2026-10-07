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
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
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
