/**
 * 分步判定这一屏的**工作副本**：点过的判定、写过的原因、脏不脏、往本机落盘。
 *
 * ## 为什么是「本地草稿 + 手动保存」而不是点一下发一次
 *
 * 用户选的口径：分步判定进本地草稿，点保存才提交。一条用例十几步，逐步发请求
 * 就是十几次 `test_run_case_events` 流水 + 十几次全表失效，而且中途每一次
 * 都会把用例结论推导成一个半成品状态（前三步通过 → 用例显示通过 → 第四步失败
 * → 又变失败），协作者在旁边看到的是一串闪烁的假结论。
 *
 * 代价是「没保存就丢」，这一层正是来补它的：每次改动防抖写进 localStorage，
 * 刷新 / 误关标签页回来还在（用户原话）。
 *
 * ## 原因文本与判定是**解耦**的
 *
 * `comments` 不随判定变化被清空——「用户一开始点击失败，写了一堆原因，然后鼠标
 * 不小心点了通过，用户马上点了失败回来，这个时候失败的原因不应该全部消失」。
 * 所以清理只发生在保存那一刻，由服务端的 `pickComment` 按最终判定过滤：
 * 判成通过的那一步落库时 comment 恒为 null。界面上则按当前判定决定显不显示
 * 那个输入框，框里的字一直在。
 *
 * ## hook 顺序
 *
 * 三个 effect 的**声明顺序是有意义的**：先「跟随服务端」，再「本机草稿覆盖」，
 * 最后「落盘」。挂载那一帧三个都会跑，草稿必须排在跟随之后才盖得住服务端那一份。
 */
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type {
	RunCaseStepResult,
	TestRunStepResult,
} from "@automationstack/db/schema/test-runs";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	clearRunStepDraft,
	readRunStepDraft,
	writeRunStepDraft,
} from "@/components/test-runs/run-step-draft";

/**
 * 落盘的防抖窗口。原因是一个字一个字打出来的，每次按键都 `JSON.stringify`
 * 再同步写一次 localStorage 会把主线程卡住；与新建用例草稿取同一个值。
 */
const DRAFT_WRITE_DEBOUNCE_MS = 500;

export interface RunStepDraftState {
	/** stepId → 原因原文（未 trim，用户正在打的字原样留着）。 */
	comments: Record<string, string>;
	/** stepId → 判定。没点过的步骤不在这里，保存时由服务端补成跳过。 */
	judged: Record<string, TestRunStepResult>;
}

/** 服务端已保存的那一份 → 工作副本的起点。 */
function baselineOf(
	stepResults: readonly RunCaseStepResult[]
): RunStepDraftState {
	const comments: Record<string, string> = {};
	const judged: Record<string, TestRunStepResult> = {};
	for (const item of stepResults) {
		judged[item.stepId] = item.result;
		if (item.comment !== null) {
			comments[item.stepId] = item.comment;
		}
	}
	return { comments, judged };
}

export interface RunStepDraftOptions {
	/** 用例当前版本，随草稿一起存，用来判断下次恢复时还对不对得上。 */
	caseVersion: number;
	runCaseId: string;
	/** 服务端已保存的分步结果，工作副本的起点。 */
	stepResults: readonly RunCaseStepResult[];
	steps: readonly CaseStep[];
}

export interface RunStepDraftHandle {
	comments: Record<string, string>;
	/** 有没有还没提交的改动。决定「保存」亮不亮、要不要落盘、离开时提不提醒。 */
	dirty: boolean;
	judged: Record<string, TestRunStepResult>;
	/** 保存成功后调用：清掉本机草稿，并让工作副本重新跟随服务端。 */
	markSaved: () => void;
	/** 一键全部通过。**只改判定，不动已写的原因**（理由见文件头的解耦那段）。 */
	passAll: () => void;
	/** 丢弃本机改动，回到服务端已保存的那一份。 */
	reset: () => void;
	setComment: (stepId: string, text: string) => void;
	setResult: (stepId: string, result: TestRunStepResult) => void;
	/** 上一份草稿因为用例被改过而作废了——界面要说出来，别让人以为自己没点。 */
	staleDiscarded: boolean;
}

/**
 * 把工作副本往 localStorage 落盘：防抖写 + 卸载前补写。
 *
 * 拆成独立 hook 不只是为了 50 行上限——这一段与「判定怎么改」完全无关，
 * 它关心的只有「内容变了没、此刻脏不脏、往哪个 key 写」，混在主 hook 里读的人
 * 得先分辨哪几个 ref 是给持久化用的。
 */
