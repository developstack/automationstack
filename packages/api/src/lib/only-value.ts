/** 所有值都相同时返回这个值，否则返回 undefined。例如：一组用例都在同一个模块中时返回这个模块。 */
export function onlyValue(values: readonly string[]): string | undefined {
	const distinct = [...new Set(values)];
	return distinct.length === 1 ? distinct[0] : undefined;
}
