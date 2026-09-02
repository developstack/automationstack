/**
 * 「接入指引」小卡片：一台新机器怎么变成这张表里的一行。
 *
 * 摆在列表**下方**而不是收进抽屉（farm/connect-guide.tsx 是抽屉）：那一份服务的
 * 是「我已经会用了，只是想再抄一段代码」，人是带着目的来的；这一份服务的是
 * 「我刚建完一个节点，然后呢」——那个「然后呢」出现在他还没想到要去点什么的时候，
 * 藏进抽屉等于要求他先知道自己在找什么。
 *
 * 三段命令的原文在 farm-node-setup-commands.ts，与创建 token 时那张对话框共用；
 * 完整版（另一条部署路线、开机自启、失败日志怎么读）在 apps/node-agent/README.md，
 * 这张卡片只负责把人送上最短的那条路。
 */
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";

import { DocCodeBlock } from "@/components/docs/doc-code-block";
import {
	NODE_AGENT_BUILD_COMMAND,
	NODE_AGENT_RUN_COMMAND,
	NODE_TOKEN_PLACEHOLDER,
	nodeAgentEnvFile,
} from "@/components/farm-nodes/farm-node-setup-commands";

/** 一步：小标题 + 一段代码。三步长得一样，抽出来免得复制三遍结构。 */
function SetupStep({ code, title }: { code: string; title: string }) {
	return (
		<div className="flex flex-col gap-2">
			<h3 className="font-medium text-sm">{title}</h3>
			<DocCodeBlock code={code} language="bash" />
		</div>
	);
}

export function FarmNodeSetupCard() {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>接入一台机器</CardTitle>
				<CardDescription>
					先在上面「添加节点」拿到 token，再按下面三步把 agent
					跑起来。它不监听任何端口，连接一律由那台机器主动发起，所以执行机不需要公网
					IP，也不用在防火墙上开洞。
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<SetupStep code={NODE_AGENT_BUILD_COMMAND} title="1. 在开发机上打包" />
				<SetupStep
					code={NODE_AGENT_RUN_COMMAND}
					title="2. 把产物拷到那台机器上（需要 Node.js ≥ 22）"
				/>
				<SetupStep
					code={nodeAgentEnvFile(NODE_TOKEN_PLACEHOLDER)}
					title="3. 在同一个目录放一个 .env"
				/>
				<p className="text-muted-foreground text-xs">
					{/* 两个值各自说一句「错了会怎样」：这两处填错的报错长得都不像它的成因 */}
					<code className="font-mono">NODE_AGENT_FARM_URL</code>{" "}
					是这台控制面的地址（部署时烘焙进前端的值，与运维配的不一致时找管理员改{" "}
					<code className="font-mono">VITE_FARM_URL</code>；生产必须是 https，
					token 明文在握手第一帧里）；
					<code className="font-mono"> NODE_AGENT_TOKEN</code>{" "}
					只显示过一次，找不着了就用行尾的「轮换
					token」重发一枚——旧的会立刻失效。日志里出现「已接入平台」这一行，就是连上了，这张表里对应的那一行随即转成在线。
				</p>
			</CardContent>
		</Card>
	);
}
