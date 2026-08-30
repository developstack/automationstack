/**
 * 用例列表「协作」列的单元格：这条用例上除我之外还有谁在看、有谁在改。
 * 只读展示，不阻止任何操作；并发保存仍由 `cases.update` 的乐观锁兜底。
 *
 * 这里曾经画的是「一枚图标 + 人数」（琥珀铅笔＝有人在改，静音眼睛＝只有人在看）。
 * 改成头像堆是因为图标只答得出「有几个人」，而这一列真正被问的是「是谁」——
 * 那个答案原先只藏在 tooltip 里，得先把鼠标停上去才看得到。头像把身份提到了
 * 第一眼：blobatar 按用户名确定性生成，与顶栏的在线成员组是同一份实现、同一张
 * 脸，扫一眼就对得上人。
 */
import { AvatarGroup } from "@automationstack/ui/components/avatar-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";

import {
	PRESENCE_AVATAR_CLASS,
	PRESENCE_OVERFLOW_CLASS,
	PresenceAvatar,
} from "@/realtime/presence-avatar";
import type {
	CaseCollaborator,
	CaseCollaborators,
} from "@/realtime/use-editing";

/** 多人时的用户名连接符（与 editing-notice.tsx 的提示条断句方式保持一致）。 */
const NAME_SEPARATOR = "、";

/** 「谁在编辑」与「谁在查看」是两句话，用分号断开，不能用顿号连成一串人名。 */
const CLAUSE_SEPARATOR = "；";

/**
 * 头像尺寸——**这一列的行高硬约束**，不能随手调大。
 *
 * 数据行高 = TableCell 的 p-2（8+8=16px）+ 该行最高的那块内容。当前最高的是
 * 优先级/状态列的 Badge（h-5 = 20px），其余单元格是 text-sm，行高也正好 20px，
 * 所以行是 36px，加 TableRow 的 border-b 1px = 37px——case-table-states.tsx 的
 * CaseTableSkeleton 就是按这个数折算 41 + 6×37 = 263px 的。
 * size-5 = 20px 与 Badge 齐平：20 + 16 = 36px，行高分毫不动。顶栏那枚 size-6
 * （24px）会把行顶到 24 + 16 = 40px，数据到达那一帧整张表要往下跳 4px×行数。
 * ring 在 Tailwind 里是 box-shadow，不参与布局，描边再粗也不进这笔账；
 * size-5 同时把高度钉死，「+N」万一是两位数也只会横向挤出去、撑不高行。
 * 头像里那张 blobatar 图片只有 size-full，尺寸全部由这条决定：`<img>` 若按
 * 自身固有尺寸排版会把行撑高，所以外框的高度必须是唯一的出处。
 */
const AVATAR_SIZE = "size-5";

/**
 * 「在改」与「在看」的区分放在**描边**上：头像的形状与配色整个被身份占着
 * （回答「谁」，全部由用户名生成），不能再拿同一个通道去编码状态
 * （回答「在干什么」），两套语义会互相盖掉。
 * 描边是头像上唯一空着的通道，而且它本来就存在（ring-background 用来把重叠的
 * 头像互相切开），换个颜色不增加新的视觉元素。
 * 琥珀取自详情面板顶部那条「正在编辑」提示条的同一档色，两处指向同一件事。
 *
 * 颜色只负责让人**更快**看到，不负责让人**能**看到：完整状态一律落在文字上，
 * 见下面 trigger 的 aria-label 与 tooltip 的分行文案。
 */
const EDITING_RING = "ring-amber-600 dark:ring-amber-400";

