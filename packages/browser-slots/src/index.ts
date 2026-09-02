/**
 * `@automationstack/browser-slots` 的公开导出面。
 *
 * 这个包就是原来的 `apps/farm/src/provider/`，一行行为都没改：
 * 「一个会话要占用的浏览器槽位」从哪来的那层抽象（`types.ts` 是规范），
 * 加上它的两个实现——Docker 一次性容器、本机 Chrome 进程组。
 *
 * 拆包的理由只有一个：farm 之外还有第二个宿主进程要用它（节点上的浏览器同样
 * 是这两种开法）。因此包里**不读任何 process.env**，也不认识任何一方的配置层，
 * 所有开关（Docker host、chrome 路径、无头与否、槽位根目录）一律经显式参数注入：
 * 两个宿主的 env 前缀不一样，谁读 env 就该由谁自己决定。
 *
 * 全部用 `export ... from`，不 import 再转手导出（`noExportedImports` 是 error）。
 */

// biome-ignore lint/performance/noBarrelFile: 这是包的公开入口本身，不是「顺手 re-export 一切」的中转文件；本包只有一个 exports 条目，导出面必须收在这一处
export {
	type BrowserProbe,
	createBrowserProbe,
	type DetectBrowsersInput,
	detectLocalBrowsers,
	parseBrowserVersion,
} from "./detect-browsers";
export {
	createDockerSlotProvider,
	type DockerSlotProviderOptions,
	type SlotEndpointMode,
} from "./docker";
export { parseDockerHost } from "./docker-host";
export { listPulledImages } from "./docker-images";
export { demultiplexDockerLogs, LOG_TAIL_LINES } from "./docker-logs";
export {
	type BrowserRequest,
	imagesToCapabilities,
	parseImageBrowser,
} from "./image-browser";
export {
	createLocalSlotProvider,
	type LocalSlotProviderOptions,
} from "./local";
export {
	type BinaryEnvNames,
	type BinaryLookup,
	createBinaryLookup,
	resolveChromeBinary,
	resolveChromedriverBinary,
} from "./local-binaries";
export {
	type PickBrowserBinInput,
	pickBrowserBin,
} from "./local-browser-pick";
export {
	createLocalRuntime,
	type LocalProcess,
	type LocalRuntime,
	type SpawnLocalInput,
} from "./local-runtime";
export {
	containerIdOf,
	createSlotDir,
	listSlotDirNames,
	profileDirOf,
	readSlotMeta,
	removeSlotDir,
	SLOT_META_FILE,
	SLOT_PROFILE_DIR,
	type SlotMeta,
	sessionIdOf,
	slotDirOf,
	writeSlotMeta,
} from "./local-slots";
export {
	type AcquiredSlot,
	type AcquireSlotInput,
	FARM_LABEL_EXPIRES_AT,
	FARM_LABEL_MANAGED,
	FARM_LABEL_SESSION,
	type FarmSlotMode,
	type ManagedContainer,
	type SlotProvider,
} from "./types";
