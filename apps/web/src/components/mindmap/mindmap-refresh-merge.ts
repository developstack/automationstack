/**
 * 远端 `data:invalidate` 的尾沿（trailing）合并调度。
 *
 * 每次队友保存都会让 `mindmap.tree` 失效 → 重新拉取 → 画布整棵重绘。
 * 重绘是 O(节点数) 的 DOM 重建 + 回流，2000 节点量级要几百毫秒，
 * 所以「连续 5 次失效」不能变成「连续 5 次重绘」。
 *
 * 这里不是「延后重绘」而是「合并重绘」：窗口内到达的快照互相覆盖，
 * 只有最后一个会被画出来 —— 快照是服务端全量树，后来的一定是前面
 * 那个的超集语义，丢掉中间态不丢数据。
 *
 * 两个容易写错的点，都用单测钉住：
 * 1. 最后一次入队的值必须被画出来（尾沿合并最常见的 bug 是丢掉最后一次）；
 * 2. 持续不断的失效不能把重绘饿死 —— `maxWaitMs` 是首次入队起算的硬上限。
 *
 * `canFlush()` 为 false 时（有 in-flight 批次 / 内联编辑框开着）重绘会毁掉
 * 用户正在做的事，此时保持挂起并轮询重试，直到画布空闲。
 */

/** 静默窗口：窗口内的新快照只替换待绘值，不额外排一次重绘。 */
export const MINDMAP_MERGE_DELAY_MS = 300;

/**
 * 首次入队到最迟重绘之间的上限。没有它，一位持续保存的队友
 * （每次保存间隔 < 300ms）能让另一位的画布永远停在旧数据上。
 */
export const MINDMAP_MERGE_MAX_WAIT_MS = 1000;

export interface TrailingMergeOptions<T> {
	/** 返回 false 表示现在重绘会破坏用户正在做的事，稍后重试。 */
	canFlush: () => boolean;
	/** 静默窗口毫秒数。 */
	delayMs: number;
	/** 首次入队起算的最长等待，防止持续输入把 flush 饿死。 */
	maxWaitMs: number;
	/** 注入时钟，方便单测；缺省用 `Date.now`。 */
	now?: () => number;
	/** 真正执行合并结果的副作用（重绘）。 */
	onFlush: (value: T) => void;
}

/**
 * - `idle`：没有挂起的快照。
 * - `merging`：静默窗口里，新快照只替换待绘值。
 * - `blocked`：窗口已过去，只差画布空闲，不再重新计时。
 */
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

	/** 入队一个新快照；同窗口内的旧快照被直接覆盖。 */
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

	/**
	 * 外部事件（批次落库、内联编辑框关闭）解除了「忙」状态时的立即重试。
	 * 静默窗口还没过去就不动：那是合并本身要等的时间，不是忙等。
	 */
	retry(): void {
		if (this.phase === "blocked") {
			this.attempt();
		}
	}

	/** 丢弃挂起的快照（画布已经用别的路径画过了，或者实例被卸载）。 */
	cancel(): void {
		this.pending = null;
		this.phase = "idle";
		this.clearTimer();
	}

	/** 供测试与调试：是否还有没画出来的快照。 */
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
