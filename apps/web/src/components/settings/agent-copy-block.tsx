/**
 * 「本地 Agent 接入」那一格里所有可复制的命令与配置块。
 *
 * 做法逐字照抄同目录的 jira-webhook-url.tsx：只读 + 一枚复制按钮，且用
 * `readOnly` 而不是 `disabled` —— 禁用的控件拿不到焦点，也就选不中、复制不了，
 * 而这些块存在的全部意义就是被复制走。copyText 原先也是那一份的原样搬运，现在
 * 已抽到 `@/utils/clipboard`：全仓三份逐字节相同的拷贝从未分头演化过，而「非
 * 安全上下文里 navigator.clipboard 根本不存在」这条坑得同时记在三个地方——只改
 * 一处，另外两处就悄悄退回抛 TypeError。它是个纯函数，抽出去并没有多出中间层。
 *
 * 与那一份的区别只有一处：这里的值可能是多行（TOML 表、几十行 JSON），所以
 * 多行时换 Textarea。它带 field-sizing-content，高度跟着内容长，不会出现一个
 * 装着二十行 JSON 的两行滚动框。
 *
 * 这个文件里一个 useState 都没有，值全部由调用方以 props 传进来（理由见
 * test-run-settings-fields.tsx 顶部：受控输入的 state 跟着 JSX 搬进子组件，
 * 每敲一个字符就丢一次焦点）。这里的输入本来就是只读的静态文案，
 * 保持零状态既是规矩也是事实。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyText } from "@/utils/clipboard";

export interface AgentCopyBlockProps {
	/** 说明文字；缺省则不渲染那一行，也不挂 aria-describedby。 */
	hint?: string;
	/** 控件与 label / hint 连线用；同一页里必须唯一。 */
	id: string;
	label: string;
	/** 多行内容（TOML 表、JSON 片段）换 Textarea。 */
	multiline?: boolean;
	value: string;
}

interface CopyFieldProps {
	describedBy: string | undefined;
	id: string;
	multiline: boolean;
	value: string;
}

/** 只读控件本身：单行走 Input，多行走 Textarea，其余属性两边完全一致。 */
function CopyField(props: CopyFieldProps) {
	const shared = {
		"aria-describedby": props.describedBy,
		className: "font-mono text-xs",
		id: props.id,
		readOnly: true,
		spellCheck: false,
		value: props.value,
	} as const;
	if (props.multiline) {
		return <Textarea {...shared} />;
	}
	return <Input {...shared} />;
}

export function AgentCopyBlock(props: AgentCopyBlockProps) {
	const { value } = props;
	const hintId = `${props.id}-hint`;
	const describedBy = props.hint === undefined ? undefined : hintId;

	const handleCopy = useCallback(() => {
		copyText(value).then((copied) => {
			if (copied) {
				toast.success("已复制");
				return;
			}
			toast.error("复制失败，请手动选中内容复制");
		});
	}, [value]);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			<div className="flex items-start gap-2">
				<CopyField
					describedBy={describedBy}
					id={props.id}
					multiline={props.multiline === true}
					value={value}
				/>
				<Button
					aria-label={`复制${props.label}`}
					onClick={handleCopy}
					size="icon"
					type="button"
					variant="outline"
				>
					<CopyIcon aria-hidden="true" />
				</Button>
			</div>
			{props.hint === undefined ? null : (
				<p className="text-muted-foreground text-xs" id={hintId}>
					{props.hint}
				</p>
			)}
		</div>
	);
}
