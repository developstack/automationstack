import { Badge } from "@automationstack/ui/components/badge";
import { Button } from "@automationstack/ui/components/button";

import {
	type ConnectionChecks,
	connectionChecksSummary,
	STEP_STATUS_BADGES,
	STEP_STATUS_LABELS,
} from "@/components/auth-settings/auth-connection-checks-meta";
import { formatDateTime } from "@/components/cases/case-meta";
import { SettingsSection } from "@/components/settings/settings-section";

interface AuthConnectionChecksProps {
	checks: ConnectionChecks | null;
	/** 测试请求本身失败（例如参数格式不对）时的提示。 */
	error: string | null;
	onTest: () => void;
	pending: boolean;
	testing: boolean;
}

function ChecksResult({ checks }: { checks: ConnectionChecks }) {
	return (
		<div className="flex flex-col gap-3">
			<p className="text-xs">
				{connectionChecksSummary(checks)}
				{checks.testedAt === null ? null : (
					<span className="text-muted-foreground">
						{" "}
						测试时间：{formatDateTime(checks.testedAt)}
					</span>
				)}
			</p>
			<ol className="flex flex-col gap-2">
				{checks.steps.map((step) => (
					<li className="flex flex-col gap-1 text-xs" key={step.id}>
						<span className="flex items-center gap-2">
							<Badge variant={STEP_STATUS_BADGES[step.status]}>
								{STEP_STATUS_LABELS[step.status]}
							</Badge>
							<span>{step.label}</span>
						</span>
						{step.detail === null ? null : (
							<span className="break-all pl-1 text-muted-foreground">
								{step.detail}
							</span>
						)}
					</li>
				))}
			</ol>
		</div>
	);
}

/** 测试连接：用表单中当前的值（没有保存的值）测试（plan 021 §10.6 第 6 项）。 */
export function AuthConnectionChecks(props: AuthConnectionChecksProps) {
	return (
		<SettingsSection
			description="用表单中现在的值测试，不保存。Client Secret 留空时使用已保存的值。切换到 Casdoor 或在 Casdoor 模式下保存时，服务端会再测试一次，全部通过才保存。"
			headingId="auth-settings-checks-heading"
			title="测试连接"
		>
			<div>
				<Button
					disabled={props.pending || props.testing}
					onClick={props.onTest}
					type="button"
					variant="outline"
				>
					{props.testing ? "测试中…" : "测试连接"}
				</Button>
			</div>
			<div aria-live="polite" className="flex flex-col gap-3">
				{props.error === null ? null : (
					<p className="text-destructive text-xs">{props.error}</p>
				)}
				{props.checks === null ? null : <ChecksResult checks={props.checks} />}
			</div>
		</SettingsSection>
	);
}
