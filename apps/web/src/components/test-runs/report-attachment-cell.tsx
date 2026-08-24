/**
 * 报告页失败清单里的「截图」列。
 *
 * 从 `report-failed-cases-card.tsx` 拆出来：加上附件计数之后那份文件到了 305 行、
 * 越过了仓库 300 行的上限（scripts/check-file-rules.js）。切在这里而不是别处，
 * 是因为这一列有自己的一套加载时序（下面那段），跟表格其余那些纯展示的单元格
 * 不是一类东西。
 */
import { Button } from "@automationstack/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@automationstack/ui/components/popover";
import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { useAttachmentList } from "@/components/test-runs/use-attachment-upload";

/** 这一行没有附件时的占位。 */
const NO_ATTACHMENT = "无";

type AttachmentItems = ReturnType<typeof useAttachmentList>["data"];

/**
 * `url` 为 null = R2 没配置（后端此时仍返回附件行）。此刻要说的是「看不了」，
 * 不是「没有」——把没配置存储显示成「无附件」会让人以为测的人没截图。
 */
function AttachmentList({
	isPending,
	items,
}: {
	isPending: boolean;
	items: AttachmentItems;
}) {
	if (isPending) {
		return <p className="text-muted-foreground text-sm">正在加载附件…</p>;
	}
	if (items === undefined || items.length === 0) {
		return <p className="text-muted-foreground text-sm">这条用例没有附件。</p>;
	}
	return (
		<ul className="flex flex-col gap-2">
			{items.map(({ attachment, url }) => (
				<li key={attachment.id}>
					{url === null ? (
						<span className="text-muted-foreground text-sm">
							{`${attachment.fileName}（附件存储未配置，暂不可访问）`}
						</span>
					) : (
						<a
							className="text-sm underline underline-offset-2"
							href={url}
							rel="noopener"
							target="_blank"
						>
							{attachment.fileName}
						</a>
					)}
				</li>
			))}
		</ul>
	);
}

export interface AttachmentCellProps {
	attachmentCount: number;
	caseName: string;
	runCaseId: string;
}

/**
 * 截图列：**计数是随报告一起来的，缩略图仍是点开才查。**
 *
 * 后端的 `failedCases` 上带了 `attachmentCount`，所以「哪几行有截图」在报告
 * 加载完的那一刻就能看出来，不必逐行去问。但**计数不等于可以预签 URL**：
 * 签名有 15 分钟有效期，而报告页常常被开着一下午；一张 40 行的表在加载时
 * 预签一遍就是 40 次签名，绝大多数还没人点就已经过期了。
 * 所以入口按需加载照旧：`useAttachmentList` 传 undefined 时查询是关的，
 * 点开 Popover 才把 runCaseId 交出去。
 *
 * 计数为 0 的行**不给可点击的入口**——一颗点开只会说「这条用例没有附件」的
 * 按钮，既浪费一次点击，也让读屏用户在 Tab 序列里多绊一下。
 */
export function AttachmentCell({
	attachmentCount,
	caseName,
	runCaseId,
}: AttachmentCellProps) {
	const [open, setOpen] = useState(false);
	// 关掉时传 undefined，查询就不会发出；打开过一次后 react-query 会缓存住。
	const { data, isPending } = useAttachmentList(open ? runCaseId : undefined);

	if (attachmentCount === 0) {
		return <span className="text-muted-foreground">{NO_ATTACHMENT}</span>;
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				render={
					/*
					 * aria-label 而不是只靠按钮上那几个字：一表 40 行就是 40 颗长得
					 * 一样的按钮，读屏逐个念一遍，谁也分不出是哪条用例的。
					 * 数字也念进去——「有几张」是这一列真正要回答的问题。
					 */
					<Button
						aria-label={`查看「${caseName}」的 ${attachmentCount} 个附件`}
						size="sm"
						type="button"
						variant="ghost"
					>
						<ImageIcon data-icon="inline-start" />
						{/* 数字紧跟图标：图标只说「是附件」，数字才说「有几个」 */}
						<span className="tabular-nums">{attachmentCount}</span>
					</Button>
				}
			/>
			<PopoverContent className="w-72">
				<AttachmentList isPending={isPending} items={data} />
			</PopoverContent>
		</Popover>
	);
}
