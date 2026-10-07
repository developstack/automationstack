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

const PANEL_CLASS = "min-h-0 flex-1 overflow-y-auto p-4";

interface CaseDetailTabsProps {
	editor: CaseEditor;
	historyOpen: boolean;
	onToggleHistory: (open: boolean) => void;
	testCase: TestCase;
}

export function CaseDetailTabs(props: CaseDetailTabsProps) {
	const { editor, historyOpen, onToggleHistory, testCase } = props;
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
