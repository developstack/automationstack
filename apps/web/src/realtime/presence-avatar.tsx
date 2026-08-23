/**
 * 单枚协作头像的**唯一**实现：顶栏的在线成员组（presence-avatars.tsx）与
 * 用例列表的协作列（components/cases/case-collaborators-cell.tsx）共用这一份。
 *
 * 拆出来是因为两处的头像长得一模一样、却必须挂在**不同的元素**上：顶栏那枚
 * 头像自己就是 tooltip 的可聚焦 trigger；列表里整堆头像共用一个 trigger，
 * 单枚只是装饰。各写一份的话，改生成参数时必然只改到一边。
 */
import { cn } from "@automationstack/ui/lib/utils";
import { Blobatar } from "@blobatar/react";
import type { ReactNode } from "react";

/**
 * 头像基类。尺寸与 ring 颜色留给调用方用 cn 覆盖——tailwind-merge 把
 * ring-width（ring-2）与 ring-color（ring-background）分在两个组里，
 * 只传 ring-amber-* 能换色而不动粗细。默认这一套即顶栏的原样。
 *
 * flex 居中与 font-medium / text-presence-label 如今只为「+N」那枚服务
 * （blobatar 用 size-full 自己撑满整个框，不吃这几条），但「+N」与头像
 * 必须逐像素对齐——同一条尺寸、同一圈 ring、同一个圆角——所以两者继续共用
 * 这一个基类，而不是各留一份迟早对不上的副本。
 */
export const PRESENCE_AVATAR_CLASS =
	"flex size-6 shrink-0 select-none items-center justify-center rounded-full font-medium text-presence-label ring-2 ring-background focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/** 「+N」折叠指示器的配色：折叠掉的是一群人，没有单一身份色可用，退回中性填充。 */
export const PRESENCE_OVERFLOW_CLASS = "bg-muted text-muted-foreground";

/**
 * 锁死色调档，只让名字去挑色相与形状。
 *
 * blobatar 的名字同时挑一个色相和一档明度/饱和度（六档，pastel 到 ink）。
 * 这六档的跨度是给「画在自带浅色底板上」准备的，而这里两处都是透明底、
 * 直接落在页面表面上，于是最浅和最深两档各自在一套主题里塌掉：实测 207 个
 * 名字，任由名字挑档时最差只有浅色主题 1.31:1、深色主题 1.62:1——20px 见方
 * 的图形到这个比例就只剩一团影子。
 *
 * 0.7 落在 deep 档（L 0.62 / C 0.165），是把两套主题的最差值一起抬得最高的
 * 一档：浅色 3.18:1、深色 4.86:1（表格行用的 --card 上是 3.34 / 4.53），
 * 眼睛对身体仍有 4.80:1。mid 档（0.5）偏心深色主题——深色 7.59:1，浅色却只有
 * 2.10:1，最差的那一头反而更糟。
 *
 * 只锁这一档：色相、十种轮廓、眼睛的几何全都还归名字管，身份照样分得开。
 */
const AVATAR_TONE = 0.7;

/** 由调用方摊到目标元素上的视觉属性。 */
export interface PresenceAvatarRenderProps {
	children: ReactNode;
	className: string;
}

interface PresenceAvatarProps {
	/** 覆盖尺寸 / ring 颜色等；参与 cn 合并，写在基类之后。 */
	className?: string;
	name: string;
	/**
	 * 渲染成哪个元素。默认是 aria-hidden 的 span（纯装饰，可访问名由外层
	 * 那个统一的 trigger 给全）；顶栏则转交给 TooltipTrigger，让 Base UI
	 * 渲染原生 button——那里的头像本身就要能被键盘聚焦、被触屏点到。
	 */
	render?: (props: PresenceAvatarRenderProps) => ReactNode;
}

const renderDecorativeAvatar = (
	props: PresenceAvatarRenderProps
): ReactNode => <span aria-hidden={true} {...props} />;

/**
 * blobatar 生成的确定性头像：同一个**用户名**永远得到同一张脸。
 *
 * 种子取 name 而不是 clientId：clientId 每次 WebSocket 连接重新生成，用它
 * 当种子的话刷新一次就换一张脸，头像就不再是身份标识、只是个随机装饰。
 * 名字取 presence 里服务端下发的值（见 realtime/ws.ts），前端没有可编辑的
 * 身份入口，所以这张脸对所有人都一致。
 *
 * 尺寸走 className 而不是 blobatar 的 size 数字 prop：这两处的尺寸是**行高
 * 约束**（协作列 20px 与 Badge 齐平，顶栏 24px），约束写在调用方的
 * AVATAR_SIZE / 基类里，只该有一个出处。size-full 让图片撑满外层那个框，
 * 于是尺寸继续由 cn 合进来的 size-5 / size-6 单独说了算，调用方一个字不用改。
 *
 * 静态分支渲染的是 `<img>`：Tailwind preflight 已把 img 置为 display:block，
 * 加上它是 flex 子项（会被 blockify），基线间隙无从产生；preflight 的
 * `height:auto` 被 utilities 层的 size-full 盖掉，高度因此严格等于外框的
 * 20px / 24px，行高分毫不动。
 *
 * 不传 animate：这两处都是高频界面（顶栏常驻、协作列每行都有），会动的头像
 * 在表格里是纯粹的注意力税，而且 animate 还会把每枚从一个 `<img>` 换成十几个
 * SVG 节点，presence 一变就得整堆重渲染。
 *
 * background 保持 false（blob 风格的默认值，这里写出来是因为它是配色判断的
 * 前提）：自带底板固定是 L 0.965 的近白色，在浅色页面上（1.03:1）等于没有、
 * 在深色页面上却是一枚扎眼的白圆片，两套主题会长成两个样子。透明底加上
 * AVATAR_TONE 的锁档，两边才是同一个东西。ring-2 ring-background 照旧生效：
 * 它画在外框上，后一枚的 ring 盖住前一枚的边缘，重叠仍然被切开。
 *
 * alt=""：单枚头像是装饰，可访问名一律由外层 trigger 的 aria-label 给全。
 * 也不能传 blobatar 的 title——那会生成 `<title>` 变成可访问名，和 aria-label 打架。
 */
export function PresenceAvatar({
	className,
	name,
	render = renderDecorativeAvatar,
}: PresenceAvatarProps): ReactNode {
	return render({
		children: (
			<Blobatar
				alt=""
				background={false}
				className="size-full"
				name={name}
				tone={AVATAR_TONE}
			/>
		),
		className: cn(PRESENCE_AVATAR_CLASS, className),
	});
}
