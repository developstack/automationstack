/**
 * 执行台右栏：用例内容（实时）+ 结论 + 说明 + 附件 + 缺陷。
 *
 * 用例内容来自后端的 `innerJoin test_cases`，是**当前**内容而不是创建测试任务时的快照
 * （D2：用例永远只有一份）。所以这里不做任何本地缓存或版本对比——别人改了用例，
 * 第一期已有的 `case` 失效事件会把这一页刷新到最新。
 *
 * 本文件只剩「这一栏由哪几段、按什么顺序组成」；各段的具体画法在
 * `run-case-panel-sections.tsx`。这么切是因为原先一个 `RunCasePanel` 就 100 行，
 * 超了 eslint 的 50 行函数上限，而段与段之间本来就没有共享状态。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import { RunAttachments } from "@/components/test-runs/run-attachments";
import { RunCaseEvents } from "@/components/test-runs/run-case-events";
import {
	RunCaseContent,
	RunCaseDefectSection,
	RunCaseHeading,
	RunCaseVerdictSection,
} from "@/components/test-runs/run-case-panel-sections";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { needsVerdictDetails } from "@/components/test-runs/test-run-meta";

export interface RunCasePanelProps {
	/** 能否打结论：`pending_review` 与 `submitted` 都不能。 */
	canConclude: boolean;
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	/** 把结论打回「未测」。已完成的测试任务同样允许（plan §2.2）。 */
	onReset: () => void;
	onStorageUnavailable: () => void;
	projectId: string;
	storageUnavailable: boolean;
}

export function RunCasePanel({
	canConclude,
	item,
	locked,
	onCommentSave,
	onPick,
	onReset,
	onStorageUnavailable,
	projectId,
	storageUnavailable,
}: RunCasePanelProps) {
	const { runCase, testCase } = item;
	// 一次请求签完这条用例的全部贴图，正文里的引用按 id 查表；执行台是只读侧，
	// 不套 CaseAttachmentProvider（那边才有粘贴上传）。
	const imageUrls = useCaseAttachmentUrls(testCase.id);
	/**
	 * 说明 / 附件 / 缺陷三块共用**同一条**规则：结论是失败或阻塞才相关。
	 * 通过一条用例本该是「点一下就走」，之前三块无条件常驻，等于每判一条
	 * 都要略过三个空控件。
	 *
	 * 每块另外各带一条逃生口——**已经有内容的一律照常显示**。说明的那条在
	 * `VerdictControls` 里（它还要照顾没失焦保存的草稿），附件的那条在
	 * `RunAttachments` 里（只有它知道有几条附件），缺陷的那条在
	 * `RunCaseDefectSection` 里（它自己看 defectKey / defectUrl）。所以这里
	 * 只把「相不相关」算出来发给附件，另外两块各自去问同一个函数。
	 */
	const detailsRelevant = needsVerdictDetails(runCase.result);

	return (
		<div className="flex flex-col gap-4 p-4">
			<RunCaseHeading testCase={testCase} />
			<RunCaseContent imageUrls={imageUrls} testCase={testCase} />
			<RunCaseVerdictSection
				canConclude={canConclude}
				item={item}
				locked={locked}
				onCommentSave={onCommentSave}
				onPick={onPick}
				onReset={onReset}
			/>
			<RunAttachments
				locked={locked}
				onStorageUnavailable={onStorageUnavailable}
				relevant={detailsRelevant}
				runCaseId={runCase.id}
				storageUnavailable={storageUnavailable}
			/>
			<RunCaseDefectSection
				locked={locked}
				projectId={projectId}
				runCase={runCase}
			/>
			{/*
			 * 用例级的时间线放在本面板最底部（不是页面底部——页面底部那份是
			 * 任务级的「变更历史」）。切用例时整个面板带 key 重建，
			 * 加上 query key 里带 runCaseId，不会短暂显示上一条的历史。
			 */}
			<RunCaseEvents runCaseId={runCase.id} />
		</div>
	);
}
