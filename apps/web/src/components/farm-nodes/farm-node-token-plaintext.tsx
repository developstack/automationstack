/**
 * 刚发出来的节点 token 明文：只读一行 + 一键复制 + 一句警示。
 *
 * 形状照抄 api-tokens/api-token-plaintext.tsx，那份文件顶部解释了为什么这类
 * 组件是全仓唯一「反过来」的密钥字段（别处的密钥都是只写不读）。这里各留一份
 * 而不共用：那一份的文案通篇在讲「你的脚本」「吊销这枚再建一枚」，而节点这边
 * 弄丢了要做的是**轮换**，且后果落在另一台机器上（得去那台机器改 env 重启
 * agent）。把两套文案参数化成一个组件，参数表会比组件本身长。
 *
 * 只接一个 string prop，自己不去任何地方取数：明文没有第二个来源
 * （库里只存哈希），也不该有第二个存放处。
 *
 * 除了 token 本身，还把它当场拼成一段可整段拷走的 `.env`（见下面
 * NodeAgentEnvBlock）——这是唯一见得到明文的一刻，能少一次手工搬运就少一次。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { DocCodeBlock } from "@/components/docs/doc-code-block";
import { nodeAgentEnvFile } from "@/components/farm-nodes/farm-node-setup-commands";
import { copyText } from "@/utils/clipboard";

const FIELD_ID = "farm-node-token-plaintext";
const WARNING_ID = "farm-node-token-plaintext-warning";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「只显示这一次； 关掉这张框」）。
 */
const WARNING_TEXT =
	"只显示这一次。关掉这张框之后就再也看不到了，请立刻填进那台机器的 NODE_AGENT_TOKEN；弄丢了只能轮换一枚新的，而轮换会让这一枚立刻失效。";

/**
 * 把明文当场拼成那台机器上要落的 `.env`。
 *
 * 上面那格只给 token 本身（要逐位核对、要单独粘进别处时用它），这一格给的是
 * **可以整段拷走的成品**：接入指引卡片里那一步的 token 位置是占位符，人拿着
 * 一枚 token 回到那张卡片，还得自己把两边对起来——而这是唯一见得到明文的一刻，
 * 让他多绕一圈的代价可能是把 token 抄错，或者干脆先关掉框再说。
 *
 * 农场地址与变量名都来自 farm-node-setup-commands.ts，与指引卡片同源。
 */
function NodeAgentEnvBlock({ token }: { token: string }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground text-xs">
				或者直接把这两行存成那台机器上 agent 同目录的{" "}
				<code className="font-mono">.env</code>：
			</p>
			<DocCodeBlock code={nodeAgentEnvFile(token)} language="bash" />
		</div>
	);
}

export function FarmNodeTokenPlaintext({ token }: { token: string }) {
	const handleCopy = useCallback(() => {
		copyText(token).then((copied) => {
			if (copied) {
				toast.success("已复制节点 token");
				return;
			}
			toast.error("复制失败，请手动选中后复制");
		});
	}, [token]);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={FIELD_ID}>NODE_AGENT_TOKEN</Label>
			<div className="flex items-center gap-2">
				{/*
				 * readOnly 而不是 disabled：禁用的输入框拿不到焦点，也就选不中、
				 * 复制不了——而这一格存在的全部意义就是被复制走；禁用态的文字
				 * 对比度也不够。font-mono：token 是一串无意义字符，等宽字体下
				 * 人眼才好逐位核对自己粘进 env 的是不是同一串。
				 */}
				<Input
					aria-describedby={WARNING_ID}
					className="font-mono"
					id={FIELD_ID}
					readOnly={true}
					value={token}
				/>
				<Button
					aria-label="复制节点 token"
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
			<NodeAgentEnvBlock token={token} />
		</div>
	);
}
