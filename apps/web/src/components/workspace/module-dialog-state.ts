import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";

export type ModuleDialogState =
	| { kind: "create"; parentId: string | null }
	| { kind: "delete"; module: ModuleTreeNode }
	| null;
