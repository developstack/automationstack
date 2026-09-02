/**
 * 单调时钟 ↔ 墙钟的标定器。
 *
 * 从 `normalize.ts` 拆出来：那份文件到了 403 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为它是归一化层里
 * 唯一带状态的东西（那一次性的偏移量），其余每个 normalize* 都是纯函数；
 * 时间轴的口径（CDP 的三种时间戳）见 `normalize.ts` 的文件头注释。
 */

export const MS_PER_SECOND = 1000;

/**
 * 单调时钟 ↔ 墙钟的标定器。只标定一次：会话内漂移可以忽略，而反复标定会让
 * 事件流的 ts 出现回退，比误差更难排查。
 */
export interface RecorderClock {
	calibrate: (monotonicSeconds: number, wallTimeSeconds: number) => void;
	now: () => number;
	toEpochMs: (monotonicSeconds: number) => number;
}

export const createRecorderClock = (
	now: () => number = Date.now
): RecorderClock => {
	let offsetMs: number | null = null;

	return {
		calibrate(monotonicSeconds, wallTimeSeconds) {
			if (offsetMs !== null) {
				return;
			}
			const usable =
				Number.isFinite(monotonicSeconds) &&
				Number.isFinite(wallTimeSeconds) &&
				wallTimeSeconds > 0;
			if (!usable) {
				return;
			}
			offsetMs = (wallTimeSeconds - monotonicSeconds) * MS_PER_SECOND;
		},
		now,
		toEpochMs(monotonicSeconds) {
			if (offsetMs === null || !Number.isFinite(monotonicSeconds)) {
				// 还没拿到墙钟锚点：与其编一个假的绝对时间，不如用收到事件的时刻。
				return now();
			}
			return monotonicSeconds * MS_PER_SECOND + offsetMs;
		},
	};
};
