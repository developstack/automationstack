export function JiraFieldError({
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
