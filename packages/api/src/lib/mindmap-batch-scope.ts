/**
 * `mindmap.batch` 的授权作用域：一个批次到底动了哪些项目的东西。
 *
 * 单拎出来是因为脑图批量是全仓唯一一个「一次调用里带着任意多个、指向任意行的
 * id」的过程。其余过程都能由一个 id 直接解析出唯一的 projectId，这里不行：
 * 一个批次可以同时建模块、删用例、把模块挪到别处，`runMindmapBatch` 也只用
 * **首个**操作解析出一个 projectId 拿去发失效事件，从来没校验过其余操作是不是
 * 同一个项目。授权必须看全批，否则「第一条操作落在我自己的项目里」就成了
 * 一把能捎带删掉别人项目节点的钥匙。
 *
 * 这个文件是**纯函数**，不碰数据库：它只负责把批次拆成「要去库里解析的真实 id」
 * 与「操作自己声明的 projectId」，解析交给
 * `@automationstack/db` 的 `listProjectIdsByMindmapNodes`，判定交给
 * `./project-scope.ts` 的中间件。拆成纯函数才测得动——下面那条 tempId 的时序
 * 规则是本文件唯一容易写错、且写错了不会有任何东西变红的地方。
 */

import type { MindmapOperation } from "@automationstack/db/repositories/mindmap-operations";

export interface MindmapBatchScope {
	/** 批次引用到的、**库里真实存在的**用例 id。 */
	caseIds: string[];
	/** 同上，模块 id。含被引用为父节点 / 目标模块的那些。 */
	moduleIds: string[];
	/** 建节点的操作自己声明的 projectId，它们不需要查库就已知归属。 */
	projectIds: string[];
}

interface ScopeAccumulator {
	caseIds: Set<string>;
	moduleIds: Set<string>;
	projectIds: Set<string>;
}

function addModuleRef(
	acc: ScopeAccumulator,
	tempIds: ReadonlySet<string>,
	id: string | null
): void {
	if (id !== null && !tempIds.has(id)) {
		acc.moduleIds.add(id);
	}
}

function addCaseRef(
	acc: ScopeAccumulator,
	tempIds: ReadonlySet<string>,
	id: string
): void {
	if (!tempIds.has(id)) {
		acc.caseIds.add(id);
	}
}

function collectOperation(
	acc: ScopeAccumulator,
	tempIds: ReadonlySet<string>,
	op: MindmapOperation
): void {
	switch (op.op) {
		case "createModule":
			acc.projectIds.add(op.projectId);
			addModuleRef(acc, tempIds, op.parentId);
			break;
		case "createCase":
			acc.projectIds.add(op.projectId);
			addModuleRef(acc, tempIds, op.moduleId);
			break;
		case "moveModule":
			addModuleRef(acc, tempIds, op.id);
			addModuleRef(acc, tempIds, op.parentId);
			break;
		case "renameModule":
		case "removeModule":
			addModuleRef(acc, tempIds, op.id);
			break;
		case "moveCase":
			addCaseRef(acc, tempIds, op.id);
			addModuleRef(acc, tempIds, op.moduleId);
			break;
		default:
			addCaseRef(acc, tempIds, op.id);
	}
}

/**
 * 把一个批次摊平成「要解析的真实 id + 已知的 projectId」。
 *
 * ## tempId 的时序规则（这里唯一的陷阱）
 *
 * 批次里的 id 有两种：库里真实存在的行 id，和同批次里某个 create 操作
 * 现造的 tempId。后者不该拿去查库（查了必然查不到），但**哪些字符串算 tempId
 * 必须与 `runMindmapBatch` 里 `resolveId` 的判定逐字一致**：它读的是一个
 * 边跑边填的 idMap，所以一个 id 只有在**它出现之前**已经被某个 create 声明过，
 * 才会被当成 tempId。
 *
 * 因此下面是单趟遍历、且 `tempIds.add` 发生在处理完当前操作**之后**。
 * 若改成「先扫一遍收齐所有 tempId」，就会出现这样一个洞：
 * `[removeCase id:"X", createCase tempId:"X"]` —— 预扫会把 X 当 tempId 跳过，
 * 于是这批只声明了自己项目的 projectId 从而过关；而真正执行时 removeCase
 * 先跑，idMap 还是空的，`resolveId` 把 "X" 当真实 id 用，删掉的是别人项目里
 * 那条用例。规则写反了不会有任何测试变红，除非有人专门测它（见同名测试文件）。
 */
export function collectMindmapBatchScope(
	operations: readonly MindmapOperation[]
): MindmapBatchScope {
	const tempIds = new Set<string>();
	const acc: ScopeAccumulator = {
		caseIds: new Set<string>(),
		moduleIds: new Set<string>(),
		projectIds: new Set<string>(),
	};
	for (const op of operations) {
		collectOperation(acc, tempIds, op);
		if (op.op === "createModule" || op.op === "createCase") {
			tempIds.add(op.tempId);
		}
	}
	return {
		caseIds: [...acc.caseIds],
		moduleIds: [...acc.moduleIds],
		projectIds: [...acc.projectIds],
	};
}
