/**
 * 用户名首字符做头像：账号由管理员创建，没有上传头像这回事。
 *
 * 自 user-menu.tsx 拆出——那里如今只剩菜单要用的几个 hook。
 */
export function UserAvatar({ username }: { username: string }) {
	return (
		<span
			aria-hidden="true"
			className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-medium text-sidebar-primary-foreground text-xs"
		>
			{[...username][0] ?? "?"}
		</span>
	);
}
