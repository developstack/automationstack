/**
 * 从测试标题里取 `sourceRef`。
 *
 * ## 为什么这段代码在示例里，而不在 SDK 里
 *
 * 「用例标题里方括号包一个 id」只是**这个仓库的约定**，不是协议的一部分。
 * 别人可能把 sourceRef 放在 playwright 的 annotation、pytest 的 marker、
 * 或者一张单独的映射表里。SDK 猜一种写法，就等于逼所有人改成那一种；
 * 所以 SDK 只认 `{ sourceRef, result }` 这个形状，怎么得到 sourceRef 是调用方的事——
 * 这十几行就是 README 里说的「搬运代码」，它待在你的仓库里，框架升级时改的是它。
 */

/** 顶层定义：每条测试事件都会用到它，没必要在循环里重建一个正则。 */
const SOURCE_REF_PATTERN = /\[([A-Z][A-Z0-9-]*)\]/;

/**
 * 取不到就返回 null，**调用方据此整条跳过不报**。
 *
 * 这条「取不到就不报」很关键：node:test 的事件流里除了用例本身，还会混进
 * 文件级的汇总事件（名字就是文件路径）。把它们一并报上去，对账单上会多出
 * 一批「项目里没有这个 sourceRef 的用例」——真正的拼写错误就被淹没在里面了。
 */
export function extractSourceRef(title) {
	if (typeof title !== "string") {
		return null;
	}
	const matched = SOURCE_REF_PATTERN.exec(title);
	return matched ? matched[1] : null;
}
