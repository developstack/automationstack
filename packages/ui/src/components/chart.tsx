"use client";

/* shadcn 官方 chart 组件，取自 base-lyra —— 与 packages/ui/components.json 的
   `"style": "base-lyra"` 一致（根目录那份 components.json 写的是 base-vega，
   但它管的不是这个包）。

   与官方原件的唯一一处样式改动：tooltip 容器由 base-lyra 的 `rounded-none` 改为
   `rounded-md`。这是本目录既有的落地惯例而非新决定——dropdown-menu.tsx:41、
   context-menu.tsx:58、popover.tsx:36 三处浮层全是 rounded-md，base-lyra 原件里
   的直角在落地时一律换成本主题的圆角档（context-menu 落地时同样做过这一步）。

   其余差异只有 import 路径与 Biome 规约（具名导入、interface、取反顺序等），
   均无行为变化。 */

import { cn } from "@automationstack/ui/lib/utils";
import type * as React from "react";
import { createContext, useContext, useId, useMemo } from "react";
import type {
	DefaultLegendContentProps,
	DefaultTooltipContentProps,
	TooltipValueType,
} from "recharts";
import { Legend, ResponsiveContainer, Tooltip } from "recharts";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { dark: ".dark", light: "" } as const;

const INITIAL_DIMENSION = { height: 200, width: 320 } as const;
type TooltipNameType = number | string;

export type ChartConfig = Record<
	string,
	{
		label?: React.ReactNode;
		icon?: React.ComponentType;
	} & (
		| { color?: string; theme?: never }
		| { color?: never; theme: Record<keyof typeof THEMES, string> }
	)
>;

interface ChartContextProps {
	config: ChartConfig;
}

const ChartContext = createContext<ChartContextProps | null>(null);

function useChart() {
	const context = useContext(ChartContext);

	if (!context) {
		throw new Error("useChart must be used within a <ChartContainer />");
	}

	return context;
}

