import { TriangleAlertIcon } from "lucide-react";

/** Casdoor 登录失败后，服务端跳转回登录页时显示的提示。 */
export function LoginErrorAlert({ message }: { message: string }) {
	return (
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="alert"
		>
			<TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
			<p>{message}</p>
		</div>
	);
}
