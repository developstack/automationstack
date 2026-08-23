/**
 * 订单管理模块的批量种子用例（供前端验证分页器）。
 *
 * 与服务端 DEFAULT_PAGE_SIZE = 20 配合：本文件产出 45 条批量用例，
 * 加上订单管理模块原有的 3 条手写演示用例共 48 条，
 * pageSize=20 时正好 3 页且末页只有 8 条（能验证「末页不满」的渲染）；
 * 整个演示项目共 9 + 45 = 54 条用例。
 *
 * 每条的 sourceRef 固定（seed:order:bulk:NN），因此重复执行 `pnpm db:seed`
 * 会被导入管道按 (projectId, sourceRef) 全部 skip，幂等性与手写用例一致。
 */

import type { SeedCaseSpec } from "../packages/db/src/repositories/seed-repository";

const BULK_CASE_COUNT = 45;
/** 序号补零宽度：两位即可覆盖 45 条，名称/sourceRef 排序与数值序一致。 */
const BULK_SERIAL_WIDTH = 2;
const BULK_FIRST_SERIAL = 1;

/**
 * 各池子长度（4/5/6/3）两两不同，取模轮转后能交叉出分散的组合，
 * 避免「优先级和状态永远成对出现」导致筛选+分页的组合测不出问题。
 */
const BULK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
const BULK_STATUSES = [
	"active",
	"active",
	"active",
	"draft",
	"deprecated",
] as const;
const BULK_TAG_SETS = [
	["订单", "回归"],
	["订单", "冒烟", "核心链路"],
	["订单", "异常流"],
	["订单", "接口"],
	["回归", "性能"],
	["订单", "回归", "UI"],
] as const;
const BULK_CASE_TYPES = ["functional", "interface", "other"] as const;
const BULK_MAINTAINERS = ["张三", "李四", "王五", "赵六"] as const;

function bulkOrderCase(serial: number): SeedCaseSpec {
	const label = String(serial).padStart(BULK_SERIAL_WIDTH, "0");
	return {
		caseType: BULK_CASE_TYPES[serial % BULK_CASE_TYPES.length] ?? "functional",
		maintainer: BULK_MAINTAINERS[serial % BULK_MAINTAINERS.length] ?? "张三",
		name: `订单列表回归用例 ${label}`,
		preconditions: `订单列表已存在不少于 ${serial} 条历史订单`,
		priority: BULK_PRIORITIES[serial % BULK_PRIORITIES.length] ?? "P2",
		sourceRef: `seed:order:bulk:${label}`,
		status: BULK_STATUSES[serial % BULK_STATUSES.length] ?? "active",
		steps: [
			{
				expected: "列表加载成功，总数与分页器页码一致",
				id: "s1",
				step: `按第 ${label} 组筛选条件打开订单列表`,
			},
			{
				expected: "页码切换正确，两页数据无重复无遗漏",
				id: "s2",
				step: "翻到下一页再翻回上一页",
			},
		],
		tags: [...(BULK_TAG_SETS[serial % BULK_TAG_SETS.length] ?? ["订单"])],
	};
}

/** 45 条批量用例，序号 01~45。 */
export const BULK_ORDER_CASES: SeedCaseSpec[] = Array.from(
	{ length: BULK_CASE_COUNT },
	(_unused, offset) => bulkOrderCase(offset + BULK_FIRST_SERIAL)
);