function ChartContainer({
	id,
	className,
	children,
	config,
	initialDimension = INITIAL_DIMENSION,
	...props
}: React.ComponentProps<"div"> & {
	config: ChartConfig;
	children: React.ComponentProps<typeof ResponsiveContainer>["children"];
	initialDimension?: {
		width: number;
		height: number;
	};
}) {
	const uniqueId = useId();
	const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

	return (
		<ChartContext.Provider value={{ config }}>
			<div
				className={cn(
					"flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
					className
				)}
				data-chart={chartId}
				data-slot="chart"
				{...props}
			>
				<ChartStyle config={config} id={chartId} />
				<ResponsiveContainer initialDimension={initialDimension}>
					{children}
				</ResponsiveContainer>
			</div>
		</ChartContext.Provider>
	);
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
	const colorConfig = Object.entries(config).filter(
		([, entry]) => entry.theme ?? entry.color
	);

	if (!colorConfig.length) {
		return null;
	}

	return (
		<style
			// biome-ignore lint/security/noDangerouslySetInnerHtml: 官方原件的做法，且这里注入的是本组件自己拼的 CSS 变量声明（键来自调用方写死的 ChartConfig），不含外部输入
			dangerouslySetInnerHTML={{
				__html: Object.entries(THEMES)
					.map(
						([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
	.map(([key, itemConfig]) => {
		const color =
			itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ??
			itemConfig.color;
		return color ? `  --color-${key}: ${color};` : null;
	})
	.join("\n")}
}
`
					)
					.join("\n"),
			}}
		/>
	);
};

const ChartTooltip = Tooltip;

function ChartTooltipContent({
	active,
	payload,
	className,
	indicator = "dot",
	hideLabel = false,
	hideIndicator = false,
	label,
	labelFormatter,
	labelClassName,
	formatter,
	color,
	nameKey,
	labelKey,
}: React.ComponentProps<typeof Tooltip> &
	React.ComponentProps<"div"> & {
		hideLabel?: boolean;
		hideIndicator?: boolean;
		indicator?: "line" | "dot" | "dashed";
		nameKey?: string;
		labelKey?: string;
	} & Omit<
		DefaultTooltipContentProps<TooltipValueType, TooltipNameType>,
		"accessibilityLayer"
	>) {
	const { config } = useChart();

	const tooltipLabel = useMemo(() => {
		if (hideLabel || !payload?.length) {
			return null;
		}

		const [item] = payload;
		const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
		const itemConfig = getPayloadConfigFromPayload(config, item, key);
		const value =
			!labelKey && typeof label === "string"
				? (config[label]?.label ?? label)
				: itemConfig?.label;

		if (labelFormatter) {
			return (
				<div className={cn("font-medium", labelClassName)}>
					{labelFormatter(value, payload)}
				</div>
			);
		}

		if (!value) {
			return null;
		}

		return <div className={cn("font-medium", labelClassName)}>{value}</div>;
	}, [
		label,
		labelFormatter,
		payload,
		hideLabel,
		labelClassName,
		config,
		labelKey,
	]);

	if (!(active && payload?.length)) {
		return null;
	}

	const nestLabel = payload.length === 1 && indicator !== "dot";

	return (
		<div
			className={cn(
				"grid min-w-32 items-start gap-1.5 rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
				className
			)}
		>
			{/* biome-ignore lint/suspicious/noLeakedRender: tooltipLabel 由上面的 useMemo 产出，只可能是 JSX 或 null，不会漏出 0 / "" */}
			{nestLabel ? null : tooltipLabel}
			<div className="grid gap-1.5">
				{payload
					.filter((item) => item.type !== "none")
					// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 官方原件的整段渲染分支，拆开会让本地文件与 registry 永久对不上（同 scripts/vendored-ui.js 的理由）
					.map((item, index) => {
						const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
						const itemConfig = getPayloadConfigFromPayload(config, item, key);
						const indicatorColor = color ?? item.payload?.fill ?? item.color;

						return (
							<div
								className={cn(
									"flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
									indicator === "dot" && "items-center"
								)}
								// biome-ignore lint/suspicious/noArrayIndexKey: 官方原件。payload 是 recharts 每次悬停重算的一次性数组，没有稳定 id，且这些行不持有状态
								key={index}
							>
								{formatter && item?.value !== undefined && item.name ? (
									formatter(item.value, item.name, item, index, item.payload)
								) : (
									<>
										{itemConfig?.icon ? (
											<itemConfig.icon />
										) : (
											!hideIndicator && (
												<div
													className={cn(
														"shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
														{
															"h-2.5 w-2.5": indicator === "dot",
															"my-0.5": nestLabel && indicator === "dashed",
															"w-0 border-[1.5px] border-dashed bg-transparent":
																indicator === "dashed",
															"w-1": indicator === "line",
														}
													)}
													style={
														{
															"--color-bg": indicatorColor,
															"--color-border": indicatorColor,
														} as React.CSSProperties
													}
												/>
											)
										)}
										<div
											className={cn(
												"flex flex-1 justify-between leading-none",
												nestLabel ? "items-end" : "items-center"
											)}
										>
											<div className="grid gap-1.5">
												{nestLabel ? tooltipLabel : null}
												<span className="text-muted-foreground">
													{itemConfig?.label ?? item.name}
												</span>
											</div>
											{item.value === null ||
											item.value === undefined ? null : (
												<span className="font-medium font-mono text-foreground tabular-nums">
													{typeof item.value === "number"
														? item.value.toLocaleString()
														: String(item.value)}
												</span>
											)}
										</div>
									</>
								)}
							</div>
						);
					})}
			</div>
		</div>
	);
}

const ChartLegend = Legend;

function ChartLegendContent({
	className,
	hideIcon = false,
	payload,
	verticalAlign = "bottom",
	nameKey,
}: React.ComponentProps<"div"> & {
	hideIcon?: boolean;
	nameKey?: string;
} & DefaultLegendContentProps) {
	const { config } = useChart();

	if (!payload?.length) {
		return null;
	}

	return (
		<div
			className={cn(
				"flex items-center justify-center gap-4",
				verticalAlign === "top" ? "pb-3" : "pt-3",
				className
			)}
		>
			{payload
				.filter((item) => item.type !== "none")
				.map((item, index) => {
					const key = `${nameKey ?? item.dataKey ?? "value"}`;
					const itemConfig = getPayloadConfigFromPayload(config, item, key);

					return (
						<div
							className={cn(
								"flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
							)}
							// biome-ignore lint/suspicious/noArrayIndexKey: 同上，图例 payload 由 recharts 生成，无稳定 id
							key={index}
						>
							{itemConfig?.icon && !hideIcon ? (
								<itemConfig.icon />
							) : (
								<div
									className="h-2 w-2 shrink-0 rounded-[2px]"
									style={{
										backgroundColor: item.color,
									}}
								/>
							)}
							{itemConfig?.label}
						</div>
					);
				})}
		</div>
	);
}

function getPayloadConfigFromPayload(
	config: ChartConfig,
	payload: unknown,
	key: string
) {
	if (typeof payload !== "object" || payload === null) {
		return;
	}

	const payloadPayload =
		"payload" in payload &&
		typeof payload.payload === "object" &&
		payload.payload !== null
			? payload.payload
			: undefined;

	let configLabelKey: string = key;

	if (
		key in payload &&
		typeof payload[key as keyof typeof payload] === "string"
	) {
		configLabelKey = payload[key as keyof typeof payload] as string;
	} else if (
		payloadPayload &&
		key in payloadPayload &&
		typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
	) {
		configLabelKey = payloadPayload[
			key as keyof typeof payloadPayload
		] as string;
	}

	return configLabelKey in config ? config[configLabelKey] : config[key];
}

export {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartStyle,
	ChartTooltip,
	ChartTooltipContent,
};
