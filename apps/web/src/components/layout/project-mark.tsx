const EMPTY_NAME_INITIAL = "?";

/** 项目名的第一个字符。项目名为空时显示问号。 */
const projectInitial = (projectName: string): string =>
	[...projectName][0] ?? EMPTY_NAME_INITIAL;

export function ProjectMark({ projectName }: { projectName: string }) {
	return (
		<span
			aria-hidden="true"
			className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary font-semibold text-primary-foreground text-xs"
		>
			{projectInitial(projectName)}
		</span>
	);
}
