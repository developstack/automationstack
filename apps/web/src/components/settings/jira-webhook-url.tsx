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
