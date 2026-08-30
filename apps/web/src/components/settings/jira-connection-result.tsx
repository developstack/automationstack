/**
 * 「测试连接」的结果条。
 *
 * 服务端把自检做成**类型化返回值而不是异常**（见 `jira.testConnection`），
 * 因为「测不通」正是这颗按钮的预期输出之一。所以这里也照着四种 kind 分开说，
 * 而不是统统渲染成一句「失败」——四种情况要做的事完全不同：
 * 改凭据、找 Jira 管理员、补服务端环境变量、还是先保存一次配置。
 */
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
		/*
		 * role="status" 而不是 alert：它是用户刚刚主动点按钮换来的答复，
		 * 不是打断性的告警；alert 会抢读屏当前的朗读。
		 * 图标 aria-hidden，语义全在文字里——只靠颜色区分成功/失败不够。
		 */
		<div
			className={
				copy.ok
					? "flex items-start gap-2 rounded-lg bg-muted p-3 text-xs"
					: "flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			}
			role="status"
		>
			{/*
			 * 不加 mt-0.5：这块是 text-xs（行高 16px），图标 size-4 也是 16px，
			 * items-start 下两个盒子本来就顶齐；那 2px 是净错位，不是补偿。
			 */}
			{copy.ok ? (
				<CircleCheckIcon aria-hidden="true" className="size-4 shrink-0" />
			) : (
				<TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
			)}
			<div className="flex flex-col gap-1">
				<p className="font-medium">{copy.title}</p>
				{/* 站点地址与 Jira 的报错都可能很长，窄屏必须允许任意处断行 */}
				<p className="break-all">{copy.detail}</p>
			</div>
		</div>
	);
}
