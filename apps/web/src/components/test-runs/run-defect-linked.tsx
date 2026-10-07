import { Button } from "@automationstack/ui/components/button";
import { BugIcon, ExternalLinkIcon, RefreshCwIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { isSafeHttpUrl } from "@/components/test-runs/report-meta";
import { useLinkedDefectActions } from "@/components/test-runs/run-defect-mutations";
import type { RunDefectPanelProps } from "@/components/test-runs/run-defect-panel";

interface DefectLabelProps {
	defectKey: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
}

function DefectLabel({ defectKey, defectTitle, defectUrl }: DefectLabelProps) {
	const linkable = isSafeHttpUrl(defectUrl);
	const label = defectKey ?? defectTitle ?? defectUrl ?? "已关联缺陷";

	if (linkable && defectUrl !== null) {
		return (
			<a
				className="min-w-0 truncate text-sm underline underline-offset-4"
				href={defectUrl}
				rel="noopener"
				target="_blank"
			>
				{label}
				<ExternalLinkIcon
					aria-hidden="true"
					className="icon-stroke-regular ml-1 inline size-3"
				/>
			</a>
		);
	}
	return <span className="min-w-0 truncate text-sm">{label}</span>;
}

interface DefectIconButtonProps {
	children: ReactNode;
	label: string;
	onClick: () => void;
	pending: boolean;
}

function DefectIconButton({
	children,
	label,
	onClick,
	pending,
}: DefectIconButtonProps) {
	return (
		<Button
			aria-disabled={pending || undefined}
			aria-label={label}
			onClick={pending ? undefined : onClick}
			size="icon"
			type="button"
			variant="ghost"
		>
			{children}
		</Button>
	);
}

export function LinkedDefect({
	defectKey,
	defectStatus,
	defectTitle,
	defectUrl,
	editing,
	runCaseId,
}: Omit<RunDefectPanelProps, "projectId">) {
	const { clear, handleClear, handleRefresh, refresh } =
		useLinkedDefectActions(runCaseId);

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md bg-card p-2">
			<BugIcon
				aria-hidden="true"
				className="icon-stroke-regular size-4 shrink-0"
			/>
			<DefectLabel
				defectKey={defectKey}
				defectTitle={defectTitle}
				defectUrl={defectUrl}
			/>
			{defectStatus !== null && (
				<span className="rounded border px-1.5 py-0.5 text-xs">
					{defectStatus}
				</span>
			)}
			{defectKey !== null && editing ? (
				<DefectIconButton
					label="刷新 Jira 状态"
					onClick={handleRefresh}
					pending={refresh.isPending}
				>
					<RefreshCwIcon aria-hidden="true" />
				</DefectIconButton>
			) : null}
			{editing ? (
				<DefectIconButton
					label="解除缺陷关联"
					onClick={handleClear}
					pending={clear.isPending}
				>
					<XIcon aria-hidden="true" />
				</DefectIconButton>
			) : null}
		</div>
	);
}
