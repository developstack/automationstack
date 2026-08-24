/**
 * P / F / B / S 打结论的快捷键（plan §7.3）。
 *
 * 每个键面都印在对应按钮上（`VERDICT_SHORTCUT_KEYS`），并在结论区上方
 * 常驻一行文字说明「打完自动跳下一条」——没有可见提示的快捷键等于不存在。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { useEffect } from "react";

import { VERDICT_SHORTCUT_KEYS } from "@/components/test-runs/test-run-meta";

/** 键（大写）→ 结论。从同一份键面映射反推，两处不会漂移。 */
const RESULT_BY_KEY = new Map<string, TestRunCaseResult>(
	Object.entries(VERDICT_SHORTCUT_KEYS)
		.filter(([, key]) => key !== "")
		.map(([result, key]) => [key, result as TestRunCaseResult])
);

/**
 * 焦点在可输入元素里时不接管按键。
 *
 * 否则在「说明」里打一个 f 就会把这条判成失败——这是单字母快捷键最典型的
 * 事故。`isContentEditable` 一并挡住，将来富文本编辑器进来时不必回头补。
 */
function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	if (target.isContentEditable) {
		return true;
	}
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface RunShortcutOptions {
	/** false 时整个监听不挂：待评审与已提交都不该响应这些键。 */
	enabled: boolean;
	onVerdict: (result: TestRunCaseResult) => void;
}

export function useRunShortcuts({
	enabled,
	onVerdict,
}: RunShortcutOptions): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			// 带修饰键的一律放行：Ctrl+F 是浏览器查找，Cmd+P 是打印，
			// 抢走它们比少一个快捷键糟得多。
			if (event.altKey || event.ctrlKey || event.metaKey) {
				return;
			}
			if (isTypingTarget(event.target)) {
				return;
			}
			const result = RESULT_BY_KEY.get(event.key.toUpperCase());
			if (result === undefined) {
				return;
			}
			event.preventDefault();
			onVerdict(result);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [enabled, onVerdict]);
}
