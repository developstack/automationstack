export const MINDMAP_MERGE_DELAY_MS = 300;

export const MINDMAP_MERGE_MAX_WAIT_MS = 1000;

export interface TrailingMergeOptions<T> {
	canFlush: () => boolean;
	delayMs: number;
	maxWaitMs: number;
	now?: () => number;
	onFlush: (value: T) => void;
}

type MergePhase = "blocked" | "idle" | "merging";

export class TrailingMerge<T> {
	private deadline = 0;
	private readonly options: TrailingMergeOptions<T>;
	private pending: { value: T } | null = null;
	private phase: MergePhase = "idle";
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(options: TrailingMergeOptions<T>) {
		this.options = options;
	}

	push(value: T): void {
		const first = this.phase === "idle";
		this.pending = { value };
		if (first) {
			this.deadline = this.now() + this.options.maxWaitMs;
			this.phase = "merging";
			this.arm(this.options.delayMs);
			return;
		}
		if (this.phase === "merging") {
			this.arm(Math.min(this.options.delayMs, this.deadline - this.now()));
		}
	}

	retry(): void {
		if (this.phase === "blocked") {
			this.attempt();
		}
	}

	cancel(): void {
		this.pending = null;
		this.phase = "idle";
		this.clearTimer();
	}

	hasPending(): boolean {
		return this.pending !== null;
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}

	private clearTimer(): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private arm(delay: number): void {
		this.clearTimer();
		this.timer = setTimeout(
			() => {
				this.timer = null;
				this.phase = "blocked";
				this.attempt();
			},
			Math.max(delay, 0)
		);
	}

	private attempt(): void {
		const { pending } = this;
		if (pending === null) {
			return;
		}
		if (!this.options.canFlush()) {
			this.arm(this.options.delayMs);
			return;
		}
		this.cancel();
		this.options.onFlush(pending.value);
	}
}
