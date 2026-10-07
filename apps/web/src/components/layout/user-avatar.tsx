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
