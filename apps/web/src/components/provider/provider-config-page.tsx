/**
 * AI 配置登记页：搜索 + 表格 + 分页 + 创建/编辑抽屉。
 * 曾是顶级路由 /ai-provider，现在是 /projects/<id>/settings 的「AI 配置」那一格；
 * 登记表是平台级的，与从哪个项目点进来无关（面板上方那句作用域说明会讲这一点）。
 *
 * 四个过程都是 adminProcedure，所以和成员管理用同一套判断：先看会话角色，
 * 非管理员就地说清楚「这页要管理员」，而不是把 FORBIDDEN 丢给全站兜底的错误边界
 * （router.tsx 的 defaultErrorComponent）——那儿只能原样转述服务端那句话，
 * 再给一颗对权限问题毫无用处的重试按钮。
 */
import type { AiProviderConfigView } from "@automationstack/api/routers/ai-provider-config";
import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Input } from "@automationstack/ui/components/input";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/use-session";
import { useDebouncedValue } from "@/components/provider/provider-catalog-queries";
import { ProviderConfigDrawer } from "@/components/provider/provider-config-drawer";
import { ProviderConfigPagination } from "@/components/provider/provider-config-pagination";
import {
	providerListInput,
	providerPageCount,
} from "@/components/provider/provider-config-query";
import { ProviderConfigTableSkeleton } from "@/components/provider/provider-config-skeleton";
import { ProviderConfigTable } from "@/components/provider/provider-config-table";
import { orpc } from "@/utils/orpc";

function ProviderConfigForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要管理员权限</EmptyTitle>
				<EmptyDescription>
					AI
					配置登记只有管理员能维护。需要接入新的模型请联系管理员；也可以直接回到
					{/* 正文里的链接必须自带下划线：只靠颜色区分不够 */}
					<Link className="underline underline-offset-4" to="/projects">
						项目列表
					</Link>
					。
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

interface ToolbarProps {
	keyword: string;
	onCreate: () => void;
	onKeywordChange: (keyword: string) => void;
}

/**
 * 顶栏：搜索 + 新建。控件高度统一 default 档 = 32px（Input h-8 / Button h-8），
 * 约定与 case-filters.tsx 顶部那条工具栏同源。
 */
function ProviderConfigToolbar({
	keyword,
	onKeywordChange,
	onCreate,
}: ToolbarProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			onKeywordChange(event.target.value),
		[onKeywordChange]
	);

	return (
		<div className="flex items-center justify-between gap-2">
			<div className="relative">
				<SearchIcon
					aria-hidden={true}
					className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				{/*
				 * aria-label 必须与 placeholder 一致：语音控制用户念的是屏幕上
				 * 看得见的字，两者对不上就点不中这个输入框。
				 */}
				<Input
					aria-label="搜索 provider / model / base URL"
					className="w-72 pl-8"
					onChange={handleChange}
					placeholder="搜索 provider / model / base URL"
					value={keyword}
				/>
			</div>
			<Button onClick={onCreate} type="button">
				<PlusIcon data-icon="inline-start" />
				新建配置
			</Button>
		</div>
	);
}

/**
 * 列表查询的全部状态：关键词（300ms 防抖）、页码、查询本身。
 *
 * 关键词一变就回第一页（在击键回调里直接做，不等防抖）：带着第 5 页的
 * offset 去搜新词，大概率落在空页上。页码先回 1、查询 300ms 后跟上，
 * 两者最终一致，中间那一下 keepPreviousData 也不会闪空表。
 */
function useProviderConfigList() {
	const [keyword, setKeyword] = useState("");
	// 击键防抖 300ms 与全站搜索框同一个数（useDebouncedValue）
	const debouncedKeyword = useDebouncedValue(keyword);
	const [page, setPage] = useState(1);

	const listQuery = useQuery(
		orpc.aiProviderConfig.list.queryOptions({
			input: providerListInput(debouncedKeyword, page),
			placeholderData: keepPreviousData,
		})
	);
	const { data, isPlaceholderData } = listQuery;

	// 删掉当前页最后一行（或别人删的）之后把页码收回有效范围，否则停在空页上
	const pageCount = providerPageCount(data?.total ?? 0);
	useEffect(() => {
		if (data !== undefined && data.rows.length === 0 && page > pageCount) {
			setPage(pageCount);
		}
	}, [data, page, pageCount]);

	const handleKeywordChange = useCallback((next: string) => {
		setKeyword(next);
		setPage(1);
	}, []);
	const clearSearch = useCallback(() => {
		setKeyword("");
		setPage(1);
	}, []);

	return {
		clearSearch,
		data,
		debouncedKeyword,
		handleKeywordChange,
		isPlaceholderData,
		keyword,
		setPage,
	};
}

/** 抽屉的开合与目标：null = 新建；非 null 为编辑目标。 */
function useProviderConfigDrawer() {
	const [target, setTarget] = useState<AiProviderConfigView | null>(null);
	const [open, setOpen] = useState(false);
	const openCreate = useCallback(() => {
		setTarget(null);
		setOpen(true);
	}, []);
	const openEdit = useCallback((config: AiProviderConfigView) => {
		setTarget(config);
		setOpen(true);
	}, []);
	const closeDrawer = useCallback(() => setOpen(false), []);
	return { closeDrawer, open, openCreate, openEdit, target };
}

function ProviderConfigContent() {
	const list = useProviderConfigList();
	const drawer = useProviderConfigDrawer();

	return (
		// 三层（顶栏 / 表格 / 分页）统一落在这条内容列上：水平 gutter 由路由层
		// 的 px-4 给一次，层间距只用这里的 gap，层与层左右边缘天然对齐。
		<div className="flex flex-col gap-4">
			<ProviderConfigToolbar
				keyword={list.keyword}
				onCreate={drawer.openCreate}
				onKeywordChange={list.handleKeywordChange}
			/>
			{list.data === undefined ? (
				<ProviderConfigTableSkeleton />
			) : (
				<ProviderConfigTable
					configs={list.data.rows}
					filtered={list.debouncedKeyword.trim() !== ""}
					onClearSearch={list.clearSearch}
					onEdit={drawer.openEdit}
					stale={list.isPlaceholderData}
				/>
			)}
			<ProviderConfigPagination
				onPageChange={list.setPage}
				page={list.data?.page ?? 1}
				total={list.data?.total ?? 0}
			/>
			<ProviderConfigDrawer
				config={drawer.target}
				onClose={drawer.closeDrawer}
				open={drawer.open}
				secretStorageAvailable={list.data?.secretStorageAvailable ?? false}
			/>
		</div>
	);
}

export function ProviderConfigPage() {
	const { isPending, user } = useSession();

	if (isPending) {
		return <ProviderConfigTableSkeleton />;
	}
	if (user?.role !== "admin") {
		return <ProviderConfigForbidden />;
	}
	return <ProviderConfigContent />;
}
