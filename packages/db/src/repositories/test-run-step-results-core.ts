/**
 * 分步判定的**纯逻辑**：补全、推导用例结论、折算用例级说明。
 *
 * 全文件零运行时依赖（只有 `import type`，编译后什么都不 import），
 * 因此 `apps/web` 可以直接引它做保存前的实时预览——与 `test-run-metrics-core.ts`
 * 被报告页直接引用是同一条路子。
 *
 * 这三件事必须只有一份实现：写路径（repository）与预览（执行台）一旦各写各的，
 * 用户会看到「预览说通过、保存完变成失败」，而且没有任何地方会报错。
 */
import type { CaseStep } from "../schema/test-cases";
import type {
	RunCaseStepResult,
	TestRunCaseResult,
	TestRunStepResult,
} from "../schema/test-run-enums";

/** 用户在界面上点过的那些步骤：stepId → 判定。没点过的不出现在这里。 */
export type JudgedSteps = Readonly<Record<string, TestRunStepResult>>;

/** 用户为各步写下的原因：stepId → 文本。**与判定无关地保留**，理由见 `pickComment`。 */
export type StepComments = Readonly<Record<string, string>>;

/** 未判定的步骤保存时落成什么。用户的原话：「没点击的就显示跳过」。 */
const UNJUDGED_STEP_RESULT: TestRunStepResult = "skipped";

/**
 * 哪些判定才配留下一段原因。
 *
 * 与用例级的 `needsVerdictDetails` 同一条规则、同一个理由：通过和跳过打完就完事，
 * 让它们挂着一段文字会在报告里被当成活的失败原因读。
 */
export function stepNeedsComment(result: TestRunStepResult): boolean {
	return result === "failed" || result === "blocked";
}

/**
 * 这一步该落库的原因文本。
 *
 * **草稿里的原因是不分结论一直留着的**（那是「点错了又点回来，字还在」的全部
 * 机制），落库时才按当前结论筛一遍：判成通过就写 null。所以「改成通过要删掉
 * 失败原因」这条需求，落点在这里而不是在界面上去清空输入框——清输入框等于
 * 用户点错一下字就没了，那正是要避免的事。
 */
function pickComment(
	result: TestRunStepResult,
	text: string | undefined
): string | null {
	if (!stepNeedsComment(result)) {
		return null;
	}
	const trimmed = (text ?? "").trim();
	return trimmed === "" ? null : trimmed;
}

/**
 * 按用例**当前**的步骤把「点过的那几步」补成完整一份，顺序与步骤一致。
 *
 * 补全放在服务端而不是界面上：「未点 = 跳过」是一条业务规则，界面只负责把
 * 用户点过的发上来。规则留在一处，将来改成「未点 = 阻塞」也只改这一行；
 * 摊在界面上则每加一个入口（快捷键、批量、脚本）就要有人记得再补一次。
 */
export function fillStepResults(
	steps: readonly CaseStep[],
	judged: JudgedSteps,
	comments: StepComments = {}
): RunCaseStepResult[] {
	return steps.map((step) => {
		const result = judged[step.id] ?? UNJUDGED_STEP_RESULT;
		return {
			comment: pickComment(result, comments[step.id]),
			result,
			stepId: step.id,
		};
	});
}

/**
 * 用例结论 = f(分步结果)。**判定顺序即优先级，不可调换。**
 *
 * 1. 一步都没有 → `untested`（还没开测；有步骤的用例只有回退才会到这儿）
 * 2. 有任意一步失败 → `failed`
 * 3. 有任意一步阻塞 → `blocked`
 * 4. 有任意一步通过 → `passed`
 * 5. 其余（全部跳过） → `skipped`
 *
 * 第 4 条是这里唯一需要权衡的一条：「3 步通过 + 2 步跳过」算通过。
 * 反过来把它算成 `skipped` 看着更保守，实际更糟——通过率的分母只算
 * passed + failed，那会让「跳过了一个无关步骤」的用例整条掉出分母，
 * 于是执行的人为了让用例算数，只能把无关步骤也点成通过。
 * 那正是 `computePassRate` 的注释在拦的东西：**任何逼人乱打通过的口径，
 * 最后毁掉的是整份数据**。
 *
 * 代价要写明白：这一档比实际乐观。「3 通过 + 2 跳过」与「5 通过」在结论上
 * 无法区分，光看 `passed` 读不出跳过了什么。执行台右栏一度把四态分布
 * （「2 通过 / 1 失败 / 0 阻塞 / 0 跳过」）摆在结论旁边补这个信息，
 * 但用户明确要求撤掉——那一栏本来就窄，用户判完步骤自己知道判了什么，
 * 一条把零值也念一遍的统计条只是噪声。乐观性因此现在**没有**在 UI 上被补偿：
 * 想还原分布，只能逐条看步骤卡片上各自的结论。
 *
 * 这不改变本函数的口径（上面五条判定顺序原样保留），只是把「谁在替这份
 * 乐观兜底」记清楚：曾经是那条分布条，现在是步骤卡片本身。
 */
export function deriveCaseResult(
	stepResults: readonly RunCaseStepResult[]
): TestRunCaseResult {
	if (stepResults.length === 0) {
		return "untested";
	}
	const has = (result: TestRunStepResult) =>
		stepResults.some((item) => item.result === result);
	if (has("failed")) {
		return "failed";
	}
	if (has("blocked")) {
		return "blocked";
	}
	return has("passed") ? "passed" : "skipped";
}

/** 步骤 id → 它在用例里的序号（从 1 起）。认不出的步骤不在表里。 */
function stepNumbers(steps: readonly CaseStep[]): Map<string, number> {
	return new Map(steps.map((step, index) => [step.id, index + 1]));
}

/**
 * 把各步的失败 / 阻塞原因折成 `test_run_cases.comment` 那一段文字。
 *
 * ## 为什么用例级说明变成了推导值
 *
 * 报告的「失败用例」块与 Jira 建单都读 `test_run_cases.comment`。分步之后
 * 原因天然长在步骤上，如果再留一个独立的用例级说明框，同一件事就有了两个
 * 写入口——两段文字迟早对不上，而报告只会读到其中一段。
 * 折算成推导值之后只有一份真相，改哪一步的原因，报告和 Jira 跟着一起变。
 *
 * ⚠️ 这意味着**分步保存会覆盖掉此前手写的用例级说明**。旧文字不会消失：
 * `test_run_case_events.comment` 存的是每次变更当时的快照，且只插不改
 * （见那张表的注释），历史里查得到。
 *
 * 认不出序号的步骤（用例改过、这条结果指不到人了）用「已删除的步骤」占位，
 * 而不是丢掉：那句话本身就是当时判失败的证据。
 */
export function buildCaseComment(
	steps: readonly CaseStep[],
	stepResults: readonly RunCaseStepResult[]
): string | null {
	const numbers = stepNumbers(steps);
	const lines: string[] = [];
	for (const item of stepResults) {
		if (item.comment === null) {
			continue;
		}
		const number = numbers.get(item.stepId);
		const label = number === undefined ? "已删除的步骤" : `步骤 ${number}`;
		lines.push(`${label}：${item.comment}`);
	}
	return lines.length === 0 ? null : lines.join("\n");
}

/** 分步结果里出现了、但用例当前步骤里没有的那些 id。 */
export function unknownStepIds(
	steps: readonly CaseStep[],
	judged: JudgedSteps
): string[] {
	const known = new Set(steps.map((step) => step.id));
	return Object.keys(judged).filter((stepId) => !known.has(stepId));
}
