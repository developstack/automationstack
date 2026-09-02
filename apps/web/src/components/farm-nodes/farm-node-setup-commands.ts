/**
 * 接入一台实机节点要敲的命令，以及要落的 `.env`。
 *
 * 单独一个模块，是因为这几段字有**两个**出场地点，而它们必须一字不差：
 * 列表下方的「接入指引」卡片（token 处是占位符），以及创建/轮换 token 的那张
 * 对话框（token 处是真值，直接拷走就能用）。抄两份的下场是有一天只改了一处，
 * 而那种不一致要等到有人照着抄、agent 起不来才会暴露。
 *
 * 真相源是 `apps/node-agent/README.md` 与它的 `.env.example`。这里只搬「最短
 * 可用路径」（README 的路线 A：开发机打包 → 拷单文件过去 → 跑），完整的另一条
 * 路线、systemd/launchd、各种失败日志的含义都留在 README 里——一张卡片不该
 * 承担一份手册。
 *
 * 农场地址取 `env.VITE_FARM_URL`：本仓所有 web 侧环境变量都从那个入口读
 * （校验与默认值只有一份），而且它是**构建期烘焙**的常量，SSR 与浏览器读到的
 * 是同一个字面量，不会 hydration mismatch。
 */
import { env } from "@automationstack/env/web";

/**
 * token 在指引卡片里是**占位符**，不是真值。
 *
 * 明文只在创建/轮换那一刻的对话框里出现过一次，列表页根本拿不到；想拿也不该
 * 拿——把一枚节点 token 渲染进一段常驻可复制的命令，等于给截图和录屏留了个
 * 泄密口子（同 farm/connect-snippets.ts 里 TOKEN_PLACEHOLDER 那段）。
 */
export const NODE_TOKEN_PLACEHOLDER = "<刚才复制的那一串>";

/** 在开发机上打包。产物是单文件，执行机上因此不用装 pnpm、也不用有仓库。 */
export const NODE_AGENT_BUILD_COMMAND = `pnpm install
pnpm --filter node-agent build
# 产物：apps/node-agent/dist/index.mjs`;

/**
 * 在那台机器上摆开并跑起来。
 *
 * `dockerode` 那一行看着像是只有 docker 后端才需要，其实 local 后端也要装：
 * agent 的能力探测本身要 import 它，缺了会在启动阶段就炸（README 里专门写了
 * 这一条）。它是唯一打不进单文件产物的依赖——经 ssh2 依赖一个原生 .node 文件。
 */
export const NODE_AGENT_RUN_COMMAND = `mkdir node-agent && cd node-agent
cp /拷过来的/index.mjs .
npm install dockerode@4.0.12   # 唯一的外部依赖，local 节点也要装
node index.mjs`;

/**
 * agent 在**当前工作目录**读 `.env`。只给必需的两行：其余变量（工作目录、
 * Chrome 路径、无头与否、docker daemon 地址）全都有默认值或自动探测，
 * 摆在这里只会让人以为它们也得填。
 */
export function nodeAgentEnvFile(token: string): string {
	return `NODE_AGENT_FARM_URL=${env.VITE_FARM_URL}
NODE_AGENT_TOKEN=${token}`;
}
