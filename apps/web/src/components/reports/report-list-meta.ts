/** 提交人的显示名称。提交人为空表示系统自动提交；有 id 没有名称表示账号已删除。 */
export function submitterLabel(id: string | null, name: string | null): string {
	if (id === null) {
		return "系统自动提交";
	}
	return name ?? "已删除的账号";
}
