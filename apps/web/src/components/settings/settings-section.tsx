/**
 * 设置页两个分区共用的外壳与两个加载/失败态。
 *
 * 分区**各自取数、各自保存、互不阻塞**：它们对应两张独立的表（plan §3.3），
 * Jira 那张连不上时不该把「改个自动提交天数」也一起卡住。所以这里没有把
 * 两者裹进同一个 Suspense 或同一份骨架——那正好会把它们重新绑到一起。
 */
import { Button } from "@automationstack/ui/components/button";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import type { ReactNode } from "react";

export interface SettingsSectionProps {
	children: ReactNode;
	description: string;
	/** 供 aria-labelledby 指向标题；与 headingId 同源，调用方各给一个常量。 */
	headingId: string;
	title: string;
}

export function SettingsSection(props: SettingsSectionProps) {
	return (
		<section aria-labelledby={props.headingId} className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm" id={props.headingId}>
					{props.title}
				</h2>
				<p className="text-muted-foreground text-xs">{props.description}</p>
			</div>
			{props.children}
		</section>
	);
}

/**
 * 骨架的尺寸按真实控件折算，数据到达时不该有位移：
 * 标签 / 说明 = text-xs（16px 行高）→ h-4；输入框与按钮 = 32px → h-8。
 */
export function SettingsFieldsSkeleton({ fields }: { fields: number }) {
	return (
		<output aria-busy="true" className="flex flex-col gap-4">
			{Array.from({ length: fields }, (_, index) => `field-${index}`).map(
				(key) => (
					<div className="flex flex-col gap-2" key={key}>
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-8 w-full" />
					</div>
				)
			)}
			<div className="flex justify-end">
				<Skeleton className="h-8 w-24" />
			</div>
		</output>
	);
}

/**
 * 取数失败时的分区内提示。
 *
 * 全局 QueryCache 已经弹了一条带重试的 toast，但 toast 会自己消失，而这块
 * 区域会一直空着；不在原地说一句，用户看到的就是「这个分区没了」。
 */
export function SettingsSectionError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-wrap items-center gap-3" role="status">
			<p className="text-destructive text-xs">这一节的配置没能加载出来。</p>
			<Button onClick={onRetry} size="sm" type="button" variant="outline">
				重试
			</Button>
		</div>
	);
}
