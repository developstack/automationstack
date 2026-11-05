import type { StorageSettingsView } from "@automationstack/api/storage/settings-view";
import { Badge } from "@automationstack/ui/components/badge";

import { SettingsSection } from "@/components/settings/settings-section";
import {
	BACKEND_LABELS,
	lastChangeLabel,
	SOURCE_LABELS,
	SOURCE_NOTES,
} from "@/components/storage-settings/storage-settings-form-values";

const ROW = "grid grid-cols-3 gap-2 text-xs";
const TERM = "text-muted-foreground";
const DETAIL = "col-span-2 break-all";

function activeBackendLabel(view: StorageSettingsView): string {
	const label = BACKEND_LABELS[view.activeBackend];
	return view.activeBackend === view.backend
		? label
		: `${label}（R2 的配置不能使用，新文件暂时写在服务器本地）`;
}

export function StorageSettingsStatus({ view }: { view: StorageSettingsView }) {
	return (
		<SettingsSection
			description={SOURCE_NOTES[view.source]}
			headingId="storage-settings-status-heading"
			title="状态"
		>
			<dl className="flex flex-col gap-2">
				<div className={ROW}>
					<dt className={TERM}>新文件写到</dt>
					<dd className={DETAIL}>{activeBackendLabel(view)}</dd>
				</div>
				<div className={ROW}>
					<dt className={TERM}>本地目录</dt>
					<dd className={DETAIL}>
						<code>{view.localDirectory}</code>（环境变量 FILE_STORAGE_DIR）
					</dd>
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
					<dt className={TERM}>最后修改</dt>
					<dd className={DETAIL}>{lastChangeLabel(view)}</dd>
				</div>
			</dl>
		</SettingsSection>
	);
}
