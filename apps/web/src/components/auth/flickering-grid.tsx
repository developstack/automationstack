// 源码来自 Magic UI 的 Flickering Grid（MIT 许可）：
// https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/flickering-grid.tsx
// 本地改动：
// - 颜色取自元素的 CSS 颜色（用 text-* 颜色 token 设置），切换主题后重新取色；
// - 用户开启"减弱动效"时只画一帧静止的网格，不启动动画；
// - 尺寸变化后立即重画；不在视口内时停止动画。

import { cn } from "@automationstack/ui/lib/utils";
import { useReducedMotion } from "motion/react";
import { type ComponentProps, useEffect, useRef } from "react";

const MS_PER_SECOND = 1000;

interface GridOptions {
	flickerChance: number;
	gridGap: number;
	maxOpacity: number;
	squareSize: number;
}

interface Grid {
	cols: number;
	dpr: number;
	rows: number;
	squares: Float32Array;
}

/** 把任意 CSS 颜色（例如 oklch）转换为 "rgba(r, g, b," 前缀，绘制时再拼上透明度。 */
function rgbaPrefixOf(color: string): string {
	const probe = document.createElement("canvas");
	probe.width = 1;
	probe.height = 1;
	const ctx = probe.getContext("2d");
	if (ctx === null) {
		return "rgba(0, 0, 0,";
	}
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return `rgba(${r}, ${g}, ${b},`;
}

function setupGrid(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	options: GridOptions
): Grid {
	const dpr = window.devicePixelRatio || 1;
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	const cell = options.squareSize + options.gridGap;
	const cols = Math.ceil(width / cell);
	const rows = Math.ceil(height / cell);
	const squares = new Float32Array(cols * rows);
	for (let index = 0; index < squares.length; index += 1) {
		squares[index] = Math.random() * options.maxOpacity;
	}
	return { cols, dpr, rows, squares };
}

function updateSquares(
	squares: Float32Array,
	deltaSeconds: number,
	options: GridOptions
): void {
	for (let index = 0; index < squares.length; index += 1) {
		if (Math.random() < options.flickerChance * deltaSeconds) {
			squares[index] = Math.random() * options.maxOpacity;
		}
	}
}

function drawGrid(
	ctx: CanvasRenderingContext2D,
	grid: Grid,
	rgbaPrefix: string,
	options: GridOptions
): void {
	const cell = (options.squareSize + options.gridGap) * grid.dpr;
	const size = options.squareSize * grid.dpr;
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	for (let col = 0; col < grid.cols; col += 1) {
		for (let row = 0; row < grid.rows; row += 1) {
			ctx.fillStyle = `${rgbaPrefix}${grid.squares[col * grid.rows + row]})`;
			ctx.fillRect(col * cell, row * cell, size, size);
		}
	}
}

/** 按帧调用 onFrame，参数是距离上一帧的秒数。返回停止动画的函数。 */
function createFrameLoop(onFrame: (deltaSeconds: number) => void) {
	let frameId: number | null = null;
	let lastTime: number | null = null;
	const tick = (time: number) => {
		onFrame(lastTime === null ? 0 : (time - lastTime) / MS_PER_SECOND);
		lastTime = time;
		frameId = requestAnimationFrame(tick);
	};
	return {
		start: () => {
			if (frameId === null) {
				lastTime = null;
				frameId = requestAnimationFrame(tick);
			}
		},
		stop: () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
				frameId = null;
			}
		},
	};
}

interface GridObservers {
	onResize: () => void;
	onThemeChange: () => void;
	onVisibilityChange: (visible: boolean) => void;
}

/** 监听尺寸、是否在视口内和主题。返回断开所有监听的函数。 */
function observeGrid(
	container: HTMLElement,
	canvas: HTMLCanvasElement,
	observers: GridObservers
): () => void {
	const resizeObserver = new ResizeObserver(observers.onResize);
	const visibilityObserver = new IntersectionObserver(([entry]) =>
		observers.onVisibilityChange(entry?.isIntersecting === true)
	);
	// 主题由 <html> 上的 dark 类切换
	const themeObserver = new MutationObserver(observers.onThemeChange);
	resizeObserver.observe(container);
	visibilityObserver.observe(canvas);
	themeObserver.observe(document.documentElement, {
		attributeFilter: ["class"],
		attributes: true,
	});
	return () => {
		resizeObserver.disconnect();
		visibilityObserver.disconnect();
		themeObserver.disconnect();
	};
}

/** 在 canvas 上画网格。reducedMotion 为 true 时只画静止的一帧。返回清理函数。 */
function mountGrid(
	container: HTMLElement,
	canvas: HTMLCanvasElement,
	options: GridOptions,
	reducedMotion: boolean
): () => void {
	const ctx = canvas.getContext("2d");
	if (ctx === null) {
		return noop;
	}
	const readColor = () => rgbaPrefixOf(getComputedStyle(container).color);
	const measure = () =>
		setupGrid(canvas, container.clientWidth, container.clientHeight, options);
	let color = readColor();
	let grid = measure();
	const draw = () => drawGrid(ctx, grid, color, options);
	const loop = createFrameLoop((deltaSeconds) => {
		updateSquares(grid.squares, deltaSeconds, options);
		draw();
	});
	const disconnect = observeGrid(container, canvas, {
		onResize: () => {
			grid = measure();
			draw();
		},
		onThemeChange: () => {
			color = readColor();
			draw();
		},
		onVisibilityChange: (visible) => {
			if (visible && !reducedMotion) {
				loop.start();
			} else {
				loop.stop();
			}
		},
	});
	draw();
	return () => {
		loop.stop();
		disconnect();
	};
}

function noop(): void {
	// 没有需要清理的资源
}

export interface FlickeringGridProps extends ComponentProps<"div"> {
	/** 每个方块每秒改变透明度的概率。 */
	flickerChance?: number;
	gridGap?: number;
	maxOpacity?: number;
	squareSize?: number;
}

/** 闪烁的方块网格。方块颜色是元素的 CSS 颜色，用 text-* 颜色 token 设置。 */
export function FlickeringGrid({
	className,
	flickerChance = 0.3,
	gridGap = 6,
	maxOpacity = 0.3,
	squareSize = 4,
	...props
}: FlickeringGridProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reducedMotion = useReducedMotion() === true;

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (container === null || canvas === null) {
			return noop;
		}
		return mountGrid(
			container,
			canvas,
			{ flickerChance, gridGap, maxOpacity, squareSize },
			reducedMotion
		);
	}, [flickerChance, gridGap, maxOpacity, reducedMotion, squareSize]);

	return (
		<div className={cn("size-full", className)} ref={containerRef} {...props}>
			<canvas className="pointer-events-none block" ref={canvasRef} />
		</div>
	);
}
