/**
 * 执行结论面板的「结果页面 / 修改页面」开关。
 *
 * 它原先叫 `useSteppedEditingMode`、住在 `run-steps-section.tsx` 里，只管那一屏
 * 步骤卡片能不能点。现在它是**整个执行结论面板**的开关：结果页面上缺陷只剩一条
 * 链接、附件只剩传上来的图、说明只是一段文字，修改页面才给判定按钮、缺陷输入框
 * 与上传区（用户原话：「结果页面有才显示没有不显示，修改页面显示输入框让人
 * 输入」）。管的东西已经不止步骤，所以从那个文件里搬了出来。
 *
 * 三条语义一条不改：
 *
 * 初值：**这条用例还没判过就直接进改态**。分步形态看有没有保存过分步结果，
 * 非分步形态看结论是不是还等于「未测」——用户打开一条没测过的用例本来就是来判的，
 * 还要先点一下「修改」纯属多一步。判过的默认停在结果页面，要改得显式点「修改」。
 *
 * 本机草稿一旦恢复出来（`dirty` 变真）也要进改态：那份草稿正是上次没写完的判定，
 * 摆在只读界面里等于用户看得见自己写的字却动不了。这一条落在 `useRunStepsSection`
 * 里——`dirty` 是工作副本的状态，只有那边看得见，它调这里的 `startEditing`。
 *
 * `canConclude` 是一票否决：待评审 / 已提交的任务谁都不能改，这时连「修改」都不给。
 * 否决只在读出去的两个字段上生效，`editing` 这个 state 本身不动：任务从待评审
 * 评审完变成可测时，用户不该被要求先点一下「修改」才能接着判。
 *
 * 初值只在挂载那一次算，这是**要的**：面板由 `key={selected.runCase.id}` 挂着，
 * 只有切用例才重挂。用户在改态里刚点完「失败」，`hasVerdict` 当场变真，
 * 但这一屏不该因此弹回结果页面——他多半正要接着写失败原因、贴图、挂缺陷。
 *
 * 由 `RunCasePanel` 调用，结果同时喂给抬头的「修改」按钮、执行结论面板和步骤那一段
 * ——它们互为兄弟节点，状态只能放在共同的父节点上。
 */
import { useCallback, useState } from "react";

export interface VerdictEditingMode {
	/** 已经被 `canConclude` 否决过的最终读 / 改态，直接拿去用。 */
	editing: boolean;
	/** `null` = 这个任务谁都不能改（待评审 / 已提交），连「修改」都不给。 */
	onEdit: (() => void) | null;
	/** 草稿恢复出来时强制进改态用；只有 `RunStepsSection` 会调。 */
	startEditing: () => void;
	/** 保存成功后退出改态。 */
	stopEditing: () => void;
}

export function useVerdictEditingMode(
	hasVerdict: boolean,
	canConclude: boolean
): VerdictEditingMode {
	const [editing, setEditing] = useState(!hasVerdict);
	const startEditing = useCallback(() => setEditing(true), []);
	const stopEditing = useCallback(() => setEditing(false), []);
	return {
		editing: canConclude && editing,
		onEdit: canConclude ? startEditing : null,
		startEditing,
		stopEditing,
	};
}
