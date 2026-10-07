import { Button } from "@automationstack/ui/components/button";

export function JiraConfigFormActions({
	onTest,
	pending,
	testPending,
}: {
	onTest: () => void;
	pending: boolean;
	testPending: boolean;
}) {
	return (
		<div className="flex justify-end gap-2">
			<Button
				disabled={pending || testPending}
				onClick={onTest}
				type="button"
				variant="outline"
			>
				{testPending ? "测试中…" : "测试连接"}
			</Button>
			<Button disabled={pending} type="submit">
				{pending ? "保存中…" : "保存"}
			</Button>
		</div>
	);
}
