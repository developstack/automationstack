/**
 * 执行台右栏的抬头：用例名 + 当前结论 + 详情入口 + 两颗常用操作 + 一行元信息。
 *
 * 从当时的 `run-case-panel-sections.tsx`（「右栏的各段怎么画」的集合，后来自己也
 * 按一个文件一个组件拆成了 `run-case-content.tsx` 与 `run-case-steps-block.tsx`）
 * 拆出来：抬头从「一行标题 + 四个徽章」长成了标题行带结论徽章与两颗按钮、下面还
 * 有一行元信息，继续留在那边会把它顶过 300 行上限。
 *
 * 标题行右侧那对按钮本身在 `run-case-header-actions.tsx`（一个文件最多 2 个私有
 * 辅助组件），这里只剩「名字 / 徽章 / 详情入口 / 按钮 / 元信息行怎么摆」。
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
import { Link } from "@tanstack/react-router";

import { RunCaseHeaderActions } from "@/components/test-runs/run-case-header-actions";
import { RunCaseResultBadge } from "@/components/test-runs/run-case-result-badge";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";

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

/**
 * 元信息行：只剩「模块」与「维护人」两项，且两项都带标签。
 *
 * 原先这里横排六个东西——模块名、优先级徽章、状态徽章、`v3`、`维护人 张三`、
 * `用例更新于 …`——样式各不相同（两枚不同变体的徽章 + 三段裸文字），其中状态那枚
 * 徽章只印一个值、不印它是什么，用户的原话是「你只写一个『生效』，谁知道这个是
 * 什么啊」。裸值的问题不是徽章画得不好，是**一个值离开了它的字段名就不再是信息**。
 *
 * 所以这次的取法不是「把徽章调好看」，而是先砍到执行时真正要用的两项，再给这两项
 * 各配一个标签。优先级 / 状态 / 版本 / 更新时间没有被藏起来：它们都在用例本身的
 * 维护页面上，标题旁那个「详情」入口一步就到——执行台要回答的是「这条归谁、属于
 * 哪个模块」，其余是用例管理的事。
 *
 * 两项共用同一个 `RUN_SECTION_TEXT`（字号、颜色都由它给），间距也只有一档
 * `gap-x-4`：用户要的「完全一致」在这里是字面意思，任何一项单独加粗或换色，
 * 都会重新暗示一种其实不存在的主次。
 *
 * 维护人为空给「—」而不是整项不渲染。这一条与本文件历史上的写法**相反**，理由随
 * 场景变了：当时这是一条六项的徽章条，横着扫，一个恒定为空的占位只会挤掉后面几项;
 * 现在只剩两个带标签的字段并排，缺一项会让整行长度在用例之间跳动，而「维护人：—」
 * 读得出「查过了，没人」——与 `case-detail-view.tsx` 的竖排字段表同一口径。
 */
function RunCaseMetaLine({ testCase }: { testCase: RunTestCase }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
			<span className={RUN_SECTION_TEXT}>模块：{testCase.moduleName}</span>
			<span className={RUN_SECTION_TEXT}>
				维护人：{testCase.maintainer ?? "—"}
			</span>
		</div>
	);
}

export interface RunCaseHeadingProps {
	canConclude: boolean;
	editing: boolean;
	onEdit: (() => void) | null;
	onReset: () => void;
	/** 「详情」入口要跳的目标项目；用例详情抽屉挂在项目工作区的路由上。 */
	projectId: string;
	runCase: RunCaseDetail["runCase"];
	testCase: RunTestCase;
}

/** 用例名、结论徽章、两颗常用操作，以及底下那条身份标签。 */
export function RunCaseHeading({
	canConclude,
	editing,
	onEdit,
	onReset,
	projectId,
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
					{/*
					 * 「详情」通向这条用例在用例管理里的维护页面。
					 *
					 * 目标是**真实 URL**而不是本地状态：用例详情抽屉由项目工作区路由的
					 * `?caseId=` 打开（见 `workspace-search.ts` 的 caseId 字段），所以
					 * 这里能直接给一个可收藏、可 Cmd+点击新开标签的链接。写法照
					 * `overview-changes-card.tsx` 那处跨路由跳转——执行台与工作区是两条
					 * 不同的路由，search 只能整份给出，不能用 reducer 改上一页的参数。
					 *
					 * 顺带把 moduleId 也带上（overview 那处没带只是因为它的数据源不返回
					 * 模块）：抽屉本身只按 caseId 取数，但缺了模块上下文，左边的模块树会
					 * 停在「整个项目」，用户落地后还得自己找回这条用例在哪个模块下。
					 */}
					<Link
						className="shrink-0 text-sm underline-offset-4 hover:underline"
						params={{ projectId }}
						search={{ caseId: testCase.id, moduleId: testCase.moduleId }}
						to="/projects/$projectId"
					>
						详情
					</Link>
				</div>
				<RunCaseHeaderActions
					canConclude={canConclude}
					editing={editing}
					onEdit={onEdit}
					onReset={onReset}
					runCase={runCase}
				/>
			</div>
			<RunCaseMetaLine testCase={testCase} />
		</div>
	);
}
