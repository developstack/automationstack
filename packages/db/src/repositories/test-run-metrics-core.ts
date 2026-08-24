/**
 * 报告页两个率的口径（plan §2.4）。**两个率的分母完全不同**，这是本文件存在的
 * 全部理由：分子分母一旦在某个调用点被就地手写，早晚会有人把 blocked 也算进
 * 通过率的分母，然后「通过率 92%」变成「通过率 78%」而没有任何地方报错。
 */

/** 通过率的分母只由这两个数决定。 */
export interface PassRateCounts {
	failed: number;
	passed: number;
}

/** 完成率的分母是总数，四种结论都算「测过了」。 */
export interface CompletionCounts {
	total: number;
	untested: number;
}

/**
 * 完成率 = 有结论 / 总数，取值 0–1（格式化留给 UI）。
 *
 * 空测试任务返回 `null` 而不是 0：0 意味着「一条都没测」，空测试任务是「没什么可测」，
 * 报告页对这两件事该说的话不一样。
 */
export function computeCompletionRate(counts: CompletionCounts): number | null {
	if (counts.total === 0) {
		return null;
	}
	return (counts.total - counts.untested) / counts.total;
}

/**
 * 通过率 = 通过 / (通过 + 失败)，**阻塞与跳过踢出分母**（plan §2.4）。
 *
 * 阻塞和跳过是逃生口，代表「没测成」而不是「测了不合格」，留在分母里会让
 * 一个因为环境挂了而大面积阻塞的测试任务看起来像质量崩了，进而逼着执行的人乱打
 * 「通过」把数字糊回去——那才是真正毁掉这份数据的时刻。
 *
 * 分母为 0（一条都没通过也没失败，全是未测/阻塞/跳过）返回 `null` 而不是 0：
 * 「通过率 0%」是一句关于质量的强判断，而此刻我们对质量一无所知，
 * 报告页应当显示「—」。
 */
export function computePassRate(counts: PassRateCounts): number | null {
	const denominator = counts.passed + counts.failed;
	if (denominator === 0) {
		return null;
	}
	return counts.passed / denominator;
}
