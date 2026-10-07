import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { useEffect } from "react";

import { VERDICT_SHORTCUT_KEYS } from "@/components/test-runs/test-run-meta";

const RESULT_BY_KEY = new Map<string, TestRunCaseResult>(
	Object.entries(VERDICT_SHORTCUT_KEYS)
		.filter(([, key]) => key !== "")
		.map(([result, key]) => [key, result as TestRunCaseResult])
);

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
	enabled: boolean;
	onVerdict: (result: TestRunCaseResult) => void;
}

export function useRunShortcuts({
	enabled,
	onVerdict,
}: RunShortcutOptions): void {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
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
		if (enabled) {
			document.addEventListener("keydown", onKeyDown);
		}
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [enabled, onVerdict]);
}
