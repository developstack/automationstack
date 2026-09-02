/**
 * 编辑框里的「启用」勾选项。
 *
 * 用 Checkbox 而不是 Switch：本仓的 packages/ui 里没有 switch，而这一项出现在
 * **提交式表单**里（勾完还要按「保存」才生效），checkbox 的语义正好是「提交时
 * 带上这个值」，switch 会让人以为一拨就已经改了（同 farm-browser-toggle-field）。
 *
 * 与那一份不共用、也不收 label/description 两个 prop：节点这边只有「启用」
 * 一项开关，参数化之后调用点反而要多传两串写死的文案，而那两串文案正是这里
 * 唯一要说准的东西——停用到底影响不影响**正在跑**的会话。
 */
import { Checkbox } from "@automationstack/ui/components/checkbox";
import { Label } from "@automationstack/ui/components/label";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「不受影响； 节点本身」）。
 */
const ENABLED_DESCRIPTION =
	"停用后农场不再往这台机器派新会话；已经在跑的会话不受影响，节点本身也留着、token 仍然有效，随时可以再打开。";

interface FarmNodeToggleFieldProps {
	checked: boolean;
	id: string;
	onChange: (checked: boolean) => void;
}

export function FarmNodeToggleField({
	checked,
	id,
	onChange,
}: FarmNodeToggleFieldProps) {
	const describedBy = `${id}-description`;

	return (
		<div className="flex items-start gap-3">
			{/* mt-0.5：勾选框与标签首行的文字基线对齐，而不是与整块说明居中 */}
			<Checkbox
				aria-describedby={describedBy}
				checked={checked}
				className="mt-0.5"
				id={id}
				onCheckedChange={onChange}
			/>
			<div className="flex flex-col gap-1">
				<Label htmlFor={id}>启用</Label>
				<p className="text-muted-foreground text-xs" id={describedBy}>
					{ENABLED_DESCRIPTION}
				</p>
			</div>
		</div>
	);
}
