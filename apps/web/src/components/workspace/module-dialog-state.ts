/**
 * 模块树两个对话框（新建 / 删除）共用的开关状态。
 * 原先与两个对话框同住 module-dialogs.tsx；那个文件按「一个文件一个对外组件」
 * 拆成 create-module-dialog.tsx 与 delete-module-dialog.tsx 之后，这个类型
 * 不属于其中任何一个，单独落在这里。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";

export type ModuleDialogState =
	| { kind: "create"; parentId: string | null }
	| { kind: "delete"; module: ModuleTreeNode }
	| null;
