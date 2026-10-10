/** webhook 触发后等待这么久再对账。这段时间内的其他事件合并为一次对账。 */
export const RECONCILE_DEBOUNCE_MS = 2000;

export interface ReconcileScheduler {
	/** 定期任务调用：立即对账。已经在对账时不重复执行。 */
	runNow: () => Promise<void>;
	/** webhook 调用：延迟对账。多次调用合并为一次；对账进行中时，结束后再执行一次。 */
	trigger: () => void;
}

export interface SchedulerOptions {
	debounceMs?: number;
	onError?: (error: unknown) => void;
	run: () => Promise<unknown>;
}

/** 保证同一时间只有一次对账，并合并连续的触发。 */
export function createReconcileScheduler(
	options: SchedulerOptions
): ReconcileScheduler {
	const debounceMs = options.debounceMs ?? RECONCILE_DEBOUNCE_MS;
	const onError = options.onError ?? console.error;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let rerun = false;

	function trigger(): void {
		if (timer !== null) {
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			if (running) {
				rerun = true;
				return;
			}
			execute().catch(onError);
		}, debounceMs);
	}

	async function execute(): Promise<void> {
		running = true;
		try {
			await options.run();
		} catch (error) {
			onError(error);
		} finally {
			running = false;
			if (rerun) {
				rerun = false;
				trigger();
			}
		}
	}

	return {
		runNow: async () => {
			if (!running) {
				await execute();
			}
		},
		trigger,
	};
}
