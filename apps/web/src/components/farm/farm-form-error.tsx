/**
 * 农场相关表单/确认框的服务端错误行。
 *
 * 与 platform-users / project-members 各自那一份同形，刻意不合并——理由逐字见
 * platform-user-form-error.tsx 的头注释：为跨作用域共享 12 行组件而立一个共享
 * 目录，代价比留三份副本大。
 */

/** role="alert" 让读屏在提交失败时立即播报，位置紧贴提交按钮上方。 */
export function FarmFormError({ message }: { message: string | undefined }) {
	if (message === undefined) {
		return null;
	}
	return (
		<p className="text-destructive text-xs" role="alert">
			{message}
		</p>
	);
}
