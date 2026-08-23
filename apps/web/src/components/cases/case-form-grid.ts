/**
 * 新建 / 编辑用例表单里所有短字段共用的一套栅格轨道。
 *
 * 原先短字段分在两个列数不同的栅格里（sm:grid-cols-2 与 sm:grid-cols-3）：
 * 1248px 内容宽下，两栏的竖向分界落在 618/630，三栏落在 408/420 与 828/840，
 * 而步骤行（1fr 1fr auto）又是第三套。四行四套节奏、没有一条内部竖边上下
 * 对得上，这就是「新建用例的输入框没有视觉对齐」的来源。
 *
 * 现在短字段全部落在同一套 6 轨上：每 2 轨 = 1/3 宽，内部竖边只可能出现在
 * 1/3 与 2/3 两处，行与行之间必然贯通。
 *
 * 窄屏（<640px）仍然单栏堆叠：320px 视口（或 200% 缩放）下抽屉内容区只剩
 * 288px，切两栏每栏 138px、切三栏只剩 88px，输入框窄到看不清内容。所以
 * col-span 一律带 sm: 前缀——sm 以下容器是 grid-cols-1，每个字段独占一行，
 * 左右边缘就是内容区的两条外边，天然对齐。
 */

/** 栅格轨道数。6 是 2 与 3 的最小公倍数，两栏行与三栏行才能共用同一套轨道。 */
export const CASE_FIELD_GRID_COLUMNS = 6;

/**
 * 栅格容器类。
 * gap-x-3(12px) 与步骤行的列间距同档，整个表单只有一种横向水槽；
 * gap-y-4(16px) 与 <form> 的 gap-4 同档，堆叠与并排的纵向节奏一致。
 */
export const CASE_FIELD_GRID_CLASS =
	"grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-6";

/** 短字段的键；顺序与渲染顺序无关，只用来把 span 与行定义绑在一起。 */
export type CaseFieldKey =
	| "caseType"
	| "maintainer"
	| "name"
	| "priority"
	| "status"
	| "tags";

/**
 * 每个字段占的轨道数。Tailwind 只扫描字面量、不能用模板串拼 col-span，
 * 所以类名写死，由 case-form-grid.test.ts 校验每行正好铺满 6 轨。
 *
 * 维护人 2 轨 / 标签 4 轨（而不是各 3 轨）：各 3 轨的分界会落在 1/2 处，
 * 与下一行三个枚举字段的 1/3、2/3 都对不上，等于又造一条孤立竖边；2 + 4
 * 让「维护人」的右边缘正好压在「优先级」的右边缘上。顺带也更合用——维护人
 * 只放一个人名，标签是会一直变长的逗号分隔列表，宽度该给会长的那个。
 */
export const CASE_FIELD_SPAN_CLASS: Record<CaseFieldKey, string> = {
	caseType: "sm:col-span-2",
	maintainer: "sm:col-span-2",
	name: "sm:col-span-6",
	priority: "sm:col-span-2",
	status: "sm:col-span-2",
	tags: "sm:col-span-4",
};

/** 按渲染顺序排的行；每行的 span 之和必须等于 CASE_FIELD_GRID_COLUMNS。 */
export const CASE_FIELD_ROWS: readonly (readonly CaseFieldKey[])[] = [
	["name"],
	["maintainer", "tags"],
	["priority", "caseType", "status"],
];
