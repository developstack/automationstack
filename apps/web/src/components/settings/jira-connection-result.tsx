import type { JiraConnectionTestResult } from "@automationstack/api/routers/jira";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

interface ResultCopy {
	detail: string;
	ok: boolean;
	title: string;
}

function describeResult(result: JiraConnectionTestResult): ResultCopy {
	switch (result.kind) {
		case "credentials-unavailable":
			return {
				detail:
					result.reason === "master-key-missing"
						? "服务端未配置 SECRET_ENCRYPTION_KEY，已存的 API Token 解不开。补上该环境变量后重试（openssl rand -base64 32）。"
						: "已存的 API Token 解不开——主密钥被换过了，旧密文找不回来。请重新填写一次 API Token 并保存。",
				ok: false,
				title: "凭据当前不可用",
			};
		case "failed":
			return { detail: result.message, ok: false, title: "连接失败" };
		case "ok":
			return {
				detail: `账号：${result.accountDisplayName ?? "未知"}；项目：${result.projectName ?? "未知"}`,
				ok: true,
				title: "连接成功",
			};
		default:
			return {
				detail:
					"本项目还没有可用的 Jira 配置。首次接入请填好全部字段（含 API Token）后先保存，再测试。",
				ok: false,
				title: "尚未配置",
			};
	}
}

export function JiraConnectionResult({
	result,
}: {
	result: JiraConnectionTestResult;
}) {
	const copy = describeResult(result);

	return (
		<div
			className={
				copy.ok
					? "flex items-start gap-2 rounded-lg bg-muted p-3 text-xs"
					: "flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			}
			role="status"
		>
			{copy.ok ? (
				<CircleCheckIcon aria-hidden="true" className="size-4 shrink-0" />
			) : (
				<TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
			)}
			<div className="flex flex-col gap-1">
				<p className="font-medium">{copy.title}</p>
				<p className="break-all">{copy.detail}</p>
			</div>
		</div>
	);
}
