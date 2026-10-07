import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyText } from "@/utils/clipboard";

const FIELD_ID = "api-token-plaintext";
const WARNING_ID = "api-token-plaintext-warning";

const WARNING_TEXT =
	"这是明文唯一一次显示。关掉这个对话框之后就再也看不到了，请立刻存好；弄丢了只能吊销这枚再建一枚。";

export function ApiTokenPlaintext({ plaintext }: { plaintext: string }) {
	const handleCopy = useCallback(() => {
		copyText(plaintext).then((copied) => {
			if (copied) {
				toast.success("已复制 token");
				return;
			}
			toast.error("复制失败，请手动选中后复制");
		});
	}, [plaintext]);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={FIELD_ID}>Token</Label>
			<div className="flex items-center gap-2">
				<Input
					aria-describedby={WARNING_ID}
					className="font-mono"
					id={FIELD_ID}
					readOnly={true}
					value={plaintext}
				/>
				<Button
					aria-label="复制 token"
					onClick={handleCopy}
					size="icon"
					type="button"
					variant="outline"
				>
					<CopyIcon aria-hidden="true" />
				</Button>
			</div>
			<p className="text-destructive text-xs" id={WARNING_ID} role="alert">
				{WARNING_TEXT}
			</p>
		</div>
	);
}