/**
 * 整堆头像共用一个 trigger，而不是每枚各挂一个 tooltip：横着划过这一格会连弹
 * 好几次，而这一列要回答的是「这条用例上都有谁」这一个问题，答案就该是一段话。
 * 因此 AvatarGroup 是包在这个 trigger **里面**的（顶栏正相反：那里每枚头像
 * 自己就是一个 trigger，AvatarGroup 在外层）。
 * 不覆盖 render：Base UI 默认渲染 button，键盘能聚焦、触屏够得到
 * （参考 realtime/presence-avatars.tsx）。头像本身 aria-hidden，
 * 可访问名统一由这里的 aria-label 给全。
 *
 * rounded-full 让聚焦轮廓贴着头像堆的胶囊外形走，不是一个方框套着一排圆。
 * 重叠间距挪去了 STACK_CLASS：现在 trigger 的直接子节点只有 AvatarGroup 那
 * 一个容器，-space-x-* 作用在直接子节点上，留在这里会变成对着一个元素生效。
 */
const TRIGGER_CLASS =
	"flex items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * 头像堆本身：-space-x-1 = 重叠 4px（size-5 的 20%），于是每多一枚头像只多占
 * 16px——MAX_VISIBLE_AVATARS 那笔账算的就是这个数。
 *
 * AvatarGroup 传 lift={false}：**这一列不要 hover 抬升**。它与顶栏共用同一个
 * 组件，但不共用同一套动效策略——这一列是表格里每行都有的高频界面，指针横穿
 * 表格时会一路扫过几十个头像堆，抬升会变成跟着鼠标跑的一串抖动
 * （better-ui 的 Motion Restraint：高频交互不加自定义动效）。这和上面
 * AVATAR_ENTER 只做一次性进场是同一条取舍：这一列允许「多了一个人」的一次
 * 动作，不允许任何随指针持续发生的动作。lift={false} 时 AvatarGroup 连 motion
 * 节点都不生成，几十行的表格不为此多付一分钱。
 *
 * 仍然用 AvatarGroup 而不是留着原来那行 flex：拿的是它的 z-index 反序。默认的
 * DOM 叠放是后面的压前面的，于是「+N」和只在看的人会压住编辑者；反序之后压在
 * 最上面的是排第一的那枚，正好接上 stackFor 里「编辑者优先」的排序理由。
 */
const STACK_CLASS = "-space-x-1";

/**
 * 最多并排几枚头像。列宽 w-24（96px）扣掉 TableCell 的 px-2（16px）剩 80px，
 * 3 枚头像 + 一枚「+N」= 20 + 3×16 = 68px，还留得下两端各 2px 的 ring。
 * 再多一枚就是 84px，会顶着 padding 挤出去。
 */
const MAX_VISIBLE_AVATARS = 3;

/**
 * 头像的一次性进场。
 *
 * 加在**这里**而不是 PresenceAvatar 里：顶栏那组在线成员
 * （realtime/presence-avatars.tsx）常驻在视线正上方，用户本来就盯着它，
 * 那里的变化不需要额外指路；表格里这一列散落在几十行中间，是余光里的变化，
 * 需要一段动作把「多了一个人」讲清楚。同一个组件、两种上下文，进场只属于
 * 其中一种。（这也是 PresenceAvatar 把 className 交给调用方的既定用法。）
 *
 * 与 presence-avatar.tsx 里「不传 animate」那条决定不冲突：那条反对的是
 * blobatar 持续变形的头像（会把每枚从一个 <img> 换成十几个 SVG 节点，
 * presence 一变整堆重渲染）；这里是挂载时跑一次的 CSS keyframes，
 * 跑完节点与静止时完全一致。
 *
 * fade + zoom-in-95，200ms：20px 见方的小图形，5% 的放大只有 1px，
 * 读起来是「浮现」而不是「弹出」；比 95 更小会变成真正的弹跳，
 * 在一列有 ring 描边的圆形里会像抖了一下。
 *
 * 只做进场不做退场：退场需要把已经离开的人继续留在 DOM 里等动画播完，
 * 而这一列的数据源是 presence 推送、没有过渡状态可挂。取舍是明确的——
 * 「多了一个人」是需要被注意到的信息，「少了一个人」不是。
 *
 * 「减弱动效」下由 globals.css 末尾那条规则压到近似瞬时，退回硬切。
 */
const AVATAR_ENTER = "animate-in fade-in-0 zoom-in-95 duration-200";

