/**
 * 从测试标题里取 `sourceRef`。
 *
 * ## 为什么这段代码在示例里，而不在 SDK 里
 *
 * 「用例标题里方括号包一个 id」只是**这个仓库的约定**，不是协议的一部分。
 * 别人可能把 sourceRef 放在 playwright 的 annotation、pytest 的 marker、
 * 或者一张单独的映射表里。SDK 猜一种写法就等于逼所有人改成那一种；
 * 所以 SDK 只认 `{ sourceRef, result }` 这个形状，怎么得到 sourceRef 是切面的事。
 *
 * ⚠️ 这个文件是**切面的一部分**，不是测试的一部分：三个适配器都调它，
 * 测试文件一个都不调——测试文件根本不知道自己的标题被谁读过。
 */

/** 顶层定义：每条测试事件都会用到它，没必要在循环里重建一个正则。 */
const SOURCE_REF_PATTERN = /\[([A-Z][A-Z0-9-]*)\]/;

/**
 * 取不到就返回 null，**调用方据此整条跳过不报**。
 *
 * 这条「取不到就不报」很关键：三个框架的事件流里除了用例本身，还会混进
 * 文件级、套件级的汇总事件（名字就是文件路径或 describe 标题）。把它们一并报上去，
 * 对账单上会多出一批「项目里没有这个 sourceRef 的用例」——真正的拼写错误
 * 就被淹没在里面了。
 */
export function extractSourceRef(title: string | undefined): string | null {
	if (typeof title !== "string") {
		return null;
	}
	const matched = SOURCE_REF_PATTERN.exec(title);
	return matched?.[1] ?? null;
}
