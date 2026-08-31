/**
 * 一份本地草稿的两个出口（继续编辑 / 删除）。
 *
 * 从 case-draft-picker.tsx 拆出来：折叠态的摘要行与展开后的清单各有一处要用它，
 * 两条路复用同一个组件，不存在「展开里的删除和外面的删除行为不一致」这种事。
 */
import { Button, buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import {
	caseDraftSavedLabel,
	caseDraftTitle,
} from "@/components/cases/case-draft-labels";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { resumeDraftSearch } from "@/components/workspace/workspace-search";

interface CaseDraftActionsProps {
	draft: CaseDraft;
	onDelete: (caseId: string) => void;
	projectId: string;
}

/** 一份草稿的两个出口。只导航，绝不把内容填进当前这张表单。 */
export function CaseDraftActions({
	draft,
	onDelete,
	projectId,
}: CaseDraftActionsProps) {
	const { caseId, moduleId } = draft;
	const title = caseDraftTitle(draft);
	const savedLabel = caseDraftSavedLabel(draft);

	// 导航口径统一在 workspace-search.ts；这里只负责稳住引用，
	// JSX 属性不能收每次渲染都新建的闭包。
	const resume = useMemo(
		() => resumeDraftSearch(moduleId, caseId),
		[caseId, moduleId]
	);
	const handleDelete = useCallback(() => onDelete(caseId), [caseId, onDelete]);

	return (
		<>
			{/*
			 * 真 <Link>：它是一次导航（URL 上换一个 `draft`），做成按钮会丢掉
			 * Cmd / 中键在新标签页打开的能力。aria-label 带上时间——同一个模块
			 * 完全可能并排躺着好几份「未命名用例」。
			 */}
			<Link
				aria-label={`继续编辑 ${savedLabel} 的草稿「${title}」`}
				className={buttonVariants({ size: "xs", variant: "outline" })}
				params={{ projectId }}
				search={resume}
				to="/projects/$projectId"
			>
				继续编辑
			</Link>
			<Button
				aria-label={`删除 ${savedLabel} 的草稿「${title}」`}
				onClick={handleDelete}
				size="xs"
				type="button"
				variant="ghost"
			>
				删除
			</Button>
		</>
	);
}
