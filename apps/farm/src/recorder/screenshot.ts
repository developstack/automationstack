import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RECORDER_EVENT_TYPE } from "./normalize";
import { SCREENSHOTS_DIR_NAME } from "./paths";
import type { RecorderSink } from "./sink";

/**
 * 穷人版 filmstrip（plan §5.5「时间轴锚点与截图」）。
 *
 * 主 frame 每次导航截一张，节流 ≥2s、每会话上限 20 张——两个闸门都是防炸盘的：
 * 一个 SPA 可能在几秒内连续 push 十几次 history，一张 jpeg 又是几十上百 KB。
 * 收尾图（`captureScreenshot(label)` 手动路径）**不受张数上限约束**：它是会话
 * 最后的现场，恰恰是最不能被前面的常规截图挤掉的那张。
 *
 * 所有失败静默：截不到图不是错误（页面正在跳转、target 已经关了都会失败），
 * 更不该影响会话执行。
 */

/** 节流窗口：同一次导航风暴里只留第一张。 */
const NAVIGATION_THROTTLE_MS = 2000;

/** 每会话常规截图上限；手动截图不计入、也不受限。 */
const NAVIGATION_SCREENSHOT_LIMIT = 20;

/** jpeg 而不是 png：filmstrip 要的是「当时长什么样」，不是像素级还原。 */
export const SCREENSHOT_QUALITY = 70;

const SEQ_PAD_WIDTH = 3;
const UNSAFE_LABEL_CHARS = /[^a-zA-Z0-9._-]+/g;

export interface ScreenshotCapturer {
	/** 手动补图（收尾用），不受张数上限约束。 */
	capture: (label: string, url?: string) => Promise<void>;
	/** 主 frame 导航触发，受节流与张数上限约束。 */
	onNavigation: (url: string) => Promise<void>;
}

export interface ScreenshotCapturerDeps {
	/** 向「最近导航的那个 page session」发 Page.captureScreenshot，返回 base64；拿不到返回 null。 */
	captureJpegBase64: () => Promise<string | null>;
	now?: () => number;
	sink: RecorderSink;
	workDir: string;
}

const sanitizeLabel = (label: string): string => {
	const cleaned = label
		.replace(UNSAFE_LABEL_CHARS, "-")
		.replace(/^-+|-+$/g, "");
	// 标签会直接进文件名，必须挡住路径穿越与空名。
	return cleaned.length > 0 ? cleaned : "shot";
};

/** 序号补零：目录里按文件名排序就等于按时间排序，看图的人不用另找顺序。 */
const screenshotFileName = (seq: number, label: string): string =>
	`${String(seq).padStart(SEQ_PAD_WIDTH, "0")}-${sanitizeLabel(label)}.jpeg`;

/**
 * 索引行进事件流：截图与网络/console 在同一条时间轴上才能对得起来，
 * 而 collect 仍然只按目录列文件——索引行是给人看时间序的，不是清单来源。
 */
const emitScreenshotEvent = (
	sink: RecorderSink,
	ts: number,
	data: { file: string; label: string; seq: number; url: string }
): void => {
	sink.write({
		data,
		targetId: "",
		ts,
		type: RECORDER_EVENT_TYPE.screenshot,
	});
};

export const createScreenshotCapturer = (
	deps: ScreenshotCapturerDeps
): ScreenshotCapturer => {
	const now = deps.now ?? Date.now;
	const dir = join(deps.workDir, SCREENSHOTS_DIR_NAME);
	let seq = 0;
	let navigationCount = 0;
	let lastNavigationAt = 0;
	let dirReady = false;

	const write = async (label: string, url: string): Promise<void> => {
		const base64 = await deps.captureJpegBase64();
		if (!base64) {
			return;
		}
		if (!dirReady) {
			await mkdir(dir, { recursive: true });
			dirReady = true;
		}
		seq += 1;
		const fileName = screenshotFileName(seq, label);
		await writeFile(join(dir, fileName), Buffer.from(base64, "base64"));
		emitScreenshotEvent(deps.sink, now(), { file: fileName, label, seq, url });
	};

	const writeQuietly = async (label: string, url: string): Promise<void> => {
		try {
			await write(label, url);
		} catch {
			// 静默：截图是尽力而为的观测，失败不影响会话，也不该刷屏日志。
		}
	};

	return {
		async capture(label, url) {
			await writeQuietly(label, url ?? "");
		},
		async onNavigation(url) {
			const at = now();
			if (navigationCount >= NAVIGATION_SCREENSHOT_LIMIT) {
				return;
			}
			if (at - lastNavigationAt < NAVIGATION_THROTTLE_MS) {
				return;
			}
			// 先记账再截图：截图是异步的，等它回来再记账会让并发导航穿过闸门。
			lastNavigationAt = at;
			navigationCount += 1;
			await writeQuietly("navigation", url);
		},
	};
};
