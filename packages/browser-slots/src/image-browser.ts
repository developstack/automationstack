import type { BrowserCapability } from "@automationstack/farm-node-protocol/capabilities";

/**
 * 把一个**镜像 tag** 翻成「浏览器名 + 版本」。
 *
 * ## 为什么这段解析住在这个包里
 *
 * 它原先在 `apps/farm/src/nodes/image-browser.ts`，只服务一个调用方：farm 把
 * 目录行的 `image` 翻成 `acquireParams` 的 `browserName` / `browserVersion`。
 * 能力上报把它变成了**两个**调用方——docker 后端的节点要把「已拉取的镜像列表」
 * 报成一串 `browserCapability`，而那一步要的正是同一条反解规则。
 *
 * 两份实现是不能接受的：farm 按规则 A 筛、节点按规则 B 报，分叉的那天没有一侧
 * 会报错，只会有一台明明拉了镜像的机器永远筛不中。所以规则搬进两边都依赖的
 * 这个包，farm 侧只剩一行 import。
 *
 * 规则刻意**宽松**（解析不出来就退回默认值，绝不抛）：镜像名是目录里的一列
 * 自由文本，一次手滑不该表现为「会话创建 500」，而该表现为「节点说它没有这个
 * 浏览器」——后一句话对用户有用得多。
 */

export interface BrowserRequest {
	browserName: string;
	/** null = 「哪个版本都行」（协议里 `browserVersion` 可空的语义）。 */
	browserVersion: string | null;
}

/** 目录行没写镜像名时的兜底浏览器。 */
const DEFAULT_BROWSER_NAME = "chromium";
/** 这两个 tag 表示「不指定版本」，翻成 null 而不是原样传下去。 */
const ANY_VERSION_TAGS = new Set(["", "latest"]);

/**
 * `automationstack-browser-chromium:140` → `{ browserName: "chromium", browserVersion: "140" }`。
 */
export function parseImageBrowser(image: string): BrowserRequest {
	// 先剥掉 registry / 路径前缀，避免把 `host:5000/foo` 里的端口当成 tag。
	const lastSlash = image.lastIndexOf("/");
	const ref = lastSlash === -1 ? image : image.slice(lastSlash + 1);

	const lastColon = ref.lastIndexOf(":");
	const repository = lastColon === -1 ? ref : ref.slice(0, lastColon);
	const tag = lastColon === -1 ? "" : ref.slice(lastColon + 1);

	// 浏览器名取最后一段：`automationstack-browser-chromium` → `chromium`。
	const lastDash = repository.lastIndexOf("-");
	const name = (lastDash === -1 ? repository : repository.slice(lastDash + 1))
		.trim()
		.toLowerCase();

	return {
		browserName: name === "" ? DEFAULT_BROWSER_NAME : name,
		browserVersion: ANY_VERSION_TAGS.has(tag) ? null : tag,
	};
}

/**
 * 一串已拉取的镜像 tag → 一串能力条目（docker 后端的能力上报）。
 *
 * 全部 `available: true`：镜像已经在本机磁盘上，这一步不存在「装了但用不了」
 * 这种状态——真起不来的原因（daemon 挂了、端口占满）不是**这个浏览器**的属性，
 * 报成某个浏览器不可用只会把人指错方向。
 *
 * `bin` 存原始 tag：`browserCapability.bin` 的语义是「这条能力在本机的具体落地物」，
 * local 后端是可执行文件路径，docker 后端就是这个 tag。少了它，farm 只能靠
 * name+version 再拼一次镜像名，而那正是这个文件存在要消灭的第二真相源。
 */
export function imagesToCapabilities(
	images: readonly string[]
): BrowserCapability[] {
	return images.map((image) => {
		const request = parseImageBrowser(image);
		return {
			available: true,
			bin: image,
			name: request.browserName,
			version: request.browserVersion,
		};
	});
}
