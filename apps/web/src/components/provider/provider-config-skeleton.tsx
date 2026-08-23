/**
 * 加载态骨架。尺寸逐项按真实内容折算，数据到达时不该有任何位移：
 * - 小标题 = text-sm（20px 行高）→ h-5；
 * - 字段标签与说明行 = text-xs（16px 行高）→ h-4；
 * - Input / SelectTrigger 与 case-filters.tsx 顶部的控件高度约定同档 = 32px → h-8；
 * - provider / model 两格各有「搜索框 + 下拉」两个控件，base URL 与 API Key 各一个。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

/** 当前配置那 6 项元信息：provider / model / base URL / API Key / 更新时间 / 更新人。 */
const META_KEYS = [
	"provider",
	"model",
	"base-url",
	"api-key",
	"updated-at",
	"updated-by",
] as const;

/** 带搜索框的两格。 */
const PICKER_KEYS = ["provider", "model"] as const;
/** 单个输入框的两格。 */
const INPUT_KEYS = ["base-url", "api-key"] as const;

function MetaSkeleton() {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{META_KEYS.map((key) => (
				<div className="flex flex-col gap-1" key={key}>
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-4 w-40" />
				</div>
			))}
		</div>
	);
}

function FieldSkeleton({ controls }: { controls: 1 | 2 }) {
	return (
		<div className="flex flex-col gap-2">
			<Skeleton className="h-4 w-16" />
			<Skeleton className="h-8 w-full" />
			{controls === 2 ? <Skeleton className="h-8 w-full" /> : null}
			<Skeleton className="h-4 w-64" />
		</div>
	);
}

export function ProviderConfigSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="AI 配置加载中"
			className="flex flex-col gap-8"
		>
			<div className="flex flex-col gap-4">
				<Skeleton className="h-5 w-20" />
				<MetaSkeleton />
			</div>
			<div className="flex flex-col gap-4">
				<Skeleton className="h-5 w-20" />
				{PICKER_KEYS.map((key) => (
					<FieldSkeleton controls={2} key={key} />
				))}
				{INPUT_KEYS.map((key) => (
					<FieldSkeleton controls={1} key={key} />
				))}
			</div>
			<div className="flex justify-end">
				<Skeleton className="h-8 w-24" />
			</div>
		</output>
	);
}
