/**
 * Tab shell inside the case detail sheet: 「详情」 and 「版本历史」 swap the body
 * instead of stacking, so each view owns the full height and its own
 * scrollbar. The active tab is derived from — and written back to — the
 * `history` URL search param, which stays the single source of truth.
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@automationstack/ui/components/tabs";
import { FileTextIcon, HistoryIcon } from "lucide-react";
import { useCallback } from "react";

import type { CaseEditor } from "@/components/cases/case-detail-body";
import { CaseDetailBody } from "@/components/cases/case-detail-body";
import { VersionHistoryPanel } from "@/components/versions/version-history-panel";

const DETAIL_TAB = "detail";
const HISTORY_TAB = "history";

/** 两个面板共用的滚动约定：tab 条不动，只有面板自己滚。 */
const PANEL_CLASS = "min-h-0 flex-1 overflow-y-auto p-4";

interface CaseDetailTabsProps {
	editor: CaseEditor;
	historyOpen: boolean;
	onToggleHistory: (open: boolean) => void;
	testCase: TestCase;
}

export function CaseDetailTabs(props: CaseDetailTabsProps) {
	const { editor, historyOpen, onToggleHistory, testCase } = props;
	// Base UI 的 value 是 `any`，收窄成 unknown 后再比较，避免把 any 带进业务代码。
	const handleValueChange = useCallback(
		(value: unknown) => onToggleHistory(value === HISTORY_TAB),
		[onToggleHistory]
	);

	return (
		<Tabs
			className="flex min-h-0 flex-1 flex-col gap-0"
			onValueChange={handleValueChange}
			value={historyOpen ? HISTORY_TAB : DETAIL_TAB}
		>
			<TabsList className="mx-4 mt-3 shrink-0">
				<TabsTrigger value={DETAIL_TAB}>
					<FileTextIcon data-icon="inline-start" />
					详情
				</TabsTrigger>
				<TabsTrigger value={HISTORY_TAB}>
					<HistoryIcon data-icon="inline-start" />
					版本历史
				</TabsTrigger>
			</TabsList>
			{/*
			 * keepMounted：标题栏的「保存」按钮靠 form="case-editor-form" 关联表单，
			 * 表单一旦被卸载按钮就失去目标，所以切到版本历史时详情面板只隐藏不卸载。
			 * 版本历史面板反过来必须按需挂载，否则没人看也会去拉版本列表。
			 */}
			<TabsContent className={PANEL_CLASS} keepMounted value={DETAIL_TAB}>
				<CaseDetailBody editor={editor} testCase={testCase} />
			</TabsContent>
			<TabsContent className={PANEL_CLASS} value={HISTORY_TAB}>
				<VersionHistoryPanel
					caseId={testCase.id}
					currentVersion={testCase.currentVersion}
				/>
			</TabsContent>
		</Tabs>
	);
}
