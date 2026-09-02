import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";

import type { NodeSlotProvider } from "./node-provider";
import type { SourceRegistry } from "./source-registry";

/**
 * 握手时那一份能力清单的落库与纠偏。
 *
 * ## 为什么要落库
 *
 * 内存里那份（`SlotSource.capabilities`）的生命周期与连接一致，机器一掉线就没了；
 * 而管理后台要回答的是「这台机器上有什么浏览器」——一台此刻没连上来的机器，
 * 这个问题依然有答案。所以库里那一列是**给人看的档案**，内存那份是**给调度用的
 * 此刻事实**，两者故意不共用一个存储。
 *
 * ## 为什么要纠偏
 *
 * agent 在 hello 里报的能力，是它按自己那套「docker 优先」挑出来的后端探的
 * （`apps/node-agent` 的 `preferredBackend`）；而它**被登记成**哪种后端，
 * 是 farm 在 helloAck 那一刻说了算的。两者可以不一致：一台装了 docker 的机器
 * 被管理员按 local 登记，hello 里来的就是一份镜像清单，而它实际会用本机浏览器。
 * 不纠偏的话，平台上显示的浏览器清单与这台机器真正会用的那套完全无关，
 * 而调度还会照着它筛选——筛出来的每一条会话都会在 acquire 那步失败。
 *
 * 纠偏的手段是立刻打一次 `detectCapabilities`：helloAck 已经发出去了，agent
 * 那边记住的是**登记的**后端，所以这一次探测探的一定是对的那套。
 */

export interface NodeCapabilitySink {
	saveNodeCapabilities: (
		id: string,
		capabilities: NodeCapabilities
	) => Promise<void>;
}

interface SyncInput {
	/** 登记的后端（helloAck 里发下去的那个），纠偏的判据。 */
	backend: NodeCapabilities["backend"];
	capabilities: NodeCapabilities;
	name: string;
	nodeId: string;
	provider: NodeSlotProvider;
	sink: NodeCapabilitySink;
	sources: SourceRegistry;
}

async function syncOnce(input: SyncInput): Promise<void> {
	let { capabilities } = input;
	if (capabilities.backend !== input.backend) {
		console.warn(
			`节点 ${input.name} 报的能力是 ${capabilities.backend} 后端的，但它登记为 ${input.backend}，就地重探一次`
		);
		try {
			capabilities = await input.provider.detectCapabilities();
			// 只有探成功才换内存里那份。失败时宁可留着这份「后端对不上」的清单，
			// 也好过把源的能力清成 null——null 在筛选里等于「这台机器什么都干不了」。
			input.sources.updateCapabilities(input.name, capabilities);
		} catch (error) {
			console.warn(
				`节点 ${input.name} 重探能力失败，先按 hello 里那份存`,
				error
			);
		}
	}
	await input.sink.saveNodeCapabilities(input.nodeId, capabilities);
}

/**
 * 发射后不管：落库失败不该反过来把一台已经握完手的机器踢下线——它此刻能干活，
 * 只是档案没更新，而下一次心跳/重连/重探都会再试一遍。
 */
export function syncHelloCapabilities(input: SyncInput): void {
	syncOnce(input).catch((error: unknown) => {
		console.warn(`落库节点能力失败 node=${input.name}`, error);
	});
}
