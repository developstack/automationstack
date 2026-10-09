import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { Badge } from "@automationstack/ui/components/badge";

import {
	emergencyLoginLabel,
	lastChangeLabel,
	lastTestLabel,
	PROVIDER_LABELS,
	SOURCE_LABELS,
	SOURCE_NOTES,
} from "@/components/auth-settings/auth-settings-labels";
import { SettingsSection } from "@/components/settings/settings-section";

const ROW = "grid grid-cols-3 gap-2 text-xs";
const TERM = "text-muted-foreground";
const DETAIL = "col-span-2";

export function AuthSettingsStatus({ view }: { view: AuthSettingsView }) {
	return (
		<SettingsSection
			description={SOURCE_NOTES[view.source]}
			headingId="auth-settings-status-heading"
			title="状态"
		>
			<dl className="flex flex-col gap-2">
				<div className={ROW}>
					<dt className={TERM}>当前认证方式</dt>
					<dd className={DETAIL}>{PROVIDER_LABELS[view.provider]}</dd>
				</div>
				<div className={ROW}>
					<dt className={TERM}>配置来源</dt>
					<dd className={DETAIL}>
						<Badge variant={view.source === "database" ? "default" : "outline"}>
							{SOURCE_LABELS[view.source]}
						</Badge>
					</dd>
				</div>
				<div className={ROW}>
					<dt className={TERM}>应急登录</dt>
					<dd className={DETAIL}>{emergencyLoginLabel(view)}</dd>
				</div>
				<div className={ROW}>
					<dt className={TERM}>最后一次测试成功</dt>
					<dd className={DETAIL}>{lastTestLabel(view)}</dd>
				</div>
				<div className={ROW}>
					<dt className={TERM}>最后修改</dt>
					<dd className={DETAIL}>{lastChangeLabel(view)}</dd>
				</div>
			</dl>
		</SettingsSection>
	);
}
