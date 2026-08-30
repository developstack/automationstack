/**
 * 用例级四颗结论按钮（P / F / B / S）到底给不给——**唯一**的一份判据。
 *
 * ## 为什么要有这么一个只有一行的函数
 *
 * 它原先不存在，同一件事在两处各写了一遍布尔表达式：
 *
 * - 按钮那边：改态里才画（`editing`），且只在非分步形态下画（`!hasSteps`）；
 * - 快捷键那边（当时挂在 `run-execution-state.ts` 的页面级 hook 上）：
 *   `canConclude && selected !== null && steps.length === 0`。
 *
 * 两条式子在「已提交 / 待评审」上碰巧一致（`editing` 内含 `canConclude` 的一票
 * 否决），在**只读态**上却分了叉：一条判过的用例默认停在结果页面，按钮按规则藏
 * 起来了，而页面级那条式子看不见读 / 改态，键还活着——按一下 P 就能悄悄改写这条
 * 用例的结论，界面上没有任何东西提示刚刚发生了什么。键盘绕过了界面上的判定，
 * 这是 bug 不是口味。
 *
 * 修法不是给快捷键那条式子再补一个 `&& editing`（那只是把两套并行表达式改成两套
 * 更长的并行表达式，下次加一档限制照样漏），而是让两处**共用这一个函数**：
 * 判据只有一份，就不存在「哪一处忘了跟着改」。
 *
 * 调用点只有两个，都在 `RunCasePanel` 那棵子树里：
 *
 * 1. `run-case-verdict-body.tsx`——决定画不画那四颗按钮；
 * 2. `run-case-panel.tsx`——决定挂不挂 P / F / B / S 的监听。
 *
 * 顺带还有第三处必须跟着走：结论面板顶上那行快捷键提示
 * （`run-case-verdict-panel.tsx`）。提示与键必须同真同假——键活着却没提示，
 * 是个按下去会改数据的隐形快捷键；提示留着而键已经不响应，是句假话。
 *
 * ## 分步形态不走这里
 *
 * 有步骤的用例上，同样四个键由 `useRunStepShortcuts` 接管（改成「判给下一个还没
 * 判的步骤」），它的开关本来就直接用 `editing`——与那一屏步骤卡片能不能点是同一
 * 个值，没有分叉。两套监听靠 `hasSteps` 互斥，永远只有一处挂着。
 */

export interface CaseVerdictEntry {
	/**
	 * 执行结论面板此刻是不是改态。
	 * 来自 `useVerdictEditingMode`，**已经含了 `canConclude` 的一票否决**——
	 * 所以这里不该再出现第二个 `canConclude`，那就又是一份并行判据了。
	 */
	editing: boolean;
	/** 有步骤的用例走分步判定，用例级入口一律不给（否则会把逐步判定铺平）。 */
	hasSteps: boolean;
}

export function canPickCaseVerdict(entry: CaseVerdictEntry): boolean {
	return entry.editing && !entry.hasSteps;
}
