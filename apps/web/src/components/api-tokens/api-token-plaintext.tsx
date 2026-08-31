/**
 * 刚创建出来的 token 明文：只读一行 + 一键复制。
 *
 * 仓库里其它几处密钥字段（settings/jira-secret-field、provider/api-key-field）
 * 全是**反向**的——只写不读，写进去就再也读不回来。这一格是唯一反过来的地方，
 * 因为库里只存 SHA-256，明文这辈子只在 `apiTokens.create` 的返回值里出现一次
 * （理由原文见 packages/api/src/routers/api-tokens.ts 的 create 注释）。
 *
 * 所以这个组件只接一个 string prop，自己不去任何地方取数：明文没有第二个来源，
 * 也不该有第二个存放处。
 *
 * 复制按钮用的 copyText 曾在本文件里另留一份，旧注释写着「等哪次能一起动，
 * 这两份应该收进一个共用的 utils」——那一次就是现在：全仓三份逐字节相同的实现
 * 已统一收进 `@/utils/clipboard`，非安全上下文那条坑也由它一处讲清。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyText } from "@/utils/clipboard";

const FIELD_ID = "api-token-plaintext";
const WARNING_ID = "api-token-plaintext-warning";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「请立刻存好； 弄丢了」）。
 */
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
				{/*
				 * readOnly 而不是 disabled：禁用的输入框拿不到焦点，也就选不中、
				 * 复制不了——而这一格存在的全部意义就是被复制走；禁用态的文字
				 * 对比度也不够（同 settings/jira-webhook-url.tsx:50-53）。
				 * font-mono：token 是一串无意义字符，等宽字体下人眼才好逐位核对。
				 */}
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
			{/*
			 * role="alert"：这段字是在对话框已经打开之后才换上来的（表单 → 明文），
			 * 不带它读屏就只会重复播报打开时那句描述，最要紧的一句反而听不到。
			 */}
			<p className="text-destructive text-xs" id={WARNING_ID} role="alert">
				{WARNING_TEXT}
			</p>
		</div>
	);
}
