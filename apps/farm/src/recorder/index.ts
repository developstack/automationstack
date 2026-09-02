/**
 * recorder 对外只有两个入口（其余模块都是实现细节）：
 * - `startRecorder`：会话 running 前挂载，返回收尾用的 handle；
 * - `collectRecorderArtifacts`：finalize 时把工作目录整理成产物清单。
 *
 * 契约类型见 `./types`，与 farm 其余部分的耦合就到此为止。
 */

// biome-ignore lint/performance/noBarrelFile: 这是 recorder 对外的入口本身（上面已说明只有两个入口），不是「顺手 re-export 一切」的中转文件；其余模块都是实现细节，导出面必须收在一处
export { startRecorder } from "./client";
export { collectRecorderArtifacts } from "./collect";
export type {
	CollectRecorderArtifacts,
	FarmArtifactKind,
	RecorderArtifactFile,
	RecorderHandle,
	StartRecorder,
	StartRecorderOptions,
} from "./types";
