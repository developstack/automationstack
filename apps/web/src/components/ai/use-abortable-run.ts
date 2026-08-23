/**
 * 单任务的中止控制：并发守卫 + AbortController + 卸载时中止。
 *
 * controllerRef 非空即代表「有任务在跑」，同时充当并发守卫；
 * 被中止时不上报错误（AbortError 是预期路径）。
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AbortableRunOptions {
	onError: (error: unknown) => void;
	onSettled: () => void;
	task: (signal: AbortSignal) => Promise<void>;
}

export interface AbortableRun {
	isRunning: boolean;
	/** 已有任务在跑时直接忽略本次调用（并发守卫）。 */
	run: (options: AbortableRunOptions) => void;
	stop: () => void;
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

export function useAbortableRun(): AbortableRun {
	const controllerRef = useRef<AbortController | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	useEffect(
		() => () => {
			controllerRef.current?.abort();
		},
		[]
	);

	const stop = useCallback(() => {
		controllerRef.current?.abort();
	}, []);

	const run = useCallback((options: AbortableRunOptions) => {
		if (controllerRef.current !== null) {
			return;
		}
		const controller = new AbortController();
		controllerRef.current = controller;
		setIsRunning(true);
		options
			.task(controller.signal)
			.catch((error: unknown) => {
				if (!(controller.signal.aborted || isAbortError(error))) {
					options.onError(error);
				}
			})
			.finally(() => {
				controllerRef.current = null;
				setIsRunning(false);
				options.onSettled();
			});
	}, []);

	return { isRunning, run, stop };
}
