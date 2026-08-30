"use client";

/* 动效照搬 animate-ui 的 avatar-group（hover 抬升 + z-index 反序），
   但**只搬动效**：上游那个 primitive 硬绑自家的 animate tooltip——它自带
   @floating-ui/react 与一套独立的全局 Provider，装进来等于本仓同时跑两套
   tooltip 定位引擎；而且它给每枚头像各挂一个 tooltip、trigger 渲染成
   motion.div（不可聚焦），这两点恰好是本仓已经写明理由否掉的做法
   （见 realtime/presence-avatars.tsx 与 components/cases/case-collaborators-cell.tsx）。
   所以 tooltip 一概归调用方管，本组件只负责排布与动效。

   import 走 motion/react 而不是上游的 motion/react-client：后者是 Next.js
   RSC 的入口，本仓是 TanStack Router 的 SPA。 */

import { cn } from "@automationstack/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import {
	Children,
	isValidElement,
	type ReactNode,
	useCallback,
	useState,
} from "react";

/**
 * 抬升幅度用百分比而不是像素：两个调用点的头像一个 size-6、一个 size-5，
 * 百分比让抬升与头像同比缩放，20px 的那枚不会被 24px 的位移抬出行外。
 * 数值与 spring 参数都取上游默认值，改了就不是同一个手感了。
 *
 * 不进 lib/ease.ts：那里放的是本仓自己的语义预设（SPRING_PRESS 之类，
 * 按「这是什么交互」命名），这一条是移植来的、只服务这一个效果的原值，
 * 混进去会让人以为它也是可以到处复用的一档。
 */
const LIFT_Y = "-30%";
const LIFT_SPRING = { damping: 17, stiffness: 300, type: "spring" } as const;
const LIFT_VARIANTS = { lift: { y: LIFT_Y }, rest: { y: 0 } };

interface AvatarGroupItemProps {
	children: ReactNode;
	/** false 时连 motion 节点都不生成，见 AvatarGroup 的 lift 说明。 */
	lift: boolean;
	zIndex: number;
}

/**
 * 单枚头像的位置槽：负责它在堆里的层级，以及（可选的）抬升。
 *
 * z-index 只能走内联 style：它的值是「第几枚」算出来的，Tailwind 没有与之
 * 对应的静态工具类，写成任意值也仍然是每个索引一个类。
 *
 * 抬升同时挂 whileHover 与 whileTap（上游那两个手势都保留）：触屏没有 hover，
 * 点按是那里唯一够得着的入口。不额外用 useHoverCapable 去挡触屏的幽灵 hover——
 * motion 的 hover 手势本身就按 pointerType 滤掉了 touch，挡第二遍只是给每枚
 * 头像多挂一个 matchMedia 监听。
 *
 * 键盘那一路走 focused 状态，不是 motion 的 whileFocus：whileFocus 只认这个
 * span **自身**的 focus，而真正被聚焦的是调用方放进来的那个 trigger（在这个
 * span 里面），native focus 又不冒泡，所以它一次也不会触发。React 的 onFocus /
 * onBlur 底层是会冒泡的 focusin / focusout，在外层收得到。多这一步是为了让
 * 键盘用户拿到与鼠标一致的反馈，而不是只有 tooltip 弹出。
 * 两个回调过 useCallback 不是为了性能，是 biome 的 noJsxPropsBind。
 */
function AvatarGroupItem({ children, lift, zIndex }: AvatarGroupItemProps) {
	const [focused, setFocused] = useState(false);
	const handleBlur = useCallback(() => setFocused(false), []);
	const handleFocus = useCallback(() => setFocused(true), []);
	if (!lift) {
		return (
			<span className="relative" style={{ zIndex }}>
				{children}
			</span>
		);
	}
	return (
		<motion.span
			animate={focused ? "lift" : "rest"}
			className="relative"
			initial="rest"
			onBlur={handleBlur}
			onFocus={handleFocus}
			style={{ zIndex }}
			transition={LIFT_SPRING}
			variants={LIFT_VARIANTS}
			whileHover="lift"
			whileTap="lift"
		>
			{children}
		</motion.span>
	);
}

interface AvatarGroupProps {
	/**
	 * 每个子节点就是一枚头像（「+N」也算一枚）。刻意收成 children 而不是
	 * 「数据数组 + render prop」：两个调用点画的东西差得远（一边每枚各是一个
	 * 可聚焦的 TooltipTrigger，一边整堆共用外层一个 trigger、单枚只是装饰），
	 * 硬抽一个公共 item 形状只会把两边的差异塞进配置项里。
	 */
	children: ReactNode;
	/** 重叠间距（-space-x-*）等排布细节由调用方给，尺寸约束写在调用方。 */
	className?: string;
	/**
	 * hover / tap 抬升。表格那种每行都有的高频界面传 false：那里只要统一的
	 * 叠放实现，动效是纯粹的注意力税（better-ui 的 Motion Restraint）。
	 * 传 false 时连 motion 节点都不生成，不只是把幅度调成 0。
	 */
	lift?: boolean;
}

/**
 * 重叠的头像堆：负责叠放层级与（可选的）抬升，不碰 tooltip、不碰头像本身。
 *
 * z-index 一律反序（上游的 invertOverlap，且这里没做成开关——两个调用点都
 * 把「更需要被看到的人」排在前面：顶栏是 presence 的顺序，协作列是编辑者
 * 优先，反序正好让排前面的那枚压在上面。默认的 DOM 叠放恰恰相反，会让
 * 「+N」压住真人）。
 *
 * 外框与每个位置槽都是 span 而不是 div：用例列表那一列把整堆塞在一个
 * TooltipTrigger（原生 button）里面，而 button 的内容模型只收 phrasing
 * content，div 是非法嵌套；span 一旦 display:flex 或成为 flex 子项就会被
 * blockify，渲染结果与 div 完全一致，没有代价。
 *
 * 「减弱动效」下直接退回无 motion 的静态堆：globals.css 末尾那条全局规则
 * 只管得住 CSS 过渡与关键帧，JS 驱动的 transform 不在它的射程内。
 * `!== true` 是因为 useReducedMotion 首帧可能是 null（同
 * components/overview/overview-chart.ts 的处理）。
 */
export function AvatarGroup({
	children,
	className,
	lift = true,
}: AvatarGroupProps) {
	const reduce = useReducedMotion();
	const animated = lift && reduce !== true;
	// filter(isValidElement)：Children.toArray 保证每个元素都带 key，于是
	// 下面不必拿 index 当 key（noArrayIndexKey），index 只用来算层级。
	const items = Children.toArray(children).filter(isValidElement);
	return (
		<span
			className={cn("flex items-center", className)}
			data-slot="avatar-group"
		>
			{items.map((item, index) => (
				<AvatarGroupItem
					key={item.key}
					lift={animated}
					zIndex={items.length - index}
				>
					{item}
				</AvatarGroupItem>
			))}
		</span>
	);
}
