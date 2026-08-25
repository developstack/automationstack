/**
 * 登记的创建/编辑抽屉：「新建配置」点击即开，编辑共用同一个抽屉
 * （ui 包 sheet，side=right）。
 *
 * 内容就是 019 那套 ProviderConfigForm（combobox + base URL + API Key 三态 +
 * 校验），只是从「常驻页面的一段表单」搬进抽屉。按目标 key 重新挂载表单：
 * 换一行编辑或从编辑切到新建，初值、submit 标记、目录候选的输入痕迹都归零。
 */
import type { AiProviderConfigView } from "@automationstack/api/routers/ai-provider-config";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { ProviderConfigForm } from "@/components/provider/provider-config-form";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/**
 * 默认 sm:max-w-sm（384px）装不下 combobox 的双语候选 label；升到
 * sm:max-w-md（448px）——再宽就要跟 base URL 的说明文字抢行了。
 */
const CONTENT_CLASS = "sm:max-w-md";

const CREATE_DESCRIPTION =
	"登记一份 provider + model + base URL + API Key。登记只影响可选清单，不会改变 AI 生成当前读取的配置。";

function editDescription(config: AiProviderConfigView): string {
	return `编辑「${config.providerId} / ${config.modelId}」这份登记。API Key 内容不会回显，留空保存即保持不变。`;
}

export interface ProviderConfigDrawerProps {
	/** null = 新建；否则为编辑目标那一行视图。 */
	config: AiProviderConfigView | null;
	onClose: () => void;
	open: boolean;
	/** 主密钥是否就绪；false 时保存 API Key 会被拒，输入框先禁掉。 */
	secretStorageAvailable: boolean;
}

export function ProviderConfigDrawer({
	config,
	onClose,
	open,
	secretStorageAvailable,
}: ProviderConfigDrawerProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Sheet onOpenChange={handleOpenChange} open={open}>
			<SheetContent className={CONTENT_CLASS} side="right">
				<SheetHeader>
					<SheetTitle>
						{config === null ? "新建 Provider 配置" : "编辑 Provider 配置"}
					</SheetTitle>
					<SheetDescription>
						{config === null ? CREATE_DESCRIPTION : editDescription(config)}
					</SheetDescription>
				</SheetHeader>
				{open ? (
					<ProviderConfigForm
						config={config}
						key={config?.id ?? "create"}
						onCancel={onClose}
						onSaved={onClose}
						secretStorageAvailable={secretStorageAvailable}
					/>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
