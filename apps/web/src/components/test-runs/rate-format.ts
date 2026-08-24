/**
 * 比率 → 百分比字符串。**只做格式化，不产生任何口径。**
 *
 * 单独成一个中立文件，是因为列表页与报告页都要用它，而两边原先的落脚点都不合适：
 *
 * - 放 `report-meta.ts`（报告页的展示元数据）会让**列表页 import 报告页**——
 *   列表是报告的上游，依赖方向反了；报告页将来被重写或拆掉，列表页会跟着塌。
 * - 放 `test-run-rates.ts` 也不行：那个文件除了率的口径，还装着状态筛选下拉的
 *   选项顺序、删除禁用的提示文案这些**列表页专属**的东西，报告页 import 它
 *   等于把列表页的常量拖进报告页的模块图里。
 *
 * 与 `test-run-rates.ts` 的分工是一条线：那边管「一堆计数 → 一个 `number | null`
 * 的率」（口径，分母算不算阻塞与跳过），这边管「`number | null` → 一个字符串」
 * （格式，四舍五入怎么让、null 显示成什么）。两件事各改各的，互不牵连。
 */

const PERCENT = 100;

/**
 * 分母为 0 时显示的破折号。
 *
 * 后端在分母为 0 时返回 `null` 而不是 0，UI 也必须显示这个而不是「0%」：
 * 「通过率 0%」是一句关于质量的强判断，而分母为 0 意味着我们对质量一无所知。
 *
 * 常量只此一份，列表页与报告页都从这里取：两边各写一个的话，
 * 「—」（U+2014）和「-」（ASCII）迟早会在同一屏上并存。
 */
export const RATE_UNKNOWN = "—";

/** 四舍五入后会顶到 100% / 掉到 0% 时的替代值，理由见 formatRate。 */
const NEAR_FULL_PERCENT = 99;
const NEAR_ZERO_PERCENT = 1;

/**
 * 把 0–1 的率格式化成百分比字符串。
 *
 * **未满 100% 绝不显示成 100%**：119/120 四舍五入是 100%，而报告页最核心的一句话
 * 就是「已完成 ≠ 全部通过」（plan §2.4）。一个显示 100% 的通过率会让读报告的人
 * 直接下「可以上线」的结论，而实际还挂着一条。这条在列表页同样致命——那一列的
 * 100% 会被直接读成「可以发版」。反方向同理：0.4% 显示成 0% 会把「有一条过了」
 * 抹成「一条都没过」。两端各让一档，中间照常四舍五入。
 */
export function formatRate(rate: number | null): string {
	if (rate === null) {
		return RATE_UNKNOWN;
	}
	const percent = rate * PERCENT;
	const rounded = Math.round(percent);
	if (rounded === PERCENT && percent < PERCENT) {
		return `${NEAR_FULL_PERCENT}%`;
	}
	if (rounded === 0 && percent > 0) {
		return `${NEAR_ZERO_PERCENT}%`;
	}
	return `${rounded}%`;
}

/** 占比（整数百分比），只用于图例这类辅助读数；total 为 0 时返回 0。 */
export function formatShare(count: number, total: number): string {
	if (total === 0) {
		return "0%";
	}
	return formatRate(count / total);
}