function joinNames(collaborators: CaseCollaborator[]): string {
	return collaborators
		.map((collaborator) => collaborator.name)
		.join(NAME_SEPARATOR);
}

/**
 * 把协作者拆成可读的句子，编辑者与查看者分开列。
 * 空数组的那一档整句省掉，避免出现「无人 正在查看」这种句子。
 *
 * 这里列的是**全部**协作者，不受 MAX_VISIBLE_AVATARS 折叠影响：头像折成
 * 「+N」只是没地方画，被折掉的人不该连名字一起消失。
 */
function clausesFor({ editors, viewers }: CaseCollaborators): string[] {
	const clauses: string[] = [];
	if (editors.length > 0) {
		clauses.push(`${joinNames(editors)} 正在编辑`);
	}
	if (viewers.length > 0) {
		clauses.push(`${joinNames(viewers)} 正在查看`);
	}
	return clauses;
}

interface StackedCollaborator {
	collaborator: CaseCollaborator;
	editing: boolean;
}

/**
 * 头像堆的排序：编辑者一律排在查看者前面。
 * 一个人在改比三个人在看更需要被注意到（改动会引发保存冲突，看不会），
 * 排前面同时也决定了溢出时先保住谁——折掉的永远是只在看的那些人。
 */
function stackFor({
	editors,
	viewers,
}: CaseCollaborators): StackedCollaborator[] {
	return [
		...editors.map((collaborator) => ({ collaborator, editing: true })),
		...viewers.map((collaborator) => ({ collaborator, editing: false })),
	];
}

interface CaseCollaboratorsBadgeProps {
	collaborators: CaseCollaborators;
}

/** 重叠的协作者头像堆，hover / 聚焦后由 tooltip 报出谁在改、谁在看。 */
function CaseCollaboratorsBadge({
	collaborators,
}: CaseCollaboratorsBadgeProps) {
	const stacked = stackFor(collaborators);
	const visible = stacked.slice(0, MAX_VISIBLE_AVATARS);
	const overflow = stacked.length - visible.length;
	const clauses = clausesFor(collaborators);
	const label = clauses.join(CLAUSE_SEPARATOR);
	return (
		<Tooltip>
			<TooltipTrigger aria-label={label} className={TRIGGER_CLASS}>
				<AvatarGroup className={STACK_CLASS} lift={false}>
					{visible.map(({ collaborator, editing }) => (
						<PresenceAvatar
							className={cn(
								AVATAR_SIZE,
								AVATAR_ENTER,
								editing ? EDITING_RING : undefined
							)}
							key={collaborator.clientId}
							name={collaborator.name}
						/>
					))}
					{overflow > 0 ? (
						<span
							aria-hidden={true}
							className={cn(
								PRESENCE_AVATAR_CLASS,
								PRESENCE_OVERFLOW_CLASS,
								AVATAR_SIZE,
								AVATAR_ENTER
							)}
						>
							{`+${overflow}`}
						</span>
					) : null}
				</AvatarGroup>
			</TooltipTrigger>
			{/* flex-col：TooltipContent 默认横排，两句会挤成一行读不出分组 */}
			<TooltipContent className="flex-col items-start gap-0.5">
				{clauses.map((clause) => (
					<span key={clause}>{clause}</span>
				))}
			</TooltipContent>
		</Tooltip>
	);
}

interface CaseCollaboratorsCellProps {
	/**
	 * 该用例上的其他成员。`useCollaboratorsByCaseId` 不为「没人」的用例建条目，
	 * 所以绝大多数行拿到的是 undefined，必须当正常情况处理而不是异常。
	 */
	collaborators: CaseCollaborators | undefined;
}

/**
 * 协作列的内容。无人协作时给一个静音色的破折号而不是留空：
 * 空单元格在一整列头像里看着像渲染失败，破折号才读得出「查过了，没有人」。
 */
export function CaseCollaboratorsCell({
	collaborators,
}: CaseCollaboratorsCellProps) {
	if (!collaborators) {
		return <span className="text-muted-foreground">—</span>;
	}
	return <CaseCollaboratorsBadge collaborators={collaborators} />;
}
