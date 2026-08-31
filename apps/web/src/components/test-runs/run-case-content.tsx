/**
 * 执行台右栏里「用例本身」的第一段：前置条件。
 *
 * 原先与「步骤与判定」那一段合住在 `run-case-panel-sections.tsx`（那个文件对外
 * 导出两个组件），按「一个文件一个组件」拆开之后另一段在
 * `run-case-steps-block.tsx`。两段最初都是从 `run-case-panel.tsx` 搬出来的，
 * 理由是 `RunCasePanel` 一个函数就 100 行、超了 eslint 的 50 行上限；段落搬走
 * 之后那边只剩「这一栏由哪几段按什么顺序组成」，一眼能读完。
 *
 * 这两段旁边原先还住着结论摘要、执行结论段与缺陷段，现在都不在了：
 *
 * - `RunCaseVerdictSummary`（抬头下面那句「测试结论：xxxx」）**整个删掉**。它是
 *   凭空多出来的第二个结论，用户直接问「你为什么要自己做一个测试结论呢？」。
 *   那段说明现在只有一处，就在执行结论面板里（结果页面是文字，修改页面是输入框）；
 * - 执行结论段与缺陷段搬进了 `run-case-verdict-panel.tsx`：用户要求执行结论移到
 *   这一栏最前面并做成可收起的面板，缺陷则要求收进执行结论里、不要自己的标题。
 *
 * 定义在模块顶层，而不是写进 `RunCasePanel` 内部：写在内部的话，父组件每次重渲染
 * 都会造出新的组件类型，React 认不出是同一个，会把整段卸载重建——「说明」输入框里
 * 还没失焦保存的草稿会当场丢掉。
 *
 * 这里不调任何 hook：`useCaseAttachmentUrls` 留在 `RunCasePanel` 的原位置一次签完
 * 全部贴图，签好的表按 `imageUrls` 传进来。
 */
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

type RunTestCase = RunCaseDetail["testCase"];

/**
 * 用例正文。分步判定上线后这里只剩前置条件：步骤连同它们各自的判定搬进了
 * `RunStepsSection`（一步一张卡片）。没有步骤的用例这里也只显示前置条件，
 * 由那一段自己打出「该用例没有步骤」。
 *
 * 这一段带 `border-t`：它上面是抬头与执行结论面板（这次执行的事），从这里往下才是
 * 用例本身的内容。分隔线画在这儿，两类信息才不会糊成一片。
 */
export function RunCaseContent({
	imageUrls,
	testCase,
}: {
	imageUrls: MarkdownImageUrls;
	testCase: RunTestCase;
}) {
	return (
		<section className="flex flex-col gap-1 border-t pt-4">
			<h3 className="font-medium text-sm">前置条件</h3>
			{testCase.preconditions ? (
				<MarkdownRender imageUrls={imageUrls} text={testCase.preconditions} />
			) : (
				<p className="text-sm">—</p>
			)}
		</section>
	);
}
