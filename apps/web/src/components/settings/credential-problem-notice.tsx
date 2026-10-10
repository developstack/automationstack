import { TriangleAlertIcon } from "lucide-react";

export function CredentialProblemNotice({ reason }: { reason: string }) {
	const detail =
		reason === "master-key-missing"
			? "服务端未配置 SECRET_ENCRYPTION_KEY，已存的 API Token 解不开。补上该环境变量后即可恢复，数据没有损坏。"
			: "已存的 API Token 解不开——主密钥被换过了，旧密文找不回来。请重新填写一次 API Token 并保存。";

	return (
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="status"
		>
			<TriangleAlertIcon
				aria-hidden="true"
				className="icon-stroke-medium mt-0.5 size-3.5 shrink-0"
			/>
			<div className="flex flex-col gap-1">
				<p className="font-medium">当前 Jira 凭据不可用</p>
				<p>{detail}</p>
			</div>
		</div>
	);
}
