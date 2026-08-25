/**
 * 抽屉顶部那条「这个模块还有别的草稿没写完」的提示。
 *
 * ## 它替掉了什么
 *
 * 以前打开新建抽屉，只要这个模块有草稿就**无条件恢复**进表单。用户的原话是
 * 「现在新建用例永远是草稿的用例，我草稿的要先放着，建新的反而不行了」——
 * 那等于把「新建」改成了「继续上一份」。现在改成：表单永远是空的，草稿的存在
 * 只在这里说一句，恢复与否由用户点。
 *
 * ## 为什么默认是折叠的一行
 *
 * 这条提示的收件人是「刚点了新建、正准备打字」的人，草稿对他多半是**背景信息**。
 * 一上来就摊开一份清单会把表单顶下去，还会让人以为得先处理掉这些才能往下写。
 * 所以默认只有一行摘要（几份 + 最近一份是什么时候），要挑哪一份再展开。
 *
 * 例外是只有一份的时候：那没什么可挑的，「继续编辑」「删除」直接摆出来，
 * 省掉一次纯粹为了展开而点的鼠标。两条路复用同一个 <CaseDraftActions>，
 * 不存在「展开里的删除和外面的删除行为不一致」这种事。
 *
 * ⚠️ 清单会跟着 localStorage 实时更新（`useLocalCaseDrafts` 订阅了存储模块），
 * 所以在这条提示里删掉一份，它立刻就变；首帧仍一律判为「没有草稿」——SSR 页面
 * 首帧不许碰 localStorage，理由见 use-local-case-drafts.ts 文件头。
 *
 * 实时更新不会让这条提示自己跳动：本次会话正在写的那份草稿被 `currentCaseId`
 * 滤掉了（下面的 `items`），打字过程中 500ms 防抖落盘的那次写入虽然会发通知，
 * 过完滤之后这里看到的清单一条都没变。**改这个过滤条件前先想想这一条。**
 */
import { Button, buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { FilePenLineIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
	caseDraftSavedLabel,
	caseDraftTitle,
} from "@/components/cases/case-draft-labels";
import { DRAFT_BANNER_CLASS } from "@/components/cases/case-draft-notice";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { useLocalCaseDrafts } from "@/components/workspace/use-local-case-drafts";
import { resumeDraftSearch } from "@/components/workspace/workspace-search";

interface CaseDraftActionsProps {
	draft: CaseDraft;
	onDelete: (caseId: string) => void;
	projectId: string;
}

/** 一份草稿的两个出口。只导航，绝不把内容填进当前这张表单。 */
function CaseDraftActions({
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

interface CaseDraftPickerSummaryProps {
	expanded: boolean;
	items: readonly CaseDraft[];
	/** 最近一份的写入时刻文案，由调用方从 items[0] 上算好。 */
	latest: string;
	onDelete: (caseId: string) => void;
	onToggle: () => void;
	projectId: string;
	/** 只有一份时不做「展开」这一层，两个出口直接摆在摘要行里。 */
	single: boolean;
}

/** 默认折叠时看得见的那一行：一句摘要 + 一个出口。 */
function CaseDraftPickerSummary({
	expanded,
	items,
	latest,
	onDelete,
	onToggle,
	projectId,
	single,
}: CaseDraftPickerSummaryProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<p className="min-w-0 flex-1">
				{/* 必须写明「这台电脑」：本地草稿换台机器就没有，
				    不说清楚用户会当成服务端保存过了。 */}
				{single
					? `这个模块还有 1 份没写完的草稿（${latest}，只存在这台电脑上），当前这张表单是全新的。`
					: `这个模块还有 ${items.length} 份没写完的草稿（只存在这台电脑上），最近一份是 ${latest}。当前这张表单是全新的。`}
			</p>
			{single ? (
				<CaseDraftActions
					draft={items[0]}
					onDelete={onDelete}
					projectId={projectId}
				/>
			) : (
				<Button
					aria-expanded={expanded}
					onClick={onToggle}
					size="xs"
					type="button"
					variant="outline"
				>
					{expanded ? "收起" : `查看这 ${items.length} 份`}
				</Button>
			)}
		</div>
	);
}

interface CaseDraftPickerListProps {
	items: readonly CaseDraft[];
	onDelete: (caseId: string) => void;
	projectId: string;
}

/** 展开后的那份清单。展不展开由调用方决定，这里只管把 items 摆出来。 */
function CaseDraftPickerList({
	items,
	onDelete,
	projectId,
}: CaseDraftPickerListProps) {
	return (
		<ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
			{items.map((draft) => (
				<li className="flex items-center gap-2" key={draft.caseId}>
					<span className="min-w-0 flex-1 truncate">
						{`${caseDraftTitle(draft)} · ${caseDraftSavedLabel(draft)}`}
					</span>
					<CaseDraftActions
						draft={draft}
						onDelete={onDelete}
						projectId={projectId}
					/>
				</li>
			))}
		</ul>
	);
}

interface CaseDraftPickerProps {
	/**
	 * 本次会话正在编辑的那份。它不该出现在「别的草稿」里：从「继续编辑」进来时
	 * 它就是被恢复的那一份，列出来会让人以为自己没点中。
	 */
	currentCaseId: string;
	moduleId: string;
	projectId: string;
}

export function CaseDraftPicker({
	currentCaseId,
	moduleId,
	projectId,
}: CaseDraftPickerProps) {
	const drafts = useLocalCaseDrafts(projectId);
	const [expanded, setExpanded] = useState(false);
	const toggle = useCallback(() => setExpanded((prev) => !prev), []);

	const items = useMemo(
		() =>
			drafts.items.filter(
				(draft) => draft.moduleId === moduleId && draft.caseId !== currentCaseId
			),
		[currentCaseId, drafts.items, moduleId]
	);

	if (items.length === 0) {
		return null;
	}

	// listCaseDrafts 已按写入时刻从新到旧排好，第一条就是「最近一份」。
	const latest = caseDraftSavedLabel(items[0]);
	const single = items.length === 1;

	return (
		<div className={DRAFT_BANNER_CLASS} role="status">
			<FilePenLineIcon className="icon-stroke-regular mt-0.5 size-3.5 shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<CaseDraftPickerSummary
					expanded={expanded}
					items={items}
					latest={latest}
					onDelete={drafts.remove}
					onToggle={toggle}
					projectId={projectId}
					single={single}
				/>
				{expanded && !single ? (
					// max-h-40 + 滚动：草稿条数没有上限，不兜住的话这条提示会把
					// 整张表单挤出视口。
					<CaseDraftPickerList
						items={items}
						onDelete={drafts.remove}
						projectId={projectId}
					/>
				) : null}
			</div>
		</div>
	);
}
