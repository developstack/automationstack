/**
 * 分步判定的**本机草稿**：结构、解析、读写删。不碰 React。
 *
 * ## 为什么要有它
 *
 * 用户的原话：「用户在本地电脑走到一半没有保存，这个时候刷新页面，结果没保存的
 * 数据丢失了，这个体验会很糟糕」。分步判定是「点满一屏再统一提交」的流程
 * （见 `use-run-step-draft.ts` 文件头的取舍），中途刷新/误关标签页会把十几步的
 * 判定和几段失败原因一次性清零，所以每一次改动都落一份到本机。
 *
 * 用 localStorage 而不是 sessionStorage：sessionStorage 恰好在「关掉标签页」时
 * 失效，而那正是要救的场景之一。与 `cases/case-draft-storage.ts` 同一条口径。
 *
 * ## 键为什么是 runCaseId
 *
 * 判定属于「某次测试任务里的某条用例」，不是用例本身：同一条用例可能同时挂在
 * 三个测试任务里，按 caseId 存会让三处判定互相覆盖。runCaseId 是这条执行记录的
 * 主键，天然一一对应。
 *
 * ## 读回来的一律当不可信输入
 *
 * 字符串可能是上个版本的结构、被用户手改过、被别的脚本写坏。所以逐字段校验，
 * 不写 `JSON.parse as RunStepDraft`：一个坏掉的枚举值混进 `judged`，界面上那一步
 * 会显示成一个谁都认不出、也点不掉的状态，而且没有任何地方会报错。
 *
 * SSR：本文件只导出函数，`typeof window` 的判断在里面；调用方必须在 `useEffect`
 * 里调——这一页会 SSR，首帧读存储必然 hydration 不一致。
 */
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";

const STORAGE_PREFIX = "automationstack.run-step-draft.";

/** 与 `test-run-step-results-core.ts` 的 `TestRunStepResult` 一一对应。 */
const STEP_RESULT_VALUES: readonly TestRunStepResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
];

export interface RunStepDraft {
	/**
	 * 判定时看到的用例版本。用例是活引用（D2），别人随时可能加一步、删一步、
	 * 把第 3 步的预期整个改掉——版本对不上时这份草稿就不再指向用户当时读的东西，
	 * 直接丢弃（见 `readRunStepDraft`），而不是按 stepId 尽力恢复：
	 * 恢复出来的是一份「对着旧文案做出、却挂在新文案下」的判定，没人能发现。
	 */
	caseVersion: number;
	/**
	 * stepId → 失败 / 阻塞原因。**与当前判定无关地全部留着**，这就是用户要的
	 * 「点错了点回来，字还在」——过滤发生在保存那一刻（服务端的 `pickComment`）。
	 */
	comments: Record<string, string>;
	/** stepId → 判定。只含用户点过的；没点的由服务端在保存时补成跳过。 */
	judged: Record<string, TestRunStepResult>;
	/** 写入时刻（epoch ms），只用来在界面上说「这是什么时候留下的」。 */
	savedAt: number;
}

function localStore(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage;
	} catch {
		// Safari 隐私模式等场景下光是访问 localStorage 就会抛，降级为不缓存。
		return null;
	}
}

function draftKey(runCaseId: string): string {
	return `${STORAGE_PREFIX}${runCaseId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 逐条挑出合法项，**坏的跳过而不是整份作废**：一条判定的枚举值被改坏，
 * 不该让另外十几步的判定和几段失败原因跟着一起没。
 */
function parseJudged(value: unknown): Record<string, TestRunStepResult> {
	if (!isRecord(value)) {
		return {};
	}
	const judged: Record<string, TestRunStepResult> = {};
	for (const [stepId, result] of Object.entries(value)) {
		if (STEP_RESULT_VALUES.includes(result as TestRunStepResult)) {
			judged[stepId] = result as TestRunStepResult;
		}
	}
	return judged;
}

function parseComments(value: unknown): Record<string, string> {
	if (!isRecord(value)) {
		return {};
	}
	const comments: Record<string, string> = {};
	for (const [stepId, text] of Object.entries(value)) {
		if (typeof text === "string") {
			comments[stepId] = text;
		}
	}
	return comments;
}

/**
 * 一段来路不明的 JSON → 一份草稿。认不出就回 null。
 *
 * `caseVersion` 必须是正整数：缺了它就没法判断这份草稿还对不对得上现在的用例，
 * 而「对不上还恢复」比「不恢复」糟得多。
 */
export function parseRunStepDraft(raw: string | null): RunStepDraft | null {
	if (raw === null) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) {
		return null;
	}
	const { caseVersion, savedAt } = parsed;
	if (typeof caseVersion !== "number" || !Number.isInteger(caseVersion)) {
		return null;
	}
	return {
		caseVersion,
		comments: parseComments(parsed.comments),
		judged: parseJudged(parsed.judged),
		savedAt: typeof savedAt === "number" ? savedAt : 0,
	};
}

/**
 * 查草稿的三种结果。
 *
 * `stale` 与 `none` 必须分开：两者都「没有可恢复的东西」，但前者意味着用户上一次
 * 判到一半的内容**刚刚被丢掉了**。合并成 null，界面就只能默不作声地开一张白卷，
 * 用户下次打开会以为是自己忘了点——而事实是有人改了用例。
 */
export type RunStepDraftLookup =
	| { draft: RunStepDraft; kind: "ok" }
	| { kind: "none" }
	| { kind: "stale" };

/**
 * 取回这条执行记录的草稿。`caseVersion` 与用例当前版本对不上时判为 `stale`，
 * 并顺手把它删掉——留着只会在下次打开时再判一次、再丢一次。
 */
export function readRunStepDraft(
	runCaseId: string,
	caseVersion: number
): RunStepDraftLookup {
	let draft: RunStepDraft | null = null;
	try {
		draft = parseRunStepDraft(
			localStore()?.getItem(draftKey(runCaseId)) ?? null
		);
	} catch {
		return { kind: "none" };
	}
	if (draft === null) {
		return { kind: "none" };
	}
	if (draft.caseVersion !== caseVersion) {
		clearRunStepDraft(runCaseId);
		return { kind: "stale" };
	}
	return { draft, kind: "ok" };
}

/**
 * 写入。**失败一律静默**：草稿是锦上添花，绝不能因为它（配额写满、隐私模式、
 * 企业策略禁用存储）让「判定这条用例」整件事不能用。
 */
export function writeRunStepDraft(
	runCaseId: string,
	draft: Omit<RunStepDraft, "savedAt">
): void {
	try {
		// savedAt 由这里盖章：它的语义就是「写进去的那一刻」，让调用方传只会
		// 让它每次渲染都变，防抖比对就永远认为「内容变了」。
		localStore()?.setItem(
			draftKey(runCaseId),
			JSON.stringify({ ...draft, savedAt: Date.now() })
		);
	} catch {
		// 写不进去只是这次意外刷新恢复不了，本次判定一个字都不受影响。
	}
}

export function clearRunStepDraft(runCaseId: string): void {
	try {
		localStore()?.removeItem(draftKey(runCaseId));
	} catch {
		// 删不掉最多是下次打开多恢复一次已经保存过的内容，不造成数据错误。
	}
}
