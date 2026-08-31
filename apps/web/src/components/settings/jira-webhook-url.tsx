/**
 * 要填进 Jira 的 webhook 地址：只读 + 一键复制。
 *
 * 状态同步是整条流程闭环真正合上的地方（plan §5.3：「哪些 bug 已经修好了、
 * 可以开重测任务了」），而它的入口就是这一行地址。所以不是「顺手展示一下」，
 * 是这一节里最该被复制走的东西。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyText } from "@/utils/clipboard";

const FIELD_ID = "settings-jira-webhook-url";
const HINT_ID = "settings-jira-webhook-url-hint";

export function JiraWebhookUrl({ url }: { url: string }) {
	const handleCopy = useCallback(() => {
		copyText(url).then((copied) => {
			if (copied) {
				toast.success("已复制 webhook 地址");
				return;
			}
			toast.error("复制失败，请手动选中地址复制");
		});
	}, [url]);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={FIELD_ID}>Webhook 地址</Label>
			<div className="flex items-center gap-2">
				{/*
				 * readOnly 而不是 disabled：禁用的输入框拿不到焦点，也就选不中、
				 * 复制不了——而这一格存在的全部意义就是被复制走。
				 */}
				<Input
					aria-describedby={HINT_ID}
					id={FIELD_ID}
					readOnly={true}
					value={url}
				/>
				<Button
					aria-label="复制 webhook 地址"
					onClick={handleCopy}
					size="icon"
					type="button"
					variant="outline"
				>
					<CopyIcon aria-hidden="true" />
				</Button>
			</div>
			<p className="text-muted-foreground text-xs" id={HINT_ID}>
				在 Jira 的 webhook 设置里填这个地址，并填上下面那把密钥。请确认该地址
				Jira Cloud 从公网访问得到——localhost 或内网地址它连不上。
			</p>
		</div>
	);
}
