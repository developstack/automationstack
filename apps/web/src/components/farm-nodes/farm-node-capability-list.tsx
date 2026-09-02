/**
 * 能力清单的**列表本体**：一条能力长什么样、空清单说什么话。
 *
 * 与 farm-node-capabilities.tsx（那一块的外壳：时刻 + 重新探测按钮 + 三选一）
 * 分成两个文件，是「一个文件只导出一个组件」那条规则逼出来的（eslint local/
 * one-component-per-file）——但切口本身站得住：外壳回答「这份清单可信吗、怎么让它
 * 变新」，这里回答「一条能力怎么念」。两者的改动理由不同。
 */
import { FarmNodeCapabilityHint } from "@/components/farm-nodes/farm-node-capability-hint";
import type {
	BrowserCapability,
	NodeCapabilities,
} from "@/components/farm-nodes/farm-node-capability-meta";
import {
	browserCapabilityTitle,
	capabilitiesEmptyHint,
	capabilityBinLabel,
} from "@/components/farm-nodes/farm-node-capability-meta";

/**
 * 一条能力。不可用的整条压暗（同表格里停用行的做法）：这份清单是用来「扫一眼
 * 现在能用什么」的，压暗之后能用的那几条自己浮出来，而原因还留在原地可读。
 */
function CapabilityItem({
	backend,
	capability,
}: {
	backend: NodeCapabilities["backend"];
	capability: BrowserCapability;
}) {
	return (
		<li className={capability.available ? undefined : "text-muted-foreground"}>
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<span className="font-medium text-sm">
					{browserCapabilityTitle(capability)}
				</span>
				{/*
				 * 路径与镜像 tag 都是要被逐字抄走的东西（去机器上 ls、去 registry 上
				 * 核对），等宽字体才分得开 l/1、O/0——与镜像库里镜像那一列同规。
				 */}
				{capability.bin === undefined ? null : (
					<span className="font-mono text-muted-foreground text-xs">
						{capabilityBinLabel(backend)}：{capability.bin}
					</span>
				)}
			</div>
			{capability.available ? null : (
				<p className="text-xs">
					不可用：{capability.reason ?? "节点没有说明原因"}
				</p>
			)}
		</li>
	);
}

/**
 * 清单本体。空数组**不是错误**（一台什么都没装的机器该如实这么说），所以它有
 * 自己的一句话，且那句话要指出下一步去哪做什么。
 */
export function FarmNodeCapabilityList({
	capabilities,
}: {
	capabilities: NodeCapabilities;
}) {
	if (capabilities.browsers.length === 0) {
		return (
			<FarmNodeCapabilityHint>
				{capabilitiesEmptyHint(capabilities.backend)}
			</FarmNodeCapabilityHint>
		);
	}
	return (
		<ul className="flex flex-col gap-2">
			{capabilities.browsers.map((capability) => (
				<CapabilityItem
					backend={capabilities.backend}
					capability={capability}
					/*
					 * 名字 + 版本 + 通道才是一条能力的身份：同名不同版本、同版本不同
					 * 通道都要各占一行，只用 name 做 key 会让它们在重排时互相顶掉。
					 */
					key={`${capability.name}-${capability.version ?? ""}-${capability.channel ?? ""}`}
				/>
			))}
		</ul>
	);
}
