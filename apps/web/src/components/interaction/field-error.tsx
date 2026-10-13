/**
 * 字段旁边的错误提示。字段用 aria-describedby 指向 id，
 * 并在有错误时设 aria-invalid。没有错误时不渲染。
 */
export function FieldError({
	id,
	message,
}: {
	id: string;
	message: string | null;
}) {
	if (message === null) {
		return null;
	}

	return (
		<p className="text-destructive text-xs" id={id}>
			{message}
		</p>
	);
}
