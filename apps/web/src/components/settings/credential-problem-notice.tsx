/**
 * 「当前 Jira 凭据不可用」那条提示，自 jira-settings-section.tsx 拆出。
 *
 * 「没配」与「配了但解不开」是两件事（服务端在类型上就分开了），这一条只服务
 * 后者——把前者也画成红条，等于告诉每一个没接 Jira 的团队他们坏了。
 */
import { TriangleAlertIcon } from "lucide-react";

export function CredentialProblemNotice({ reason }: { reason: string }) {
	const detail =
		reason === "master-key-missing"
			? "服务端未配置 SECRET_ENCRYPTION_KEY，已存的 API Token 解不开。补上该环境变量后即可恢复，数据没有损坏。"
			: "已存的 API Token 解不开——主密钥被换过了，旧密文找不回来。请重新填写一次 API Token 并保存。";

	return (
		// role="status" 而不是 alert：它一进页面就在那儿，不是刚刚发生的事
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="status"
		>
			{/*
			 * 不加 mt-0.5：外层是 text-xs（行高 16px），图标 size-4 也是 16px，
			 * items-start 下两个盒子本来就顶齐；那 2px 是净错位，不是补偿。
			 */}
			<TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
			<div className="flex flex-col gap-1">
				<p className="font-medium">当前 Jira 凭据不可用</p>
				<p>{detail}</p>
			</div>
		</div>
	);
}
