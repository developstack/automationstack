/**
 * 执行台右栏的抬头：用例名 + 当前结论 + 两颗常用操作 + 身份标签。
 *
 * 从当时的 `run-case-panel-sections.tsx`（「右栏的各段怎么画」的集合，后来自己也
 * 按一个文件一个组件拆成了 `run-case-content.tsx` 与 `run-case-steps-block.tsx`）
 * 拆出来：抬头从「一行标题 + 四个徽章」长成了标题行带结论徽章与两颗按钮、标签行
 * 还多了维护人与用例更新时间，继续留在那边会把它顶过 300 行上限。
 *
 * 标题行右侧那对按钮本身在 `run-case-header-actions.tsx`（一个文件最多 2 个私有
 * 辅助组件），这里只剩「名字 / 徽章 / 按钮 / 标签条怎么摆」。
 *
 * ## 两颗按钮为什么就贴在用例名旁边
 *
 * 它们原先一个藏在「步骤与判定」的汇总条里、一个藏在「执行结论」段里，两处都在
 * 页面**最下面**——想改一条判过的用例得先滚到底（用户原话）。搬上来之后又被摆成
 * 名字下面单独一行、一颗 outline 一颗 ghost、文案一个两字一个十二字，看着不成对，
 * 于是用户再提了一次：「修改按钮+打回重测 要都是按钮，都放在测试用例名字旁边，
 * 按钮大小要控制一样大，视觉对齐」。
 *
 * 所以现在两颗都在**标题这一行**，同 `size="sm"`、同 `variant="outline"`、文案都是
 * 两到四个字。「打回未测」原先那句「（清空全部分步判定）」不能塞回按钮面上——
 * 它一个人就比「修改」长六倍，成对的观感当场没了；那句警告移进了点击后的二次
 * 确认框，而那个框只在这次回退**真会丢掉东西**时才出现，见
 * `run-reset-verdict-button.tsx`。
 *
 * 四颗结论按钮与说明框不在这里：它们住在下面的执行结论面板，那一整块才是
 * 「这次执行判成什么」的地方，抬头只放两颗跨形态都要用的常用操作。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Badge } from "@automationstack/ui/components/badge";

import {
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { RunCaseHeaderActions } from "@/components/test-runs/run-case-header-actions";
import { RunCaseResultBadge } from "@/components/test-runs/run-case-result-badge";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

type RunTestCase = RunCaseDetail["testCase"];

/**
 * 用例名旁边那颗结论徽章。
 *
 * 未测不画：用户要的是「提交结果后」在名字旁看到结果（原话），而「未测」是
 * 还没有结果，给它一颗灰徽章等于让整份清单里每一条都顶着一块无信息的色块。
 * `RunCaseResultBadge` 本身五态都画，「未测」那一档是当初留给执行结论面板折叠条
 * 上那颗徽章的；那颗已经删掉（见 `run-case-verdict-panel.tsx` 头注释），所以现在
 * 挡掉未测这件事由这里独自负责。
 */
function HeadingResultBadge({ result }: { result: TestRunCaseResult }) {
	if (result === "untested") {
		return null;
	}
	return <RunCaseResultBadge result={result} />;
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
			 * 判定时间（「最后由 X 于 Y 判定为 Z」）。裸标签会让人把用例作者改文案的时间
			 * 读成自己刚才判定的时间，而这两个时间差得越远越危险（用例刚改过意味着
			 * 你手上这条判定是对着旧文案打的）。
			 */}
			<span className="text-muted-foreground text-xs">
				用例更新于 {formatDateTime(testCase.updatedAt)}
			</span>
		</div>
	);
}

export interface RunCaseHeadingProps {
	canConclude: boolean;
	editing: boolean;
	onEdit: (() => void) | null;
	onReset: () => void;
	runCase: RunCaseDetail["runCase"];
	testCase: RunTestCase;
}

/** 用例名、结论徽章、两颗常用操作，以及底下那条身份标签。 */
export function RunCaseHeading({
	canConclude,
	editing,
	onEdit,
	onReset,
	runCase,
	testCase,
}: RunCaseHeadingProps) {
	return (
		<div className="flex flex-col gap-2">
			{/*
			 * flex-wrap + justify-between：名字与徽章占左半，按钮贴右。窄栏或长名时
			 * 按钮整组换到下一行，而不是被挤成两个图标或溢出被裁。
			 */}
			<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					{/* break-words：用例名常常是一长串没有空格的中文，不给断词点会把整行撑出去 */}
					<h2 className="min-w-0 break-words font-medium text-base">
						{testCase.name}
					</h2>
					<HeadingResultBadge result={runCase.result} />
				</div>
				<RunCaseHeaderActions
					canConclude={canConclude}
					editing={editing}
					onEdit={onEdit}
					onReset={onReset}
					runCase={runCase}
				/>
			</div>
			<RunCaseMetaBadges testCase={testCase} />
		</div>
	);
}
