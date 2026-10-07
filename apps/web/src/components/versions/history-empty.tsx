import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";

export function HistoryEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>暂无版本记录</EmptyTitle>
				<EmptyDescription>保存一次用例后即可看到版本历史。</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
