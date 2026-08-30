/**
 * 测量一个元素的实际高度并跟随它变化，随 animate-ui 的 effects 层一起 vendored
 * 进来（上游路径 `registry/hooks/use-auto-height`）。AutoHeight 用它把 `height: auto`
 * 换成一个具体像素值，motion 才有得插值——auto 本身不可动画。
 *
 * 与上游的差别，都是本仓门禁与约定要求的：
 * - 上游文件名是 index.tsx 但通篇没有 JSX，因此落在 hooks/ 下的 .ts
 *   （本包 exports 映射里 `./hooks/*` 只认 .ts，见 packages/ui/package.json）。
 * - `parseFloat` 改写成 `Number.parseFloat`：Biome 的 useNumberNamespace 是 error。
 * - 上游把 options 对象当默认参数直接写在签名里，每次渲染都是新对象，会让
 *   measure 的 useCallback 依赖每帧变化；这里拆成两个布尔参数，依赖才真的稳定。
 */
import {
	type DependencyList,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

interface AutoHeightOptions {
	includeParentBox?: boolean;
	includeSelfBox?: boolean;
}

/** 一个盒子在 border-box 下需要补回的 padding + border 纵向总和。 */
function verticalBoxExtra(element: Element): number {
	const style = getComputedStyle(element);
	if (style.boxSizing !== "border-box") {
		return 0;
	}
	const padding =
		(Number.parseFloat(style.paddingTop || "0") || 0) +
		(Number.parseFloat(style.paddingBottom || "0") || 0);
	const border =
		(Number.parseFloat(style.borderTopWidth || "0") || 0) +
		(Number.parseFloat(style.borderBottomWidth || "0") || 0);
	return padding + border;
}

export function useAutoHeight<T extends HTMLElement = HTMLDivElement>(
	deps: DependencyList = [],
	options: AutoHeightOptions = {}
) {
	const { includeParentBox = true, includeSelfBox = false } = options;
	const ref = useRef<T | null>(null);
	const [height, setHeight] = useState(0);

	const measure = useCallback(() => {
		// 显式标成 HTMLElement | null 而不是让它继承泛型 T：Biome 的
		// noUnnecessaryConditions 在 `useRef<T | null>` 的泛型上会把这个判空当成
		// 恒真（同 use-data-state.ts 里那条注释），给它具体类型就正常收窄了。
		const el: HTMLElement | null = ref.current;
		if (!el) {
			return 0;
		}

		const base = el.getBoundingClientRect().height || 0;
		let extra = 0;
		if (includeParentBox && el.parentElement) {
			extra += verticalBoxExtra(el.parentElement);
		}
		if (includeSelfBox) {
			extra += verticalBoxExtra(el);
		}

		// 对齐到设备像素：半个物理像素的残差会让相邻边框在动画里忽粗忽细。
		const dpr =
			typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
		return Math.ceil((base + extra) * dpr) / dpr;
	}, [includeParentBox, includeSelfBox]);

	useLayoutEffect(() => {
		// ResizeObserver 而不是只在 deps 变化时量一次：内容自己变高（图片加载、
		// 字体换掉、文案换行）时高度也得跟上，否则容器会把内容裁掉。
		const observer = new ResizeObserver(() => {
			const next = measure();
			requestAnimationFrame(() => setHeight(next));
		});

		// 先建 observer 再判元素在不在，是为了让本 effect 只有一条 return 路径。
		// 早退写成裸 return 会被 eslint 的 consistent-return 拦（另一条路径交回了
		// cleanup），写成 return undefined 又会被 Biome 的 noUselessUndefined 拦，
		// 两条规则在这个形状上互相打架。空转一个没 observe 任何元素的 observer
		// 不占资源，disconnect 也照样安全。
		const el: HTMLElement | null = ref.current;
		if (el) {
			setHeight(measure());
			observer.observe(el);
			if (includeParentBox && el.parentElement) {
				observer.observe(el.parentElement);
			}
		}

		// deps 是调用方声明的重量时机，正是这个钩子的入参，所以原样摊进依赖里。
		return () => observer.disconnect();
	}, [measure, includeParentBox, ...deps]);

	// 首帧元素可能还没进布局（display:none 的祖先、尚未挂载的 portal），量到 0
	// 就再试一次；不补这一下，容器会一直停在 0 高。
	useLayoutEffect(() => {
		if (height === 0) {
			const next = measure();
			if (next !== 0) {
				setHeight(next);
			}
		}
	}, [height, measure]);

	return { height, ref } as const;
}
