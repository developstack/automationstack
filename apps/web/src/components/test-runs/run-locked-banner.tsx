/**
 * 已提交测试任务的顶部灰色横幅（plan §2.5）。
 *
 * 这一页唯一的只读态就是 `submitted`，而且**不可逆**：没有「重新打开」入口，
 * 要继续测只能新建重测任务（D11）。所以横幅只说明「什么时候、被谁锁的」，
 * 不提供任何解锁按钮——放一个点了会报错的按钮比不放更糟。
 */
import { LockIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";

/** D16：到期惰性结算自动提交时没有操作人。 */
const SYSTEM_SUBMITTER = "由系统自动提交";

/**
 * 提交人不再从 `listEvents` 里捞 `actorName`。
 *
 * 那是绕路：状态流水是为「变更历史」那一块查的，用它反推提交人要先扫一遍事件
 * 找 `toStatus === "submitted"` 的那条，多一次往返不说，事件被裁剪或补写过
 * （比如将来加了状态回滚）就会指错人。`testRuns.get` 已经把 `submittedByName`
 * 一起 LEFT JOIN 出来了，直接用那一份。
 */
export interface RunLockedBannerProps {
	submittedAt: Date | string;
	/**
	 * `run.submittedBy` 这个 uuid 本身。
	 *
	 * ⚠️ **判定「是不是系统自动提交」只看它，绝不能看 `submittedByName`**
	 * （D16：`submittedAt IS NOT NULL AND submittedBy IS NULL` 是自动提交的
	 * 唯一标记，库里没有布尔列）。名字为 null 有**两种**成因：真·自动提交，
	 * 以及 join 不到人（账号已被删）。拿名字判定就是把第二种当成第一种，
	 * 界面会对着一份明明有人签过字的报告说「由系统自动提交」——
	 * 那等于凭空撤销一个人的署名。
	 */
	submittedBy: string | null;
	/** `submittedBy` 对应的用户名，**纯展示**，为 null 只表示「查不到名字」。 */
	submittedByName: string | null;
}

export function RunLockedBanner({
	submittedAt,
	submittedBy,
	submittedByName,
}: RunLockedBannerProps) {
	// 判定看 uuid（见上方注释）；名字只在「确实有人提交」这一支里参与展示。
	const isAutoSubmitted = submittedBy === null;

	return (
		<div className="flex flex-wrap items-center gap-2 border-b bg-muted px-4 py-2 text-muted-foreground text-sm">
			<LockIcon
				aria-hidden="true"
				className="icon-stroke-regular size-4 shrink-0"
			/>
			<span>
				该报告已于 {formatDateTime(submittedAt)} 提交并锁定，内容不可再修改。
			</span>
			{/*
			 * 有人提交但名字查不到（账号已被删）时说「提交人：未知」，
			 * 而不是悄悄不显示这一段——「没有署名」和「署名的人没了」是两件事，
			 * 而且后者恰恰是读报告的人该知道的。
			 */}
			<span>
				{isAutoSubmitted
					? SYSTEM_SUBMITTER
					: `提交人：${submittedByName ?? "未知（账号已删除）"}`}
			</span>
			<span>需要继续测试请新建重测任务。</span>
		</div>
	);
}
