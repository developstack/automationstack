/**
 * 执行台右栏的抬头：用例名 + 当前结论 + 身份标签 + 两颗常用操作。
 *
 * 从 `run-case-panel-sections.tsx` 拆出来。那个文件是「右栏的各段怎么画」的集合，
 * 而抬头从「一行标题 + 四个徽章」长成了三行（标题带结论徽章、标签行多了维护人与
 * 用例更新时间、底下还多一条操作行），继续留在那边会把它顶过 300 行上限。
 *
 * ## 「修改」与「打回未测」为什么在这里
 *
 * 这两颗按钮原先一个藏在「步骤与判定」的汇总条里、一个藏在「执行结论」段里，
 * 两处都在页面**最下面**——想改一条已经判过的用例，得先滚到底（用户原话）。
 * 它们是看完一条用例后最常点的东西，所以跟着用例名走。
 *
 * 搬过来的只有这两颗。四颗结论按钮与说明框仍留在页面中部紧挨着步骤列表：
 * 那是「照着步骤打结论」的位置，把它们拽到用例名底下反而要求用户先滚下去读完
 * 步骤、再滚回来点按钮。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Badge } from "@automationstack/ui/components/badge";
import { Button } from "@automationstack/ui/components/button";
import { PencilIcon, RotateCcwIcon } from "lucide-react";

import {
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

type RunTestCase = RunCaseDetail["testCase"];

/**
 * 用例名旁边那颗结论徽章。
 *
 * 未测不画：用户要的是「提交结果后」在名字旁看到结果（原话），而「未测」是
 * 还没有结果，给它一颗灰徽章等于让整份清单里每一条都顶着一块无信息的色块。
 */
function RunCaseResultBadge({ result }: { result: TestRunCaseResult }) {
	if (result === "untested") {
		return null;
	}
	const Icon = RESULT_ICONS[result];
	return (
		// class 与分步汇总条那颗**逐字相同**：同一个结论在一页里出现两次，
		// 长得不一样会让人以为是两件不同的东西。
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-sm ${RESULT_BADGE_CLASSES[result]}`}
		>
			<Icon aria-hidden="true" className="size-4" />
			{RESULT_LABELS[result]}
		</span>
	);
}

/** 模块 / 优先级 / 状态 / 版本 / 维护人 / 用例更新时间。 */
function RunCaseMetaBadges({ testCase }: { testCase: RunTestCase }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Badge variant="outline">{testCase.moduleName}</Badge>
			<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
				{testCase.priority}
			</Badge>
			<CaseStatusBadge status={testCase.status} />
			<span className="text-muted-foreground text-xs">
				v{testCase.currentVersion}
			</span>
			{/*
			 * 没填维护人就整项不渲染，而不是打一个「维护人 —」：这一行是给人横着扫的
			 * 标签条，一个恒定为空的占位只会挤掉后面那几项的位置。用例详情页那种
			 * 竖排字段表才需要「—」把行对齐（见 `case-detail-view.tsx`）。
			 */}
			{testCase.maintainer === null ? null : (
				<span className="text-muted-foreground text-xs">
					维护人 {testCase.maintainer}
				</span>
			)}
			{/*
			 * 「用例更新于」不能简写成「更新时间」：这一页上还有另一个时间——本次执行的
			 * 判定时间（「最后由 X 于 Y 判为 Z」）。裸标签会让人把用例作者改文案的时间
			 * 读成自己刚才判定的时间，而这两个时间差得越远越危险（用例刚改过意味着
			 * 你手上这条判定是对着旧文案打的）。
			 */}
			<span className="text-muted-foreground text-xs">
				用例更新于 {formatDateTime(testCase.updatedAt)}
			</span>
		</div>
	);
}

export interface RunCaseHeaderActionsProps {
	/** 能否打结论：`pending_review` 与 `submitted` 都不能。 */
	canConclude: boolean;
	/** 分步判定此刻是不是可编辑态——编辑中就不再给「修改」。 */
	editing: boolean;
	/** 有步骤的用例走分步判定，「修改」与「打回未测」的含义都跟着变。 */
	hasSteps: boolean;
	/** `null` = 这个任务谁都不能改（待评审 / 已提交），连「修改」都不给。 */
	onEdit: (() => void) | null;
	onReset: () => void;
	result: TestRunCaseResult;
}

/**
 * 抬头下面那条操作行。显隐门禁与它们原来待的地方逐条一致，没有放宽：
 *
 * - 「修改」：只有分步形态才有（没步骤的用例四颗按钮一直可点，没有只读态），
 *   且要 `editing === false` 与 `onEdit !== null`；
 * - 「打回未测」：`result !== "untested"` 才画，不能打结论时按 `aria-disabled`
 *   留在原位而不是隐掉——禁用的按钮仍要能被 Tab 到，否则读屏用户根本发现不了
 *   「这里有个现在不能用的控件」。
 */
function RunCaseHeaderActions({
	canConclude,
	editing,
	hasSteps,
	onEdit,
	onReset,
	result,
}: RunCaseHeaderActionsProps) {
	const editAction = hasSteps && !editing ? onEdit : null;
	const showReset = result !== "untested";
	if (editAction === null && !showReset) {
		return null;
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			{editAction === null ? null : (
				<Button onClick={editAction} size="sm" type="button" variant="outline">
					<PencilIcon aria-hidden="true" data-icon="inline-start" />
					修改
				</Button>
			)}
			{showReset ? (
				<Button
					aria-disabled={!canConclude || undefined}
					onClick={canConclude ? onReset : undefined}
					size="sm"
					type="button"
					variant="ghost"
				>
					<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
					{/*
					 * 两种形态后果不同，文案必须分开写：分步形态下回退会把 `step_results`
					 * 一并清空，用户点之前得知道丢的是一整屏逐步判定，不是一个结论。
					 */}
					{hasSteps ? "打回未测（清空全部分步判定）" : "打回未测"}
				</Button>
			) : null}
		</div>
	);
}

export interface RunCaseHeadingProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	onEdit: (() => void) | null;
	onReset: () => void;
	runCase: RunCaseDetail["runCase"];
	testCase: RunTestCase;
}

/** 用例名、它的几个身份标签，以及两颗常用操作。 */
export function RunCaseHeading({
	canConclude,
	editing,
	hasSteps,
	onEdit,
	onReset,
	runCase,
	testCase,
}: RunCaseHeadingProps) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="font-medium text-base">{testCase.name}</h2>
				<RunCaseResultBadge result={runCase.result} />
			</div>
			<RunCaseMetaBadges testCase={testCase} />
			<RunCaseHeaderActions
				canConclude={canConclude}
				editing={editing}
				hasSteps={hasSteps}
				onEdit={onEdit}
				onReset={onReset}
				result={runCase.result}
			/>
		</div>
	);
}
