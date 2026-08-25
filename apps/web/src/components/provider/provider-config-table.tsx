/**
 * 登记表本体：Provider · Model · Base URL · API Key · 更新时间 · 更新人 · 操作。
 *
 * 行不承担「这是不是当前生效配置」的语义——登记处没有生效行的概念
 * （见路由文件头），所以这里没有激活/默认标记，删除也只是删一行登记。
 */
import type { AiProviderConfigView } from "@automationstack/api/routers/ai-provider-config";
import { Badge } from "@automationstack/ui/components/badge";
import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";
import { SearchXIcon, ServerIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { formatDateTime } from "@/components/cases/case-meta";
import { DeleteProviderConfigDialog } from "@/components/provider/delete-provider-config-dialog";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/** base URL 允许展示的最大宽度：超长地址截断，完整值挂 title 上按需看。 */
const BASE_URL_MAX_WIDTH = "max-w-72";

function ProviderConfigRowActions({
	config,
	onEdit,
}: {
	config: AiProviderConfigView;
	onEdit: (config: AiProviderConfigView) => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const openConfirm = useCallback(() => setConfirming(true), []);
	const closeConfirm = useCallback(() => setConfirming(false), []);
	const handleOpenChange = useCloseOnDismiss(closeConfirm);
	const handleEdit = useCallback(() => onEdit(config), [config, onEdit]);
	const label = `${config.providerId} / ${config.modelId}`;

	return (
		<>
			{/* 带上 provider/model：读屏的按钮列表里，一排「编辑」互相分辨不出来 */}
			<Button
				aria-label={`编辑登记「${label}」`}
				onClick={handleEdit}
				size="sm"
				variant="ghost"
			>
				编辑
			</Button>
			<Button
				aria-label={`删除登记「${label}」`}
				onClick={openConfirm}
				size="sm"
				variant="ghost"
			>
				删除
			</Button>
			<DeleteProviderConfigDialog
				config={config}
				onOpenChange={handleOpenChange}
				open={confirming}
			/>
		</>
	);
}

function ProviderConfigRow({
	config,
	onEdit,
}: {
	config: AiProviderConfigView;
	onEdit: (config: AiProviderConfigView) => void;
}) {
	return (
		<TableRow>
			<TableCell className="font-medium">{config.providerId}</TableCell>
			{/* model id 是技术标识符：等宽字体才好逐字符核对 */}
			<TableCell className="font-mono text-xs">{config.modelId}</TableCell>
			<TableCell>
				{/* 自建网关的地址可以非常长；截断保行宽，title 保留完整值 */}
				<span
					className={cn("block truncate font-mono text-xs", BASE_URL_MAX_WIDTH)}
					title={config.baseUrl}
				>
					{config.baseUrl}
				</span>
			</TableCell>
			<TableCell>
				{/* 只说有没有：Key 的内容和长度都不会从服务端下来，这里也不该有 */}
				<Badge variant={config.hasApiKey ? "secondary" : "outline"}>
					{config.hasApiKey ? "已配置" : "未配置"}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{formatDateTime(config.updatedAt)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{config.updatedByUsername ?? "未知（账号已删除）"}
			</TableCell>
			<TableCell className="text-right">
				<div className="flex justify-end gap-1">
					<ProviderConfigRowActions config={config} onEdit={onEdit} />
				</div>
			</TableCell>
		</TableRow>
	);
}

/** 图标交叉淡入的公共类：两枚图标叠在一起、只切 opacity（同 case-table-states）。 */
const SWAP_ICON = "absolute inset-0 size-5 transition-crossfade";

function ProviderEmptyIcon({ filtered }: { filtered: boolean }) {
	return (
		<span className="relative block size-5">
			<SearchXIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-100" : "opacity-0")}
			/>
			<ServerIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-0" : "opacity-100")}
			/>
		</span>
	);
}

/** 空态进场：fade + 4px 上浮，口径与 case-table-states 的 CaseTableEmpty 一致。 */
const EMPTY_ENTER_CLASS =
	"animate-in fade-in-0 slide-in-from-bottom-1 duration-200";

function ProviderConfigEmpty({
	filtered,
	onClearSearch,
}: {
	filtered: boolean;
	onClearSearch: () => void;
}) {
	return (
		<Empty className={EMPTY_ENTER_CLASS}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ProviderEmptyIcon filtered={filtered} />
				</EmptyMedia>
				<EmptyTitle>{filtered ? "没有匹配的登记" : "还没有登记"}</EmptyTitle>
				<EmptyDescription>
					{filtered
						? "当前关键词没有命中任何登记，换个关键词或清除搜索试试。"
						: "登记一份 provider + model + base URL + API Key，供 agent 侧配置上线后选用；在此之前 AI 生成读取的是服务端环境变量。"}
				</EmptyDescription>
			</EmptyHeader>
			{filtered ? (
				<EmptyContent>
					<Button onClick={onClearSearch} size="sm" variant="outline">
						清除搜索
					</Button>
				</EmptyContent>
			) : null}
		</Empty>
	);
}

export interface ProviderConfigTableProps {
	configs: AiProviderConfigView[];
	filtered: boolean;
	onClearSearch: () => void;
	onEdit: (config: AiProviderConfigView) => void;
	/** 当前展示的是上一次查询留下的结果，新数据还在路上（搜索/翻页中）。 */
	stale: boolean;
}

export function ProviderConfigTable({
	configs,
	filtered,
	onClearSearch,
	onEdit,
	stale,
}: ProviderConfigTableProps) {
	if (configs.length === 0) {
		return (
			<ProviderConfigEmpty filtered={filtered} onClearSearch={onClearSearch} />
		);
	}

	return (
		<Table className={cn("transition-crossfade", stale && "opacity-60")}>
			<TableHeader>
				<TableRow>
					<TableHead>Provider</TableHead>
					<TableHead>Model</TableHead>
					<TableHead>Base URL</TableHead>
					<TableHead>API Key</TableHead>
					<TableHead>更新时间</TableHead>
					<TableHead>更新人</TableHead>
					{/* 空表头会被读屏念成一列没名字的单元格，用视觉隐藏的文字补上 */}
					<TableHead className="text-right">
						<span className="sr-only">操作</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{configs.map((config) => (
					<ProviderConfigRow config={config} key={config.id} onEdit={onEdit} />
				))}
			</TableBody>
		</Table>
	);
}
