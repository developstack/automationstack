/**
 * 已关联时的展示行：链接 + Jira 状态 + 刷新 / 解除关联。
 *
 * 拆成三段的理由是那两颗图标按钮：它们除了图标与文案完全一样，而每一颗都要
 * 展开成 aria-disabled + onClick 二选一两条分支，抄两遍就是四条分支挤在
 * 一个函数里。抽掉之后这个文件里剩下的判断全都是**业务判断**（有没有 key、
 * 在不在修改页面、URL 能不能点），一眼能数完。

 * 结果页面上只剩链接本身：刷新与解除关联都要 `editing`。用户要的是「结果页面
 * 只有缺陷链接」，而这两颗都是写操作，摆在只读那一屏上本来也不该点得动。
 */
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

/** 缺陷的文字标识；能安全打开时才包成链接。 */
function DefectLabel({ defectKey, defectTitle, defectUrl }: DefectLabelProps) {
	// 手填的 URL 是用户可控字符串，协议不在 http/https 白名单里就只当纯文本显示，
	// 不悄悄丢掉——那毕竟是有人填进去的内容。
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

/**
 * 行尾那两颗图标按钮共用的形状。
 *
 * aria-disabled 而不是 disabled：禁用的按钮仍然要能被 Tab 到，否则读屏用户
 * 根本发现不了「这里有个不能用的控件」。代价是浏览器不会替我们拦住点击，
 * 所以 pending 时必须自己把 onClick 换成 undefined——否则连点两下会真的
 * 发出两次请求。这两半是一套，不能只抄其中一半。
 */
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
		// bg-card 而不是 border：右栏底面是 bg-muted/40 灰画布，同一画布上的卡片
		// 靠 bg-card 亮出来，不是靠描边（同一条理由见 run-step-card.tsx 文件头）。
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
			{/* 没有 issue key 就没什么可向 Jira 问的：手填的链接刷不出状态。 */}
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
