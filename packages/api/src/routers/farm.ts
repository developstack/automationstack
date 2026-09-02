/**
 * 浏览器设备农场的控制面入口（phase4 §7）。
 *
 * 这个文件只做一件事：把三组过程挂成 `farm.browsers.*`、`farm.nodes.*` 与
 * `farm.sessions.*`。实现分别在 `./farm-browsers.ts`（平台级目录，写路径 admin）、
 * `./farm-nodes.ts`（实机节点，整组 admin）与 `./farm-sessions.ts`（项目级会话，
 * 全程 `requireProjectMember`）——拆分理由与 `testRuns` 那几个文件一致：
 * 三组的授权口径根本不同，合在一个文件里读的人得逐条确认「这条是哪一档」。
 *
 * 与那边唯一的差别是这里**嵌一层**（`{ browsers, nodes, sessions }`）而不是
 * spread 摊平：三个 `list` 在同一层就得各自改名，而它们列的是完全不同的东西
 * （能起哪些浏览器 / 有哪些机器 / 谁在跑），改名只会让调用点更难认。
 *
 * ⚠️ 控制面与 `apps/farm` 是**两个进程，不互相调用**（D3）。这里的每一条都只读写
 * 数据库：会话表是审计视图不是 farm 的真相，`kill` 落的是意向标记而不是杀死动作。
 */

import { farmBrowserProcedures } from "./farm-browsers";
import { farmNodeProcedures } from "./farm-nodes";
import { farmSessionProcedures } from "./farm-sessions";

export const farmRouter = {
	browsers: farmBrowserProcedures,
	/**
	 * 实机节点（`./farm-nodes.ts`）：**整组 admin**，比目录那组还紧一档——
	 * 它是一份基础设施清单，而且有两条会吐明文 token。推导写在那个文件头。
	 */
	nodes: farmNodeProcedures,
	sessions: farmSessionProcedures,
};
