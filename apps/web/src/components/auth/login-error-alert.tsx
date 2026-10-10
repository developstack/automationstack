import { TriangleAlertIcon } from "lucide-react";

/** 登录页的提示区：Casdoor 登录失败的原因，或登录请求的网络错误、5xx 错误和限流提示。 */
export function LoginErrorAlert({ message }: { message: string }) {
	return (
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="alert"
		>
			<TriangleAlertIcon
				aria-hidden="true"
				className="icon-stroke-regular mt-0.5 size-3.5 shrink-0"
			/>
			<p>{message}</p>
		</div>
	);
}
