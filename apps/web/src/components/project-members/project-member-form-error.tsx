/**
 * 项目成员表单里那一行服务端错误。
 *
 * 原先它是 `components/members/member-form-fields.tsx` 的一部分，被平台账号页
 * 与项目成员页共用。平台账号页随「在线 AI agent + 平台账号」那批入口一起删掉
 * 之后，只剩项目成员这一个调用方，就把它搬进了本目录——留一个只为一个调用方
 * 存在的共享目录，下一个人会以为那里还有别的东西。
 */

/**
 * role="alert" 让读屏在提交失败时立即播报，位置紧贴提交按钮上方。
 * message 为 undefined 时整块不渲染。
 */
export function ProjectMemberFormError({
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
