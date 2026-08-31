/**
 * 「未完成草稿」清单。
 *
 * 为什么是 Dialog 而不是 Popover / 侧栏内就地展开：每条草稿要摆下用例名、
 * 所属模块、最后编辑时间，外加「继续编辑」「删除」两个动作——二级面板宽度
 * 放不下，展开在侧栏里只能把每条压成两三行，还会把模块树顶到看不见的地方。
 * 而它是个「看一眼、处理掉、关上」的临时清单，不是一个去处，所以也不该占一页。
 * 仓库里同类的临时任务（新建模块、删除模块，见 create-module-dialog.tsx 与
 * delete-module-dialog.tsx）都是 Dialog。
 *
 * 「继续编辑」是一个真 <Link>：它就是一次导航（换模块 + 打开新建抽屉 + 指名
 * 恢复哪一份），做成按钮会丢掉 Cmd / 中键在新标签页打开的能力。草稿内容不用在
 * 这里传递——抽屉主体挂载时会按 URL 上的 `?draft=<caseId>` 自己去 localStorage
 * 里读回来（use-case-create-draft.ts），这条链路本来就是为「意外关掉」准备的。
 *
 * ⚠️ 同一个模块可以有**多份**草稿（键按 caseId 分，不再按 moduleId）。所以每一行
 * 必须自己就能被认出来：用例名（空名回落成「未命名用例」）+ 最后编辑时间。
 * 只写模块名的话，同模块的几份会长得一模一样，用户没法决定点哪一个。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Button, buttonVariants } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import {
	caseDraftSavedLabel,
	caseDraftTitle,
} from "@/components/cases/case-draft-labels";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { resumeDraftSearch } from "@/components/workspace/workspace-search";

/**
 * 模块已经被删掉了（或这条老记录压根没记住自己属于哪个模块），草稿成了孤儿。
 * 不静默丢弃：里面可能是写了很久的正文，还挂着已经传上去的图。但也没有可跳转的
 * 目标模块，所以只留「删除」。
 */
const ORPHAN_MODULE = "模块已删除（无法继续编辑）";

function collectModuleNames(
	nodes: readonly ModuleTreeNode[]
): Map<string, string> {
	const names = new Map<string, string>();
	const walk = (list: readonly ModuleTreeNode[]) => {
		for (const node of list) {
			names.set(node.id, node.name);
			walk(node.children);
		}
	};
	walk(nodes);
	return names;
}

interface CaseDraftRowProps {
	draft: CaseDraft;
	/** 模块已被删除、或这条记录没记住模块时为 undefined。 */
	moduleName: string | undefined;
	onDelete: (caseId: string) => void;
	onNavigate: () => void;
	projectId: string;
}

function CaseDraftRow({
	draft,
	moduleName,
	onDelete,
	onNavigate,
	projectId,
}: CaseDraftRowProps) {
	const { caseId, moduleId } = draft;
	const title = caseDraftTitle(draft);

	// 导航的口径（清详情选中 / 清页码 / 带上 draft）统一在 workspace-search.ts，
	// 这里只负责把引用稳住：JSX 属性不能收每次渲染都新建的闭包。
	const resume = useMemo(
		() => resumeDraftSearch(moduleId, caseId),
		[caseId, moduleId]
	);
	const handleDelete = useCallback(() => onDelete(caseId), [caseId, onDelete]);

	const savedLabel = caseDraftSavedLabel(draft);

	return (
		<li className="flex items-center gap-2 rounded-md border p-2">
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">{title}</p>
				<p className="truncate text-muted-foreground text-xs">
					{`${moduleName ?? ORPHAN_MODULE} · ${savedLabel}`}
				</p>
			</div>
			{moduleName === undefined ? null : (
				<Link
					// 带上时间：同一个模块可能有好几份「未命名用例」，
					// 光念名字的话读屏用户听到的是几个一模一样的按钮。
					aria-label={`继续编辑 ${savedLabel} 的草稿「${title}」`}
					className={buttonVariants({ size: "xs", variant: "outline" })}
					onClick={onNavigate}
					params={{ projectId }}
					search={resume}
					to="/projects/$projectId"
				>
					继续编辑
				</Link>
			)}
			<Button
				aria-label={`删除 ${savedLabel} 的草稿「${title}」`}
				onClick={handleDelete}
				size="xs"
				type="button"
				variant="ghost"
			>
				删除
			</Button>
		</li>
	);
}

interface CaseDraftsDialogProps {
	drafts: readonly CaseDraft[];
	/** 整棵模块树，用来把草稿里的 moduleId 翻成模块名。 */
	nodes: readonly ModuleTreeNode[];
	onClose: () => void;
	onDelete: (caseId: string) => void;
	open: boolean;
	projectId: string;
}

export function CaseDraftsDialog({
	drafts,
	nodes,
	onClose,
	onDelete,
	open,
	projectId,
}: CaseDraftsDialogProps) {
	const moduleNames = useMemo(() => collectModuleNames(nodes), [nodes]);
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>未完成草稿</DialogTitle>
					{/*
					 * 必须说清是哪一种草稿：本地草稿只在「新建用例」这条路上产生，
					 * 编辑已有用例没有任何本地缓存。不写这一句，用户会以为改到一半的
					 * 用例也躺在这里，进而以为「没在列表里看到 = 改动丢了」。
					 */}
					<DialogDescription>
						还没创建成功的新建用例，只留在这台电脑的这个浏览器里，换台机器看不到。编辑已有用例不会产生草稿。
					</DialogDescription>
				</DialogHeader>
				{drafts.length === 0 ? (
					<p className="text-muted-foreground">本机已经没有未完成的草稿了。</p>
				) : (
					// max-h-96 + 滚动：草稿条数没有上限，不兜住的话对话框会顶出视口
					<ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
						{drafts.map((draft) => (
							<CaseDraftRow
								draft={draft}
								key={draft.caseId}
								moduleName={moduleNames.get(draft.moduleId)}
								onDelete={onDelete}
								onNavigate={onClose}
								projectId={projectId}
							/>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
