/**
 * 设置页两个分区共用的外壳（加载与失败两态各自成文件）。
 *
 * 分区**各自取数、各自保存、互不阻塞**：它们对应两张独立的表（plan §3.3），
 * Jira 那张连不上时不该把「改个自动提交天数」也一起卡住。所以这里没有把
 * 两者裹进同一个 Suspense 或同一份骨架——那正好会把它们重新绑到一起。
 */
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