function useDraftPersistence(input: {
	caseVersion: number;
	dirty: boolean;
	draft: RunStepDraftState;
	runCaseId: string;
}): void {
	// 卸载时的补写读不到最新 state，只能靠 ref 转发。
	const latest = useRef(input);
	latest.current = input;

	const flush = useCallback(() => {
		const { current } = latest;
		if (current.dirty) {
			writeRunStepDraft(current.runCaseId, {
				caseVersion: current.caseVersion,
				comments: current.draft.comments,
				judged: current.draft.judged,
			});
		}
	}, []);

	/**
	 * 防抖落盘。指纹当依赖而不是 `draft` 对象本身：对象每次渲染都是新引用，
	 * 直接当依赖会让计时器在每一次无关重渲时重置，连着点十步反而一次都写不进去。
	 *
	 * 「脏不脏」由 `flush` 自己在**触发那一刻**判断，不进依赖数组：进去的话，
	 * 保存成功让 dirty 落回 false 会白跑一趟 effect；而真正要防的那件事——
	 * 保存后计时器仍把旧草稿写回去——靠 `flush` 读 ref 现查已经挡住了。
	 */
	const fingerprint = JSON.stringify(input.draft);
	// biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint 就是「内容变没变」本身，effect 体里当然不会用到它；把它按提示删掉，计时器就再也不会因为用户又点了一步而重排，草稿只在挂载时写一次。
	useEffect(() => {
		const timer = window.setTimeout(flush, DRAFT_WRITE_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [fingerprint, flush]);

	/**
	 * 卸载前补写一次。不是锦上添花：用户打完最后一个字就切到下一条用例，
	 * 是个远比 500ms 短的动作，没有它那句话正好落在防抖窗口里被清掉——
	 * 而这恰恰是整份草稿要救的场景。
	 */
	useEffect(() => flush, [flush]);
}

type DraftActions = Pick<
	RunStepDraftHandle,
	"markSaved" | "passAll" | "reset" | "setComment" | "setResult"
>;

/**
 * 用户能对工作副本做的五件事。
 *
 * 全部走 `setDraft(prev => ...)` 的函数式写法：连着按四下快捷键会在同一批里排队，
 * 读闭包里的 `draft` 会让后三下都基于第一下之前的那份，只剩最后一步被记住。
 */
function useDraftEdits(input: {
	setDirty: Dispatch<SetStateAction<boolean>>;
	setDraft: Dispatch<SetStateAction<RunStepDraftState>>;
	steps: readonly CaseStep[];
}): Pick<DraftActions, "passAll" | "setComment" | "setResult"> {
	const { setDirty, setDraft, steps } = input;

	const setResult = useCallback(
		(stepId: string, result: TestRunStepResult) => {
			setDirty(true);
			setDraft((prev) => ({
				...prev,
				judged: { ...prev.judged, [stepId]: result },
			}));
		},
		[setDirty, setDraft]
	);

	const setComment = useCallback(
		(stepId: string, text: string) => {
			setDirty(true);
			setDraft((prev) => ({
				...prev,
				comments: { ...prev.comments, [stepId]: text },
			}));
		},
		[setDirty, setDraft]
	);

	/** 只改判定，**不动已写的原因**（理由见文件头的解耦那段）。 */
	const passAll = useCallback(() => {
		setDirty(true);
		setDraft((prev) => ({
			...prev,
			judged: Object.fromEntries(
				steps.map((step) => [step.id, "passed" as TestRunStepResult])
			),
		}));
	}, [setDirty, setDraft, steps]);

	return { passAll, setComment, setResult };
}

/**
 * 两种「不脏了」：用户主动丢弃（reset，回到服务端那一份）与保存成功（markSaved，
 * 不动工作副本，等「跟随服务端」的 effect 拿新数据重新对齐）。两者都清本机草稿。
 */
function useDraftExits(input: {
	runCaseId: string;
	setDirty: Dispatch<SetStateAction<boolean>>;
	setDraft: Dispatch<SetStateAction<RunStepDraftState>>;
	setStaleDiscarded: Dispatch<SetStateAction<boolean>>;
	stepResults: readonly RunCaseStepResult[];
}): Pick<DraftActions, "markSaved" | "reset"> {
	const { runCaseId, setDirty, setDraft, setStaleDiscarded, stepResults } =
		input;

	const markSaved = useCallback(() => {
		setDirty(false);
		setStaleDiscarded(false);
		clearRunStepDraft(runCaseId);
	}, [runCaseId, setDirty, setStaleDiscarded]);

	const reset = useCallback(() => {
		setDraft(baselineOf(stepResults));
		markSaved();
	}, [markSaved, setDraft, stepResults]);

	return { markSaved, reset };
}

export function useRunStepDraft(
	options: RunStepDraftOptions
): RunStepDraftHandle {
	const { caseVersion, runCaseId, stepResults, steps } = options;
	const [draft, setDraft] = useState<RunStepDraftState>(() =>
		baselineOf(stepResults)
	);
	const [dirty, setDirty] = useState(false);
	const [staleDiscarded, setStaleDiscarded] = useState(false);

	// 下面两个 effect 都要读「此刻脏不脏」，但都**不能**把它写进依赖：
	// 写进去会让「跟随服务端」在每次保存后多跑一趟、把刚点的东西冲掉。
	const dirtyRef = useRef(dirty);
	dirtyRef.current = dirty;

	/**
	 * 跟随服务端。别人（或自己上一次保存）改了这条用例的分步结果时，
	 * 把工作副本重新对齐——**除非手上有没保存的改动**：那种时候用服务端的值
	 * 覆盖用户正在点的东西，等于替他撤销了一整屏操作。
	 */
	useEffect(() => {
		if (!dirtyRef.current) {
			setDraft(baselineOf(stepResults));
		}
	}, [stepResults]);

	/**
	 * 本机草稿覆盖。**必须在 useEffect 里读 localStorage**：这一页会 SSR，
	 * 首帧就去读存储必然造成 hydration 不一致（同一条口径见
	 * `workspace/use-module-expansion.ts` 的文件头）。
	 */
	useEffect(() => {
		const found = readRunStepDraft(runCaseId, caseVersion);
		if (found.kind === "stale") {
			setStaleDiscarded(true);
			return;
		}
		if (found.kind === "ok") {
			setDraft({ comments: found.draft.comments, judged: found.draft.judged });
			setDirty(true);
		}
	}, [caseVersion, runCaseId]);

	useDraftPersistence({ caseVersion, dirty, draft, runCaseId });

	const edits = useDraftEdits({ setDirty, setDraft, steps });
	const exits = useDraftExits({
		runCaseId,
		setDirty,
		setDraft,
		setStaleDiscarded,
		stepResults,
	});

	return {
		...edits,
		...exits,
		comments: draft.comments,
		dirty,
		judged: draft.judged,
		staleDiscarded,
	};
}
