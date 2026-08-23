import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createMindmapPanController,
	type MindmapPanEffects,
	type MindmapPanPointer,
} from "./mindmap-pan.ts";

/**
 * 平移是这块画布上唯一没法靠类型或编译期兜住的交互：它的正确性全部落在
 * 「哪些 pointerdown 该接管、位移怎么换算、什么时候松手」这三件事上，而
 * mind-elixir 的 pointerdown 分发器随版本改过好几次。所以这里把控制器的状态机
 * 单独钉住——本仓库的 vitest 跑在 node 环境（见根 vitest.config.ts），控制器
 * 因此被设计成不碰 DOM，事件只用普通对象喂。
 */

/** 测试里代表 `.map-container` 的替身；`isCanvasTarget` 只做身份比较。 */
const CANVAS = "map-container";
const NODE = "me-tpc";

function pointer(patch: Partial<MindmapPanPointer> = {}): MindmapPanPointer {
	return {
		button: 0,
		clientX: 0,
		clientY: 0,
		ctrlKey: false,
		metaKey: false,
		pointerId: 1,
		pointerType: "mouse",
		target: CANVAS,
		...patch,
	};
}

function setup() {
	const effects: MindmapPanEffects = {
		capturePointer: vi.fn(),
		isCanvasTarget: (target) => target === CANVAS,
		move: vi.fn(),
		onCanvasClick: vi.fn(),
		releasePointer: vi.fn(),
		setPanning: vi.fn(),
	};
	return { controller: createMindmapPanController(effects), effects };
}

let harness = setup();

beforeEach(() => {
	harness = setup();
});

describe("createMindmapPanController", () => {
	it("接管空白画布上的左键按下，并按增量驱动 move", () => {
		const { controller, effects } = harness;
		expect(controller.down(pointer({ clientX: 100, clientY: 50 }))).toBe(true);
		expect(effects.capturePointer).toHaveBeenCalledWith(1);
		expect(effects.setPanning).toHaveBeenCalledWith(true);

		controller.drag(pointer({ clientX: 130, clientY: 40 }));
		expect(effects.move).toHaveBeenCalledWith(30, -10);

		// 第二次移动传的是相对上一帧的增量，不是相对按下点的累计量。
		controller.drag(pointer({ clientX: 130, clientY: 90 }));
		expect(effects.move).toHaveBeenLastCalledWith(0, 50);
		expect(effects.move).toHaveBeenCalledTimes(2);
	});

	it("按在节点上不接管，节点拖拽仍归 mind-elixir", () => {
		const { controller, effects } = harness;
		expect(controller.down(pointer({ target: NODE }))).toBe(false);
		controller.drag(pointer({ clientX: 200, target: NODE }));
		expect(effects.capturePointer).not.toHaveBeenCalled();
		expect(effects.setPanning).not.toHaveBeenCalled();
		expect(effects.move).not.toHaveBeenCalled();
	});

	it("右键与触屏不接管：那两条路库自己是通的", () => {
		const { controller, effects } = harness;
		expect(controller.down(pointer({ button: 2 }))).toBe(false);
		expect(controller.down(pointer({ pointerType: "touch" }))).toBe(false);
		expect(effects.move).not.toHaveBeenCalled();
	});

	it("pointerup 之后停止：松手后的移动不再平移", () => {
		const { controller, effects } = harness;
		controller.down(pointer({ clientX: 10, clientY: 10 }));
		controller.drag(pointer({ clientX: 60, clientY: 10 }));
		controller.end(pointer({ clientX: 60, clientY: 10 }));
		expect(effects.releasePointer).toHaveBeenCalledWith(1);
		expect(effects.setPanning).toHaveBeenLastCalledWith(false);

		controller.drag(pointer({ clientX: 400, clientY: 400 }));
		expect(effects.move).toHaveBeenCalledTimes(1);
	});

	it("pointercancel 之后停止，并且不算成一次点击", () => {
		const { controller, effects } = harness;
		controller.down(pointer({ clientX: 10, clientY: 10 }));
		controller.cancel();
		expect(effects.setPanning).toHaveBeenLastCalledWith(false);
		expect(effects.onCanvasClick).not.toHaveBeenCalled();

		controller.drag(pointer({ clientX: 400, clientY: 400 }));
		expect(effects.move).not.toHaveBeenCalled();
	});

	it("位移没超过 slop 的一次按下算点空白：取消选中", () => {
		const { controller, effects } = harness;
		controller.down(pointer({ clientX: 10, clientY: 10 }));
		// 3-4-5：位移 5px，正好落在阈值上，仍算点击。
		controller.drag(pointer({ clientX: 13, clientY: 14 }));
		controller.end(pointer({ clientX: 13, clientY: 14 }));
		expect(effects.onCanvasClick).toHaveBeenCalledTimes(1);
	});

	it("拖过 slop 之后松手不再取消选中，即使手又回到了原点", () => {
		const { controller, effects } = harness;
		controller.down(pointer({ clientX: 10, clientY: 10 }));
		controller.drag(pointer({ clientX: 90, clientY: 10 }));
		controller.drag(pointer({ clientX: 10, clientY: 10 }));
		controller.end(pointer({ clientX: 10, clientY: 10 }));
		expect(effects.onCanvasClick).not.toHaveBeenCalled();
	});

	it("Ctrl/Cmd + 点空白不清选中：那是加选手势，与框选库原行为一致", () => {
		const { controller, effects } = harness;
		controller.down(pointer({ metaKey: true }));
		controller.end(pointer({}));
		expect(effects.onCanvasClick).not.toHaveBeenCalled();
	});

	it("只认发起拖拽的那个指针，第二根手指的事件不干扰", () => {
		const { controller, effects } = harness;
		controller.down(pointer({ clientX: 10, clientY: 10, pointerId: 7 }));
		controller.drag(pointer({ clientX: 999, clientY: 999, pointerId: 8 }));
		expect(effects.move).not.toHaveBeenCalled();
		controller.end(pointer({ pointerId: 8 }));
		expect(effects.releasePointer).not.toHaveBeenCalled();

		controller.drag(pointer({ clientX: 40, clientY: 10, pointerId: 7 }));
		expect(effects.move).toHaveBeenCalledWith(30, 0);
	});

	it("一次拖拽期间再来一次 pointerdown 不会重入", () => {
		const { controller } = harness;
		expect(controller.down(pointer({ pointerId: 1 }))).toBe(true);
		expect(controller.down(pointer({ pointerId: 2 }))).toBe(false);
	});
});
