/**
 * 「Jira 集成」表单末尾的提交行，自 jira-settings-section.tsx 拆出。
 * 骨架里对应的两颗占位块（宽度折算）在那份文件的 SKELETON_ACTIONS。
 */
import { Button } from "@automationstack/ui/components/button";

/**
 * 「测试连接」与「保存」并排在表单末尾。
 *
 * 两颗按钮的禁用条件不对称，是有意的：保存进行中连测试也一并禁掉，因为保存
 * 改的正是自检要读的那份配置，此时再发一次自检，回来的结果说的是改之前还是
 * 改之后都讲不清；反过来自检是只读的，测试进行中不挡保存。
 */
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
