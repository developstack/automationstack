/**
 * 侧栏第 3 行：本机还留着的「未完成草稿」。
 *
 * 与概览、测试评审和执行同组、在「模块」标题之上：草稿散落在各个模块底下，
 * 不属于其中任何一个，挂进模块树会读成「某个模块的草稿」。
 *
 * 没有草稿时**整行不渲染**，不占位置也不留一个写着 0 的入口：它是异常状态的
 * 出口，而绝大多数时候这个状态并不存在。首帧一律判为「没有草稿」——数量来自
 * localStorage，只能挂载后才读，理由见 use-local-case-drafts.ts 文件头。
 *
 * 这一行是 <button> 不是链接：点开的是一份临时清单（Dialog），不是一个去处，
 * 所以也不带别的行那套「左侧 2px 选中指示条」——它永远不会是选中态。
 */

import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { cn } from "@automationstack/ui/lib/utils";
import { FilePenLineIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { CaseDraftsDialog } from "@/components/workspace/case-drafts-dialog";
import { useLocalCaseDrafts } from "@/components/workspace/use-local-case-drafts";

interface CaseDraftsLinkProps {
	/** 整棵模块树；清单要靠它把 moduleId 翻成模块名。 */
	nodes: readonly ModuleTreeNode[];
	projectId: string;
}

export function CaseDraftsLink({ nodes, projectId }: CaseDraftsLinkProps) {
	const drafts = useLocalCaseDrafts(projectId);
	const [open, setOpen] = useState(false);
	const { refresh } = drafts;

	/*
	 * 数量现在会跟着存储的变化实时更新（见 use-local-case-drafts.ts 文件头），
	 * 打开时这次重读只兜底那些绕开存储模块的改动：devtools 里手改的键、别的
	 * 脚本写的键——它们既不发通知，也不会在本标签页触发 `storage`。
	 * 代价只是一次几十个键的遍历，换「点开的清单一定是此刻的实况」。
	 */
	const handleOpen = useCallback(() => {
		refresh();
		setOpen(true);
	}, [refresh]);
	const handleClose = useCallback(() => setOpen(false), []);

	const count = drafts.items.length;
	/*
	 * 清单开着的时候即使删空也继续渲染：否则删掉最后一条会把对话框连根拔掉，
	 * 用户还没看清就整块消失。此时行本身已经收起，对话框自己摆空状态。
	 */
	if (count === 0 && !open) {
		return null;
	}

	return (
		<>
			{count > 0 ? (
				<button
					aria-label={`未完成草稿，共 ${count} 条`}
					className={cn(
						// px-2 与其它侧栏行同档：加上 aside 的 p-2 正好落在 16px 的
						// 侧栏 gutter 上（约定见 module-tree.tsx 顶部）。
						"flex min-h-7 min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-sm",
						"hover:bg-sidebar-accent"
					)}
					onClick={handleOpen}
					type="button"
				>
					<FilePenLineIcon className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate">{`未完成草稿 · ${count}`}</span>
				</button>
			) : null}
			<CaseDraftsDialog
				drafts={drafts.items}
				nodes={nodes}
				onClose={handleClose}
				onDelete={drafts.remove}
				open={open}
				projectId={projectId}
			/>
		</>
	);
}
