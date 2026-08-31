/**
 * 平台用户相关表单的服务端错误行。原与 PlatformUserField 同住
 * platform-user-form-fields.tsx，按「一个文件一个对外组件」拆开。
 */

/**
 * 服务端错误（用户名已占用、最后一个管理员等）就地显示。
 * role="alert" 让读屏在提交失败时立即播报，位置紧贴提交按钮上方。
 *
 * 与 project-members/project-member-form-error.tsx 是同形的两份，刻意不合并：
 * 那一份当初正是从本目录的前身（已删除的 components/members/）搬过去的，搬家的
 * 理由写在它的头注释里——留一个只为跨作用域共享而存在的目录，下一个人会以为那
 * 里还有别的东西。两个作用域各留一份 12 行的组件，比再造一个共享目录便宜。
 */
export function PlatformUserFormError({
	message,
}: {
	message: string | undefined;
}) {
	if (message === undefined) {
		return null;
	}
	return (
		<p className="text-destructive text-xs" role="alert">
			{message}
		</p>
	);
}
