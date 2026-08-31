#!/bin/sh
#
# install-agent-skill.sh —— 把「本地 agent ←→ 测试用例平台」这条连接一条命令装好。
#
# 由来
# ----
# 平台在 /mcp 上提供一个无状态的 Streamable HTTP MCP 端点（八个工具：
# list_projects / create_project / get_module_tree / ensure_module_path /
# read_cases / list_case_tags / import_test_cases / search_cases），鉴权是
# `Authorization: Bearer <API Token>`。用户要用自己的本地 agent 连上来，需要做
# 两件事：装一份告诉 agent 怎么用这些工具的 skill，再把 MCP 端点写进 agent 的
# 配置。这两件事手工做要翻四份不同的文档，所以有了这个脚本。
#
# 装哪些 skill
# ------------
# 两份，与仓库 `.claude/skills/` 下的一模一样：
#   testcase-authoring —— 从需求设计新用例（两道人工闸门，产出 draft）
#   testcase-migration —— 把存量用例文件搬进平台（字段映射 + 分批导入）
# 分成两份而不是合成一份，是因为它们的入口条件不同（手里是需求 vs 手里是已有
# 用例文件），而 agent 靠 description 路由；合成一份之后，两条流程里那些「必须
# 先问用户」的闸门会被一起翻页翻过去。
#
# 「skill 名」与「MCP server 名」是两件事
# --------------------------------------
# MCP server 条目名固定是 testcase-platform，与服务端 `MCP_SERVER_INFO.name`
# （apps/server/src/mcp/server.ts）逐字一致——skill 正文里写的全限定工具名
# `testcase-platform:read_cases` 能不能解析，取决于这个名字对不对得上。
# skill 目录名则是 testcase-authoring / testcase-migration。早先的版本用同一个
# 变量兼任两者，于是脚本装出来的 skill 叫 testcase-platform，仓库里根本没有这个
# skill，两边永远对不上。
#
# 下面 GENERATED 区块里的 skill 正文由 `node scripts/build-install-agent-skill.js`
# 从 `.claude/skills/` 生成，**不要手改**（手改会在下次生成时被覆盖，而且 CI 的
# `--check` 会直接失败）。改 skill 请改 `.claude/skills/` 下的真身再重新生成。
#
# 为什么四家格式不能共用一份配置
# ------------------------------
# 「MCP 配置」只是一个惯例，不是一个标准。四家客户端在四个维度上各走各的：
#
#   维度          Claude Code        Codex              opencode            zcode
#   ---------------------------------------------------------------------------------
#   文件格式      JSON               TOML               JSON                JSON
#   顶层键        mcpServers         [mcp_servers.*]    mcp                 mcpServers
#   远程类型值    "http"             （不写 type）      "remote"            "http"（推断）
#   注入 token    ${AS_TOKEN} 插值   bearer_token_env_  {env:AS_TOKEN} 插值 无插值，写字面量
#                                    var = "AS_TOKEN"
#   项目级路径    .mcp.json          .codex/config.toml opencode.json       .agents/mcp.json
#
# 任何一格填成邻居的写法都是静默失败：Codex 会把 "${AS_TOKEN}" 原样当成 token 发出去
# （它不做字符串插值，只接受「环境变量的名字」）；opencode 见到 type:"http" 不认，
# 见不到 oauth:false 就会自己去试 OAuth 握手；zcode 那份甚至没有官方的 remote 示例。
# 所以这里是四段独立的写入逻辑，而不是一个模板套四次。
#
# 第五家 pi 不在上表里：pi 的 README 逐字写着 "No MCP"，它没有 MCP 客户端。
# pi 只装 skill，靠 skill 里的 curl 直连 /mcp。
#
# 这个脚本从不接受、也从不写入任何 token 值。
#

set -eu

SCRIPT_NAME="install-agent-skill.sh"
# MCP 配置里的 server 条目名。必须与服务端 MCP_SERVER_INFO.name 一致，
# 否则 skill 里写的 `testcase-platform:xxx` 全限定工具名解析不到。
# 它不是 skill 的名字——skill 名见 GENERATED 区块里的 SKILL_NAMES。
MCP_SERVER_NAME="testcase-platform"
DEFAULT_URL="http://localhost:3000/mcp"

MCP_URL="$DEFAULT_URL"
PLATFORM="all"
SCOPE="project"
SKILL_ONLY=0
DRY_RUN=0
EXIT_CODE=0

# 检测到的平台，空格分隔（前后各留一个空格，便于 case 匹配）
DETECTED=" "
# JSON 合并用哪个工具：jq / python3 / none
JSON_TOOL="none"

# ---------------------------------------------------------------- 输出零件

say() {
	printf '%s\n' "$*"
}

step() {
	printf '\n== %s\n' "$*"
}

ok() {
	printf '  [OK] %s\n' "$*"
}

info() {
	printf '  ---- %s\n' "$*"
}

warn() {
	printf '  [!]  %s\n' "$*" >&2
}

fail() {
	printf '  [X]  %s\n' "$*" >&2
	EXIT_CODE=1
}

usage() {
	cat <<'USAGE'
用法：sh install-agent-skill.sh [选项]

把测试用例平台的 skill 与 MCP 配置装进你本地的 agent。

选项：
  --url <URL>             平台 MCP 端点，默认 http://localhost:3000/mcp
  --platform <name>       claude | codex | opencode | zcode | all
                          默认 all —— 只给「检测到已安装」的平台装。
                          显式指定某一家时，即使没检测到也照装。
  --scope <user|project>  project（默认）= 写进当前目录；user = 写进 $HOME
  --skill-only            只装 skill，完全不碰 MCP 配置
  --dry-run               只打印将要做什么，一个字节都不写（也不建目录、不建备份）
  -h, --help              显示本帮助

不接受 token 参数：本脚本永远不会把 token 值写进任何文件。
装完后自己 export AS_TOKEN=<你的 token> 即可。
USAGE
}

# ---------------------------------------------------------------- 参数解析

while [ "$#" -gt 0 ]; do
	case "$1" in
		--url)
			[ "$#" -ge 2 ] || { say "错误：--url 需要一个值"; exit 2; }
			MCP_URL="$2"
			shift 2
			;;
		--url=*)
			MCP_URL="${1#--url=}"
			shift
			;;
		--platform)
			[ "$#" -ge 2 ] || { say "错误：--platform 需要一个值"; exit 2; }
			PLATFORM="$2"
			shift 2
			;;
		--platform=*)
			PLATFORM="${1#--platform=}"
			shift
			;;
		--scope)
			[ "$#" -ge 2 ] || { say "错误：--scope 需要一个值"; exit 2; }
			SCOPE="$2"
			shift 2
			;;
		--scope=*)
			SCOPE="${1#--scope=}"
			shift
			;;
		--skill-only)
			SKILL_ONLY=1
			shift
			;;
		--dry-run)
			DRY_RUN=1
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			say "错误：无法识别的参数 '$1'"
			say "试试 sh $SCRIPT_NAME --help"
			exit 2
			;;
	esac
done

case "$PLATFORM" in
	claude|codex|opencode|zcode|all) : ;;
	*)
		say "错误：--platform 只能是 claude / codex / opencode / zcode / all，收到 '$PLATFORM'"
		exit 2
		;;
esac

case "$SCOPE" in
	user|project) : ;;
	*)
		say "错误：--scope 只能是 user 或 project，收到 '$SCOPE'"
		exit 2
		;;
esac

# URL 会被原样嵌进 JSON 字符串字面量，带引号或反斜杠会把文件写坏；
# 它同时是 skill 正文里 __MCP_URL__ 的 sed 替换文本，所以 `|`（分隔符）与
# `&`（在替换串里表示整个匹配）也要挡掉——这两个字符不会让脚本报错，
# 只会把 skill 正文悄悄写成别的东西。
# 下面是 case 的 glob 模式，不是字符串拼接：`*'"'*` 匹配含双引号的值，
# `*'\'*` 匹配含反斜杠的值。shellcheck 误以为这里是想转义单引号。
# shellcheck disable=SC1003
case "$MCP_URL" in
	*'"'*|*'\'*)
		say "错误：--url 不能包含引号或反斜杠：$MCP_URL"
		exit 2
		;;
	*'|'*|*'&'*)
		say "错误：--url 不能包含 | 或 &：$MCP_URL"
		exit 2
		;;
	'')
		say "错误：--url 不能为空"
		exit 2
		;;
esac

if [ "$SCOPE" = "user" ]; then
	BASE_DIR="$HOME"
else
	BASE_DIR="$(pwd)"
fi

# 所有客户端共用同一份真身：.agents/skills/<skill 名>/。
# Claude Code 只扫 .claude/skills/，所以那边放的是指向真身的符号链接。
SKILLS_ROOT="$BASE_DIR/.agents/skills"
CLAUDE_SKILLS_ROOT="$BASE_DIR/.claude/skills"

# ---------------------------------------------------------------- 通用文件零件

# 备份一个已存在的文件，打印备份路径。
backup_file() {
	bf_target="$1"
	bf_backup="$bf_target.bak.$(date +%s)"
	cp "$bf_target" "$bf_backup"
	info "已备份原文件 -> $bf_backup"
}

# 确保目录存在（dry-run 下什么都不做）。
ensure_dir() {
	if [ "$DRY_RUN" -eq 1 ]; then
		return 0
	fi
	mkdir -p "$1"
}

# 把 stdin 的内容落到目标文件；内容与现有文件一致则跳过（幂等），
# 不一致且文件已存在则先备份。
install_content() {
	ic_target="$1"
	ic_tmp="$ic_target.tmp.$$"
	cat > "$ic_tmp"
	if [ -f "$ic_target" ] && cmp -s "$ic_tmp" "$ic_target"; then
		rm -f "$ic_tmp"
		ok "$ic_target 已是最新，跳过写入"
		return 0
	fi
	if [ -f "$ic_target" ]; then
		backup_file "$ic_target"
	fi
	mv "$ic_tmp" "$ic_target"
	ok "已写入 $ic_target"
}

# ---------------------------------------------------------------- skill 正文
#
# 下面整块由 `node scripts/build-install-agent-skill.js` 从 `.claude/skills/`
# 生成：两个 skill 的 SKILL.md 与 references/*.md 逐字嵌进来。
#
# 为什么是「嵌进来 + 生成器」而不是「装的时候去下载」：
#   本脚本的 --url 指向的是 MCP 端点（server，默认 3000 端口），而 skill 文件是
#   web 的静态资源（另一个端口/域名），从前者推后者是猜。为此再加一个参数，就等于
#   让一个现在完全离线可用的安装器多出「下载到一半」「下到旧版本」两种失败形态。
#   嵌进来的代价是文件长，而长出来的那部分是机器写的，靠 --check 保证不漂移。
#
# 手改这块没有意义：下次生成会覆盖，CI 的 `--check` 会先一步失败。
# 改 skill 请改 `.claude/skills/` 下的真身，再重新生成本文件。
#
# 正文里的 __MCP_URL__ 由 emit_skill_file 统一 sed 成 $MCP_URL；heredoc 一律用
# 引号包住定界符，于是 $AS_TOKEN、${...} 这类写法原样保留，不会被 shell 吃掉。

# >>> BEGIN GENERATED SKILLS
SKILL_NAMES="testcase-authoring testcase-migration"

# skill_file_list <skill 名>：这个 skill 由哪些文件组成（相对 skill 目录）。
skill_file_list() {
	case "$1" in
		'testcase-authoring')
			printf '%s\n' 'SKILL.md' 'references/case-quality.md' 'references/platform-contract.md' 'references/techniques.md' 'references/worked-example.md'
			;;
		'testcase-migration')
			printf '%s\n' 'SKILL.md' 'references/case-schema.md' 'references/mapping-examples.md' 'references/source-formats.md'
			;;
	esac
}

# skill_file_content <skill 名> <相对路径>：把该文件的正文吐到 stdout。
skill_file_content() {
	case "$1/$2" in
		'testcase-authoring/SKILL.md')
		cat <<'TCP_SKILL_EOF_1'
---
name: testcase-authoring
description: 从需求文档、PRD、接口定义、用户故事或代码变更设计测试用例，并写入测试用例平台（草稿态待评审）。流程含：先读平台已有用例正文作为风格与查重锚点、拆解测试点、就需求里没写清的假设向用户确认、按等价类/边界值/判定表/状态迁移/成对组合/错误推测/场景法配方法、逐条按可判定性自检，最后经 testcase-platform MCP 工具批量写入。触发场景：根据需求写用例、生成测试用例、设计测试用例、需求转用例、给这个功能补用例、这个模块覆盖够不够、补几条异常场景、write test cases from requirements、design test cases、generate test cases from a PRD。用户没说「用例」二字、只说「这个需求怎么测」「这块要测哪些点」时同样适用。输入是需求，不是已有用例文件——用户给的若是 Excel/CSV/XMind/TestRail 导出件里已经写好的存量用例，那是搬运不是设计，改用 testcase-migration。
---

# 从需求设计测试用例

把一段需求变成一批**低层用例**（步骤里带真实数据、预期可判定），经用户确认后写进平台。
产出的形状由平台字段定死：`name` / `preconditions` / `steps[{id, step, expected}]` /
`priority` / `caseType` / `status` / `tags` / `sourceRef`。

## 常驻规则（全程有效，不是某一步的注意事项）

这四条在整个任务里一直成立，包括用户中途改需求、要求"再来 20 条"、或者催"直接写就行"的时候。

1. **动笔前先读平台**。没调过 `testcase-platform:read_cases` 就开始写用例，产出必然是
   教科书味的通用用例：跟这个项目已有的几百条对不上、还会把已经存在的用例换个说法重写一遍。
   模型看不见平台里的数据，这是它唯一的入口。
2. **两道闸门，未过闸门不调用任何写入工具**——闸门①（假设确认，第 3 步）、
   闸门②（草案确认，第 5 步）。需求永远不完整，而模型的默认行为是自己把缺口补上并且不说；
   写进平台的用例是要给人执行的，替用户拍板的那部分正是评审时会被推翻的部分。
3. **写入一律 `status: "draft"`**。平台的用例列表按 status 过滤，`draft` 就是"未评审"这一格。
   直接写 `active` 等于把没人看过的 AI 产出混进正式用例库，事后要靠人逐条挑出来。
4. **`onDuplicate` 用 `"skip"`（补漏）或 `"overwrite"`（需求改了重出一版），
   不用 `"create-anyway"`**——它会把 sourceRef 置成 null，那条用例从此退出幂等体系，
   以后每次重跑都再复制一份。

工具名一律写全限定名 `testcase-platform:<工具>`：同一会话里可能挂着别的 MCP server，
裸名会歧义。

## 流程

把下面这份清单复制进你的回复，逐项打勾：

```
- [ ] 0 工具可用（testcase-platform:list_projects 能返回）
- [ ] 1 需求原文 / 目标项目 / 目标模块 / 需求标识 四样齐了
- [ ] 2 读了平台上下文：模块覆盖、范例用例、目标模块现有用例、标签词表
- [ ] 3 输出测试点清单 + 未言明的假设，🚧 闸门① 等用户回答
- [ ] 4 每个测试点配了方法，输出「测试点 × 方法」矩阵
- [ ] 5 写出草案并逐条自检，🚧 闸门② 等用户确认或修改
- [ ] 6 ensure_module_path → import_test_cases（draft / skip / gen: 前缀 sourceRef）
- [ ] 7 汇总 + 交接给用户去平台评审
```

### 0. 确认工具在

调一次 `testcase-platform:list_projects`。**一个平台工具都看不见时按顺序排查，不要猜**
（鉴权发生在注册工具之前，所以 401 的表现就是"没有工具"，与"服务端没起"同形）：
排查步骤见 [references/platform-contract.md](references/platform-contract.md) 的「连不上时」一节。

### 1. 收集输入

- **需求原文**：文件路径 / 粘贴的文本 / Jira 链接。拿不到原文就不要开始——凭需求标题写用例是编。
- **目标项目**：`testcase-platform:list_projects`，读一下项目 `description`（团队常把自己的约定写在那里）。
- **目标模块**：下一步的模块树里挑，或与用户商定新建。
- **需求标识**：sourceRef 的前缀，如 `PROJ-1234` 或 `prd/payment-v2.md`。**这一项要和用户敲定**，
  agent 每次自己编一个，重跑时幂等就没了。

### 2. 读平台上下文

四个调用，按顺序：

1. `testcase-platform:get_module_tree(projectId)` — 每个模块带 `caseCount` / `activeCaseCount` / `gap`。
   决定往哪挂，以及"补用例"是从零开始还是查漏。
2. `testcase-platform:read_cases(projectId, tags:["范例"], detail:"full")` — 取风格样本。
   项目没有这个标签就跳过，别硬造。
3. `testcase-platform:read_cases(projectId, moduleId, detail:"full")` — 目标模块现有用例正文。
   **这是查重的唯一依据**：判断两条中文用例是不是一个意思，只能靠读正文。
4. `testcase-platform:list_case_tags(projectId)` — 标签词表，新用例的标签优先落在里面。

重新生成同一需求时，再加一条 `read_cases(sourceRefPrefix:"gen:<需求标识>#", detail:"full")`：
把上一轮的产物摆给用户看，再决定这次是 `skip` 补漏还是 `overwrite` 重出一版。

### 3. 拆需求 → 测试点 + 假设　🚧 闸门①

输出两份东西：

- **测试点清单**：需求里每一条可验证的规则一行（"用户名 4–20 字符"、"已提交的任务不可修改"）。
- **未言明的假设**：需求没写、但写用例必须定下来的东西——边界含不含端点、错误提示的确切文案、
  超时时长、权限矩阵里没列的角色、并发下的行为。**逐条问用户，不要自己填上默认值继续。**

问完停下等回答。一次别问太多，先问影响用例条数与优先级的那几条。

### 4. 选方法

按下表给每个测试点配 1–2 种方法，输出「测试点 × 方法」矩阵。
详细的产出形状与常见错误在 [references/techniques.md](references/techniques.md)，只读用到的那几节。

| 需求里出现这个信号 | 默认用 | 补充用 |
|---|---|---|
| 输入框、参数、字段、"支持…格式"、"最多/最少" | 等价类划分 | 边界值分析 |
| 数字范围、长度限制、日期区间、配额、分页 | 边界值分析 | 等价类划分 |
| "如果 A 且 B 则…否则…"、多条件组合、权限矩阵、费率规则 | 判定表 | 成对组合（条件 >4 个时） |
| 状态、流程、"提交后不能再改"、订单/工单/审批流 | 状态迁移 | 场景法 |
| 多个独立可选维度（浏览器 × 系统 × 支付方式） | 成对组合 | — |
| 完整业务流程、用户故事、"用户可以…然后…" | 场景法 | 判定表（分支处） |
| 接口文档、错误码表、幂等/重试/超时 | 等价类 + 边界值 | 错误推测 |
| 以上都覆盖完之后 | 错误推测 | — |

不确定时用「等价类划分 + 边界值分析」起步。

### 5. 写草案 + 自检　🚧 闸门②

按 [references/case-quality.md](references/case-quality.md) 写，写完**把该文件末尾那份清单逐条打勾**，
不过的就改，改不动就删。然后输出草案表等用户确认：

| # | 用例名 | 优先级 | 方法 | 与已有用例的关系 |
|---|---|---|---|---|
| 1 | 用户名 21 字符时提示长度超限 | P1 | 边界值 | 新增 |
| 2 | … | P0 | 场景法 | 与《…》重叠，建议放弃 |

「与已有用例的关系」三选一：**新增** / **与《X》重叠（建议放弃）** / **补充《X》的边界**。
这一列是第 2 步读正文的兑现处，不能空着。用户改完再进第 6 步。

### 6. 写入

- `testcase-platform:ensure_module_path(projectId, path)` 拿 `moduleId`（幂等，已存在不会重建）。
- `testcase-platform:import_test_cases`，每批 ≤50 条，`status:"draft"`，`onDuplicate:"skip"`，
  `sourceRef` = `gen:<需求标识>#<用例名 slug>`（slug 由用例名派生，**不要用序号**：
  中间插一条，后面全部错位，重跑就造出一堆重复）。
- 每批读 `created` / `skipped` / `errors` 三段；`errors` 里的 `index` 是**批内下标**，不是草案表行号。

### 7. 汇总 + 交接

汇总"新建 N 条 / 跳过 N 条（已存在）/ 失败 N 条（附原因）"，附上写入的模块与 sourceRef 前缀，
然后明确交接：**这些用例是 `draft`，去平台里逐条评审，确认后把状态改成 `active`。**

## 会咬人的地方

- **`isError: true` 有两种含义**。`你不是该项目的成员` 是"你不该继续"——停下来让用户去找项目 owner 加成员，
  **不要换个项目继续写**（那会把用例写进错误的项目）。`项目不存在` / `模块不存在` / 入参校验失败
  是"改了再来"。对照表在 [references/platform-contract.md](references/platform-contract.md)。
- **HTTP 状态码在这条通道上没有信息量**：FORBIDDEN / NOT_FOUND / BAD_REQUEST 全被折成
  HTTP 200 + `isError: true`，所以**每次调用都要看 `isError` 和文本**，别因为"没报错"就当成功。
- **`search_cases` 不返回 `steps` / `preconditions`**，拿它当上下文来源等于什么都没读。
  读正文只有 `read_cases(detail:"full")` 一条路。
- **`overwrite` 不会移动模块**：它只覆盖内容字段，用例还留在原来的 `moduleId` 下。
- **`read_cases(detail:"full")` 每页最多 20 条**（默认 10）。别为了"一次读完"把 pageSize 开到最大，
  正文很占地方；先 summary 看清有哪些，再对需要的模块拉 full。

## 参考文档

- [references/techniques.md](references/techniques.md)——按"需求里出现什么信号"索引到方法；每种方法的产出形状与常见错误。**第 4 步查表用，只读用到的那几节。**
- [references/case-quality.md](references/case-quality.md)——标题/前置条件/步骤/预期/优先级的判据，以及**第 5 步逐条打勾的自检清单**。
- [references/platform-contract.md](references/platform-contract.md)——八个工具的入参与返回、用例字段与枚举、sourceRef 约定、错误文本对照表、连不上时的排查。**调用工具前不确定参数时读它。**
- [references/worked-example.md](references/worked-example.md)——一段真实需求走完全流程：测试点、假设提问、方法矩阵、草案表、工具调用、汇总。**第一次用这个 skill、或不确定产出该长什么样时读它。**
TCP_SKILL_EOF_1
			;;
		'testcase-authoring/references/case-quality.md')
		cat <<'TCP_SKILL_EOF_2'
# 用例写法与自检清单

一句话判据：**另一个人只拿着这条用例、不问你、不看需求，能执行出同一个"过/不过"的结论。**
做不到的地方就是这条用例的缺陷。

## name（用例名）

一句话说清「在什么条件下做什么，得到什么」。以结果收尾，不要以"验证/测试"开头。

- ✅ `优惠券过期后下单不享受折扣`
- ✅ `用户名 21 字符时提示长度超限`
- ❌ `测试登录功能`（不可判定，也和另外 20 条重名）
- ❌ `验证用户名`（不知道验证什么）

用例名同时是 `sourceRef` 的 slug 来源，所以要**稳定**：不要带日期、序号、"第二版"。

## preconditions（前置条件）

写「执行人开始前必须已经成立的状态」，且必须是**执行人能自己造出来**的：账号与角色、
已存在的数据及其关键字段、系统开关、时间/时区。

- ✅ `已存在订单 SO-1001，状态=待支付，金额 200 元；以会员账号 qa_member01 登录`
- ❌ `系统正常运行`（永远成立，等于没写）
- ❌ `已登录`（哪个角色？权限用例里这就是全部信息量）

数据能造就写怎么造，不能造就写清依赖谁提供。没有前置条件时留空字符串，别写"无特殊要求"。

## steps（步骤）

每步一个动作，带**真实数据**，不带预期以外的解释。`steps` 是数组，每项
`{id, step, expected}`；`id` 在一条用例内唯一且非空（用 uuid 或 `s1`/`s2` 都行）。

- 步数控制在 3–10；超过 12 步说明你把好几条用例焊在了一起，拆开。
- 数据写死：`输入用户名 "a".repeat(21)` 要写成 `输入 21 个字符的用户名 aaaaaaaaaaaaaaaaaaaaa`；
  `输入一个大文件` 要写成 `上传 5.1MB 的 photo.jpg`。
- 不要在步骤里写"检查是否正确"——检查属于 `expected`。

## expected（预期结果）——这是最容易烂掉的字段

**每一步都要有 `expected`，且必须可判定**：说出观察到的具体现象，最好带上文案原文、
状态值、数字、接口状态码。

- ✅ `页面顶部出现红色提示"用户名长度需为 4-20 个字符"，表单未提交，用户名输入框保留原值`
- ✅ `接口返回 400，body.code = "COUPON_EXPIRED"；订单列表中该单状态仍为"待支付"`
- ❌ `页面显示正常` / `功能正常` / `操作成功` / `符合预期` / `跳转到正确的页面`

**硬规则（可以 grep 自查）**：`expected` 里不许出现「正常」「正确」「成功」「符合预期」
这四个词单独作为判据。写完后逐条搜一遍这四个词，命中就改成具体现象。
（"提示支付成功" 这种带具体文案的不算违规——违规的是拿这些词当作整个预期。）

## priority（优先级）

**一批用例全是默认 P2，等于没有优先级。**每条都要有理由：

| 级别 | 判据 |
|---|---|
| P0 | 挂了就不能发版：核心主流程、支付/资金、数据丢失、登录鉴权 |
| P1 | 主要功能的正常路径与高频异常；出问题会有用户报障 |
| P2 | 次要功能、少见的异常分支、提示文案 |
| P3 | 边角、兼容性、极低频场景 |

经验分布：P0 少（一位数），P1 最多，P2 次之，P3 零星。

## caseType

`functional`（默认）/ `interface`（直接调接口的）/ `performance` / `security`
（越权、注入、敏感信息）/ `compatibility`（浏览器、机型、版本）/ `other`。
接口用例别一律填 functional——平台按这个字段分工。

## tags

先调 `testcase-platform:list_case_tags` 拿项目已有词表，能复用就复用；确需新增时
控制在 1–2 个，并在草案表里说明。同义标签（`登录`/`用户登录`/`auth`）互相稀释过滤功能。

## status / sourceRef

- `status` 恒为 `"draft"`（见 SKILL.md 常驻规则 3）。
- `sourceRef` = `gen:<需求标识>#<用例名 slug>`，同项目内唯一，重跑要能重现同一串。

---

## 交付前逐条打勾

不过的改，改不动的从草案里删掉——**删一条不可判定的用例，比留着它让人执行时来问你更省事。**

```
- [ ] 每条用例名都能一句话说清「条件+动作+结果」，全批无重名、无"测试XX功能"
- [ ] 每条 preconditions 里的状态执行人能自己造出来（角色、数据、开关都点名了）
- [ ] 每条 3–10 步，步骤里的数据是具体值，不是"某个""一个大的""非法的"
- [ ] 每一步都有 expected，没有空着的
- [ ] grep 过 expected：没有拿「正常/正确/成功/符合预期」当判据的
- [ ] 每条 expected 至少含一个可观察的具体物（文案原文 / 状态值 / 数字 / 状态码）
- [ ] 优先级不是一水儿 P2，且每条都能说出定级理由
- [ ] caseType 与用例实际形态一致（接口用例没被填成 functional）
- [ ] tags 来自项目已有词表，新增的已在草案表里说明
- [ ] 每条都能在第 2 步读到的已有用例里找到位置：新增 / 与《X》重叠 / 补充《X》
- [ ] 全批没有两条在测同一件事（换了说法也算同一条）
- [ ] 闸门①问出来的答案，确实落进了具体的 expected，而不是又变回模糊表述
- [ ] status 全是 draft，sourceRef 全是 gen:<需求标识>#<slug> 且互不重复
```
TCP_SKILL_EOF_2
			;;
		'testcase-authoring/references/platform-contract.md')
		cat <<'TCP_SKILL_EOF_3'
# 平台契约：工具、字段、错误

MCP server 名 `testcase-platform`，共 8 个工具。调用时一律写全限定名
`testcase-platform:<工具>`。

## 工具

| 工具 | 入参 | 返回 |
|---|---|---|
| `list_projects` | — | 项目数组：`{id, name, description, createdAt, updatedAt}` |
| `create_project` | `name`，可选 `description` | 新项目（含 `id`） |
| `get_module_tree` | `projectId` | 两块内容：缩进大纲文本 + 扁平 JSON `{id, name, parentId, depth, caseCount, activeCaseCount, gap}` |
| `ensure_module_path` | `projectId`、`path`（根到叶的名字数组，1–10 段） | `{moduleId, createdModuleIds[]}` |
| `read_cases` | `projectId`，可选 `moduleId`/`includeDescendants`/`keyword`/`status`/`priority[]`/`tags[]`/`sourceRefPrefix`/`detail`/`page`/`pageSize` | `{detail, items[], page, pageSize, total}` |
| `list_case_tags` | `projectId` | 去重排序后的标签字符串数组 |
| `import_test_cases` | `projectId`、`cases[]`（≤50）、`onDuplicate` | `{created[], skipped[], errors[]}` |
| `search_cases` | `projectId`、`keyword`，可选 `limit` | 摘要行数组（**无正文**） |

细节：

- **`get_module_tree` 的计数含子孙**。用例通常挂在叶子上，中间层模块是文件夹；
  `gap` 取 `"empty"`（整棵子树零用例）/ `"no-active"`（有用例但没有 active）/ `null`。
- **`ensure_module_path` 幂等**，按名字匹配，已存在的层不会重建；写用例前用它拿 `moduleId`。
- **`read_cases` 的 `detail`**：`summary`（默认，无正文）返回
  `id/name/moduleId/priority/status/caseType/tags/sourceRef/maintainer/updatedAt`；
  `full` 额外带 `preconditions` 与 `steps`，**每页默认 10 条、最多 20 条**。
  想读一个大模块时：先 summary 摸清有哪些，再对需要的部分翻 full。
- **`search_cases` 只按用例名做不区分大小写的子串匹配**，`%` 与 `_` 按字面处理，
  不返回 `steps` / `preconditions`。它只回答"这条在不在"，不能用来判重、也不能用来学风格。
- **`sourceRefPrefix` 是前缀匹配**（左锚定）：`gen:PROJ-1234#` 能捞出上一轮为这个需求
  生成的全部用例。`sourceRef` 为 null 的用例永远不会被它匹配到。

## 用例字段

`import_test_cases` 的每条用例：

| 字段 | 类型 / 取值 | 说明 |
|---|---|---|
| `moduleId` | uuid，**必填** | 来自 `ensure_module_path` 或 `get_module_tree` |
| `name` | 非空字符串，**必填** | — |
| `preconditions` | 字符串或 null | 默认 null |
| `steps` | `[{id, step, expected}]` | 默认 `[]`；`id` 在一条用例内唯一且非空 |
| `priority` | `P0`\|`P1`\|`P2`\|`P3` | 默认 `P2`——**新写的用例要显式给** |
| `caseType` | `functional`\|`interface`\|`performance`\|`security`\|`compatibility`\|`other` | 默认 `functional` |
| `status` | `draft`\|`active`\|`deprecated` | 默认 `draft`，生成的用例**保持 draft** |
| `tags` | 字符串数组 | 默认 `[]` |
| `maintainer` | 字符串或 null | 默认 null |
| `sourceRef` | 字符串或 null | 幂等键，项目内唯一（数据库上是 `(projectId, sourceRef)` 的部分唯一索引，只对非 null 生效） |

## sourceRef 约定

生成场景固定写成：

```
gen:<需求标识>#<用例名 slug>
```

- `<需求标识>` 与用户敲定（`PROJ-1234`、`prd/payment-v2.md`），**同一需求每次重跑必须一样**。
- `<用例名 slug>` 由用例名派生：小写、空白与标点换成 `-`；中文可直接保留。
  **不要用序号**——中间插一条会让后面全部错位，重跑就变成整批重复。
- 搬运存量用例走的是另一套（`<来源文件>#<行号/ID>`，见 testcase-migration），两者靠 `gen:` 前缀区分。

## onDuplicate

命中已存在的 `(projectId, sourceRef)` 时：

| 取值 | 行为 | 什么时候用 |
|---|---|---|
| `skip` | 保留已有用例，本条计入 `skipped` | 补漏、重跑、不确定时的默认选择 |
| `overwrite` | 走版本快照管线覆盖内容，可回滚；**只改内容，不会把用例移到别的 `moduleId`** | 需求改了，同一批用例重出一版 |
| `create-anyway` | 再建一条，且 `sourceRef` 被置成 null | 生成场景**不要用**：那条用例从此退出幂等体系，以后每次重跑都再复制一份 |

## 返回与部分失败

`import_test_cases` 的每行独立校验、独立执行，一行坏不影响其余：

```json
{
  "created": [{ "action": "created", "caseId": "…", "version": 1, "name": "…" }],
  "skipped": [{ "name": "…", "sourceRef": "…" }],
  "errors":  [{ "index": 3, "name": "…", "sourceRef": "…", "message": "入参校验失败：steps.0.id: …" }]
}
```

`errors[].index` 是**本批内的下标**（从 0 起），不是草案表行号——分批提交时别拿它去对总表。

## 错误对照

所有失败都被折成 **HTTP 200 + `isError: true` + 一段文本**，FORBIDDEN / NOT_FOUND /
BAD_REQUEST 在这条通道上长得一模一样。**判断依据只有文本本身**，而且每次调用都要看
`isError`——没有异常抛出不等于成功。

| 文本 | 含义 | 怎么办 |
|---|---|---|
| `你不是该项目的成员` | 这枚 token 的主人没有该项目的权限 | **停下来**。让用户去平台把自己加进项目成员。**不要换一个项目继续写** |
| `项目不存在` | projectId 错了，或项目被删了 | 重新 `list_projects` 取 id |
| `模块不存在` / `目标模块不存在或不属于该项目` | moduleId 不属于这个项目 | 重新 `ensure_module_path` |
| `父模块不存在或不属于同一项目` | 路径挂错了父节点 | 用 `get_module_tree` 核对层级 |
| `path 不能为空` | `ensure_module_path` 的 path 传了空数组 | 补上路径 |
| `入参校验失败：<字段>: …` | 某一行用例的字段不合法 | 只修 `index` 指的那一行，其余行已经写进去了，重提整批会走 `onDuplicate` |

## 连不上时

**一个 `testcase-platform:` 工具都看不见**是最常见的形态。鉴权发生在注册工具之前——
token 不通过时服务端返回 401，客户端拿不到工具列表，于是"401"和"服务端没起"表现完全一样。
按顺序排查，不要猜：

1. 确认 MCP server 已配置：Claude Code 里 `/mcp` 看列表，或看项目根的 `.mcp.json`。
2. 确认 `AS_TOKEN` 环境变量已设置且非空（在平台的设置页生成 API Token）。
3. **改了 `AS_TOKEN` 一定要重启客户端**：`.mcp.json` 里的 `${AS_TOKEN}` 是客户端**启动时**
   展开的，进程起来之后再 export 新值不会生效——这一条最容易在"我明明改了"里卡住。
4. 确认服务端地址可达（默认 `__MCP_URL__`），服务端起没起。

工具能看见但调用报错，走上面的错误对照表，不要回来重装。
TCP_SKILL_EOF_3
			;;
		'testcase-authoring/references/techniques.md')
		cat <<'TCP_SKILL_EOF_4'
# 测试设计方法：从需求信号到方法

这不是教程，是索引。**只读你这次用得上的那一两节。**
每节的结构固定：什么信号触发它 → 怎么产出 → 产出长什么样 → 这一步最容易出的错。

方法名与分节号取自 ISO/IEC/IEEE 29119-4（软件测试设计技术）。

| 信号 | 方法 | 本页锚点 |
|---|---|---|
| 输入有取值范围/格式约束 | 等价类划分 | [1](#1-等价类划分) |
| 范围有端点、长度上限、配额、分页 | 边界值分析 | [2](#2-边界值分析) |
| 「若 A 且 B 则…」、权限矩阵、计费规则 | 判定表 | [3](#3-判定表) |
| 有状态、有流程、「提交后不能改」 | 状态迁移 | [4](#4-状态迁移) |
| 多个互相独立的可选维度 | 成对组合 | [5](#5-成对组合pairwise) |
| 完整业务流程、用户故事 | 场景法 | [6](#6-场景法) |
| 前面都覆盖完了，还想补 | 错误推测 | [7](#7-错误推测) |

---

## 1. 等价类划分

**触发**：需求描述了某个输入「支持什么 / 不支持什么」——字段格式、枚举取值、文件类型、
角色种类、金额币种。

**做法**：对每个输入维度，把取值空间切成「同一类里任取一个，系统行为相同」的若干块，
有效类与无效类都要切。每块取一个代表值写一条用例。

**产出形状**（先列表再转用例，别跳过列表）：

| 输入 | 有效等价类 | 无效等价类 |
|---|---|---|
| 头像文件 | jpg、png | gif、超过 5MB、0 字节、非图片改扩展名 |
| 优惠券码 | 未使用且未过期 | 已使用、已过期、不存在、他人的 |

**常见错误**：
- 只切有效类。无效类才是缺陷密集区。
- 一条用例里塞多个无效输入（同时传空用户名和空密码）——挂了不知道是哪条规则生效，
  而且第一个校验拦下后第二个根本没执行。**每条无效用例只违反一条规则。**
- 把「不同取值」当成「不同等价类」：jpg 和 jpeg 通常是同一类，多写一条只是重复。

---

## 2. 边界值分析

**触发**：需求里出现数字范围、字符长度、日期区间、数量上限、分页大小、超时时长、
「最多」「至少」「不超过」。

**做法**：对每个边界取 2 个值（刚好在内 / 刚好在外）；对高风险边界（计费、配额、
权限、安全）取 3 个值（下界-1、下界、下界+1）。上下界都要做。

**产出形状**（长度 4–20 的用户名）：

| 值 | 预期 |
|---|---|
| 3 字符 | 拒绝，提示"用户名长度需为 4–20 个字符" |
| 4 字符 | 接受 |
| 20 字符 | 接受 |
| 21 字符 | 拒绝，同上提示 |

**常见错误**：
- 需求写「4–20 个字符」而没说含不含端点，**你不知道**——这正是闸门①要问用户的东西，
  不要自己认定含端点然后把它写死进预期。
- 只测上界不测下界；只测越界不测刚好合法（后者才验证边界没被写成 `<` 与 `<=` 之误）。
- 边界单位没定死："5MB" 是 5 000 000 还是 5 242 880 字节，写用例时要落到具体字节数。
- 空值 / null / 未填不是边界，是等价类里的无效类，另写。

---

## 3. 判定表

**触发**：需求出现「如果 A 且 B 则 X，否则 Y」、权限矩阵、折扣/费率规则、
多个开关共同决定结果。

**做法**：列出所有条件（每个取真/假或若干档），列出所有动作，穷举条件组合成列，
每列填该组合下的动作，删掉业务上不可能的列，**每保留一列写一条用例**。

**产出形状**：

| 条件 \ 规则 | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| 是会员 | 是 | 是 | 否 | 否 |
| 订单 ≥ 200 元 | 是 | 否 | 是 | 否 |
| **动作：折扣** | 8 折 | 9 折 | 9.5 折 | 无 |

**常见错误**：
- 条件超过 4 个还硬穷举：2^5 = 32 列，用例表会淹掉真正重要的规则。此时改用成对组合，
  或先按业务把条件分组。
- 只写"命中折扣"的规则列，把 R4（什么都不给）漏掉——没有动作也是一条要验证的规则。
- 组合列没写成可执行用例：判定表是中间产物，交付物是用例。

---

## 4. 状态迁移

**触发**：对象有状态字段（订单、工单、审批、任务、会话），需求里出现
「提交后不可修改」「只有待审核的才能撤回」「已取消不能再支付」。

**做法**：画状态 × 事件表，格子里填「迁到哪个状态」或「拒绝」。覆盖强度自下而上：
- **0-switch / all-transitions**：每条合法迁移各走一次（默认做到这一层）。
- **非法迁移**：每个「拒绝」格子也要一条用例——这类缺陷最常见（越权改单、重复支付）。
- **N-switch**：连续 N+1 步的迁移序列，只在流程本身是卖点时才做（成本指数上升）。

**产出形状**：

| 状态 \ 事件 | 提交 | 审批通过 | 撤回 |
|---|---|---|---|
| 草稿 | → 待审核 | 拒绝 | 拒绝 |
| 待审核 | 拒绝 | → 已通过 | → 草稿 |
| 已通过 | 拒绝 | 拒绝 | 拒绝 |

**常见错误**：
- 只测"幸福路径"那一串迁移，非法迁移一条不写。
- 用例的 `preconditions` 没把起始状态写成可造出来的形态（"订单处于待审核"要写清怎么到那儿：
  哪个账号、哪张单、走了什么操作）。
- 把状态迁移和场景法混做一锅：状态迁移一条用例只验证一次迁移。

---

## 5. 成对组合（pairwise）

**触发**：多个**互相独立**的可选维度共同作用——浏览器 × 操作系统 × 分辨率、
支付方式 × 币种 × 用户等级、开关型配置项。

**做法**：不穷举全组合，只保证**任意两个维度的每一对取值都至少出现在一条用例里**。
3 个维度各 3 取值：全组合 27 条，成对组合约 9–11 条。手工构造时：先按第一维展开，
再逐列填入尚未出现过的配对。

**必须一起记住的代价**（NIST SP 800-142 的原话是两段，只抄前半段会骗人）：
成对组合能用很少的用例发现大部分组合缺陷，**但可能漏掉 10%–40% 甚至更多缺陷，
不足以用于关键任务软件**。所以：支付、权限、数据一致性这类地方，成对组合是**起点**，
后面还要靠判定表把关键规则补全。

**常见错误**：
- 拿它去替代判定表：条件之间有业务约束（"未登录就不会有会员等级"）时，成对组合会生成
  不可能的组合，且会漏掉规则本身。
- 维度不独立却按独立处理。
- 生成完不标注：草案表里要写清哪几条是成对组合来的，评审时人才知道覆盖强度。

---

## 6. 场景法

对应 29119-4 的 scenario testing（§5.2.9）。

**触发**：需求以用户故事、流程图、"用户可以…然后…"的形式写成；要验证的是多个功能
串起来能不能走通，而不是单个字段的取值。

**做法**：先写主成功场景（一条），再从每个分支点派生备选场景与异常场景
（支付失败、库存不足、超时、中途退出后回来）。一条场景 = 一条用例，步骤数通常 5–12。

**常见错误**：
- 只写主流程。异常场景才是这类需求的缺陷所在。
- 把场景写成"点这里、再点那里"的操作录像，没有中间校验点——每一步的 `expected` 都要有。
- 用场景法替代字段级校验：字段规则用等价类/边界值另写，别塞进长流程里。

---

## 7. 错误推测

**触发**：前面几种方法都覆盖完了，还有余量；或者这个模块有历史故障。

**做法**：按经验清单扫一遍——空值 / 超长文本 / 特殊字符与 emoji / 前后空格 /
重复提交与双击 / 并发两个人改同一条 / 网络中断后重试 / 会话过期 / 时区与跨零点 /
浏览器后退键 / 复制粘贴带格式 / 权限降级后仍持有旧页面。

**常见错误**：把它当主力方法。它没有覆盖率可言，只能补漏；先做完前六种。
TCP_SKILL_EOF_4
			;;
		'testcase-authoring/references/worked-example.md')
		cat <<'TCP_SKILL_EOF_5'
# 走一遍完整流程

一段真实体量的需求，从拿到原文到写进平台。看的是**每一步该输出什么形状**，
不是把这些内容照抄。

## 输入

用户说：「PROJ-2087 优惠券这个需求，给支付模块补一批用例。」附了 `prd/coupon-v1.md`：

> 下单时可使用一张优惠券。满减券要求订单金额不低于门槛才可用；折扣券无门槛，
> 最高抵扣 100 元。券有有效期，过期不可用。券使用后不可退回。已取消的订单
> 释放其占用的券。同一订单只能用一张券。

## 第 1 步：收集输入

需求原文有了。`testcase-platform:list_projects` → 选中「电商主站」（`description`
里写着"用例统一挂到二级模块，标签用中文"）。需求标识与用户确认为 **PROJ-2087**。

## 第 2 步：读平台上下文

`testcase-platform:get_module_tree(projectId)` 的大纲：

```
- 支付 (id: 7c1…, 42 cases / 40 active)
  - 下单 (id: 9ab…, 18 cases / 18 active)
  - 优惠券 (id: 3fd…, 0 cases / 0 active) ← 零用例
  - 退款 (id: b20…, 24 cases / 22 active)
```

"优惠券"是空的，用例挂这儿；但**"下单"里那 18 条要读**——优惠券必然和下单流程交叉。

`testcase-platform:read_cases(projectId, moduleId: "9ab…", detail: "full")` 读回 10 条，
看出这个项目的写法：步骤 4–6 步，`expected` 都带提示文案原文，前置条件点名到账号。
其中已有一条《下单时不选优惠券直接支付成功》——**新批次里就不要再写"不使用优惠券"那条了**。

`testcase-platform:list_case_tags(projectId)` → `["下单","支付","优惠券","退款","风控","P0冒烟"]`，
"优惠券"这个标签已经存在，复用。

## 第 3 步：测试点 + 假设　🚧 闸门①

**测试点**（每条需求规则一行）：

1. 满减券：订单金额 ≥ 门槛可用，< 门槛不可用
2. 折扣券：无门槛，抵扣上限 100 元
3. 券有效期：未过期可用，过期不可用
4. 券使用后不可退回
5. 订单取消后释放占用的券
6. 一单只能用一张券

**需求没写清、必须定下来才能写用例的**（逐条问用户）：

1. 「不低于门槛」含不含等于？满 200 减 20 的券，订单**正好** 200 元能不能用？
2. 折扣券抵扣**超过** 100 元时是按 100 封顶，还是直接不可用？
3. 券"过期"的判定用哪个时刻——下单时刻还是支付时刻？跨零点下单怎么算？
4. 券不可用时，是在券列表里置灰并给原因，还是可以选中、在提交时报错？错误文案是什么？
5. 「已取消的订单释放券」——已过期的券被释放回来，是回到可用还是仍是过期态？

> 停在这里等用户回答。用户答：① 含等于；② 按 100 封顶；③ 支付时刻，跨零点按支付时刻算；
> ④ 置灰并显示"订单金额未满 200 元"；⑤ 释放回来仍按有效期判定，过期就还是不可用。

**这五个答案就是后面 `expected` 里那些具体文案和具体数字的来源。**没问就写，
写出来的一定是"提示不可用"这种不可判定的东西。

## 第 4 步：方法矩阵

| 测试点 | 方法 | 理由 |
|---|---|---|
| 1 满减门槛 | 边界值分析 | 199 / 200 / 201，答案①把等于归到可用 |
| 2 折扣上限 | 边界值分析 | 抵扣 99.99 / 100 / 100.01 |
| 3 有效期 | 边界值 + 等价类 | 到期前一分钟 / 到期时刻 / 到期后；跨零点单独一条 |
| 4 使用后不可退 | 状态迁移 | 券状态：未使用 → 已使用，「已使用 → 退回」是非法迁移 |
| 5 取消释放 | 状态迁移 + 场景法 | 已使用 → 未使用（合法），叠加过期判定 |
| 6 一单一券 | 判定表 | 已选券 × 再选另一张 |

## 第 5 步：草案表　🚧 闸门②

写完按 `case-quality.md` 末尾清单逐条打勾，再把表交给用户：

| # | 用例名 | 优先级 | 方法 | 与已有用例的关系 |
|---|---|---|---|---|
| 1 | 订单金额正好等于满减门槛时优惠券可用 | P0 | 边界值 | 新增 |
| 2 | 订单金额比满减门槛少 1 分时券置灰并提示未满门槛 | P0 | 边界值 | 新增 |
| 3 | 折扣券抵扣金额超过 100 元时按 100 元封顶 | P0 | 边界值 | 新增 |
| 4 | 券在支付时刻刚好过期时支付失败 | P1 | 边界值 | 新增 |
| 5 | 跨零点下单以支付时刻判定券有效期 | P1 | 边界值 | 新增 |
| 6 | 已使用的券在券列表中不可再次选择 | P1 | 状态迁移 | 新增 |
| 7 | 取消订单后未过期的券回到可用状态 | P1 | 状态迁移 | 新增 |
| 8 | 取消订单后已过期的券释放回来仍不可用 | P2 | 状态迁移 | 新增 |
| 9 | 已选一张券后再选另一张时替换而非叠加 | P1 | 判定表 | 新增 |
| ~~10~~ | ~~不使用优惠券直接下单成功~~ | — | — | **与《下单时不选优惠券直接支付成功》重叠，放弃** |

第 10 行就是第 2 步读正文的兑现：不读就会把它当成新用例写进去。

一条用例展开后的样子：

```json
{
  "moduleId": "3fd…",
  "name": "订单金额比满减门槛少 1 分时券置灰并提示未满门槛",
  "preconditions": "以账号 qa_buyer01 登录；账户下有一张「满 200 减 20」的满减券，有效期至 2026-12-31；购物车内商品合计 199.99 元",
  "priority": "P0",
  "caseType": "functional",
  "status": "draft",
  "tags": ["优惠券", "下单"],
  "sourceRef": "gen:PROJ-2087#订单金额比满减门槛少1分时券置灰并提示未满门槛",
  "steps": [
    { "id": "s1", "step": "进入结算页", "expected": "订单金额显示 199.99 元，「使用优惠券」入口可点击" },
    { "id": "s2", "step": "点击「使用优惠券」", "expected": "券列表中「满 200 减 20」一栏置灰不可选，其下方显示灰色文案「订单金额未满 200 元」" },
    { "id": "s3", "step": "点击该置灰券条目", "expected": "无选中反馈，弹层不关闭，页面底部应付金额仍为 199.99 元" },
    { "id": "s4", "step": "关闭弹层并提交订单", "expected": "下单成功，订单详情页优惠金额显示 0.00 元，实付 199.99 元" }
  ]
}
```

注意 `expected` 里全是可观察的具体物（金额、文案原文、控件状态），没有一处"显示正常"。

> 用户在这一步把第 8 条降到 P2、删掉第 5 条，说跨零点由另一个专项覆盖。改完再往下。

## 第 6 步：写入

```
testcase-platform:ensure_module_path(projectId, path: ["支付", "优惠券"])
  → { moduleId: "3fd…", createdModuleIds: [] }     // 已存在，没新建

testcase-platform:import_test_cases(
  projectId,
  onDuplicate: "skip",
  cases: [ …8 条，status 全是 draft… ]
)
  → { created: [8 条], skipped: [], errors: [] }
```

8 条一批发得完，不用分批。假如有 60 条，拆成 50 + 10 两批，第二批的
`errors[].index` 从 0 重新起算。

## 第 7 步：汇总交接

> 已写入「支付 / 优惠券」模块：新建 8 条，跳过 0 条，失败 0 条。
> sourceRef 前缀 `gen:PROJ-2087#`，全部为 **draft**。
> 请到平台里逐条评审——尤其是第 3 条的封顶金额取值和第 7、8 条的释放行为，
> 这两处是按你在假设确认里给的答案写的。确认无误后把状态改成 active。
> 需求若有改动，重跑时用 `onDuplicate: "overwrite"` 就地出新版本（可回滚）。
TCP_SKILL_EOF_5
			;;
		'testcase-migration/SKILL.md')
		cat <<'TCP_SKILL_EOF_6'
---
name: testcase-migration
description: 将**已经写好的存量测试用例**（Excel/CSV/XMind/TestRail 等导出件）解析、规范化后批量迁移进本平台，并产出可核对的迁移汇总表。触发场景：导入用例、迁移测试用例、批量导入用例、用例入库、把这个 Excel/XMind 导进去、import test cases、migrate test cases、bulk-load test cases。通过 testcase-platform MCP 工具（list_projects/create_project/get_module_tree/ensure_module_path/read_cases/list_case_tags/import_test_cases/search_cases）完成解析、映射确认、建模块、分批导入与抽查。输入是已有用例文件，不是需求——用户给的若是需求文档/PRD/接口定义/用户故事，要新**设计**用例而不是搬运既有用例，改用 testcase-authoring。
---

# 测试用例迁移 Skill

> **事实来源**：本文「工具契约」一节与 `apps/server/src/mcp/tools/` 的实现逐字对齐；实现变更时**必须回改本文档及 references/**。调用工具失败时按「前置条件」第 4 条分诊，**不要凭空模拟导入结果**——编一份汇总表出来，用户要到平台里才发现一条都没进去。

把用户提供的存量用例源文件解析、规范化后，经平台 MCP 工具批量导入，并产出可核对的迁移汇总表。

**这个 skill 只搬运，不设计。**判据看输入的形状：手里是**已经写好的用例**（Excel/CSV/XMind/TestRail 导出件，每行/每个节点就是一条用例）→ 用本 skill；手里是**需求**（PRD、接口文档、用户故事、一段功能描述）→ 那要新设计用例，用 `testcase-authoring` skill。两者共用同一条写入通道（`testcase-platform:import_test_cases`）与同一套字段，区别在前半段：搬运做的是**字段映射**，设计做的是**从需求推导测试点**。源文件里只有用例标题没有步骤、用户又要求顺手补全步骤时，那一半已经是设计：切到 testcase-authoring 走它的两道闸门，不要在映射流程里顺手编步骤。

## 前置条件

1. 平台服务在运行：`apps/server` 监听 `http://localhost:3000`（通常 `pnpm dev`）
2. 仓库根 `.mcp.json` 已指向 `__MCP_URL__`（本仓库已内置该配置）
3. **环境变量 `AS_TOKEN` 已设置**为一枚平台 API token（`as_` 开头，在平台里生成）。
   `/mcp` 要求 `Authorization: Bearer <token>`，**MCP 的身份与权限就是这枚 token
   所属用户的身份与权限**：导入只能落进该用户所属的项目，`testcase-platform:list_projects` 也只
   列得出这些项目。没带或 token 无效时服务端返回 401，不存在任何默认身份。
4. MCP 工具可用（`testcase-platform:list_projects` 能正常返回）；不可用时先解决连接问题再开始迁移。
   两类失败的区分方式（**注意不是靠 HTTP 状态码**）：
   - **401**：token 缺失或失效。鉴权发生在建 MCP server 之前，所以这时**一个工具
     都不会被注册**，连 `tools/list` 都是空的——表现是「根本没有平台工具可用」。
   - **权限不足**（token 主人不是该项目成员）：**不会**返回 403。服务端把
     FORBIDDEN / NOT_FOUND / BAD_REQUEST 统一包成 `isError: true` 的文本结果，
     HTTP 状态码仍是 200（见 `apps/server/src/mcp/tools/tool-helpers.ts` 的
     `safeToolCall`）。表现是工具能调用，但返回 `Error: <原因>`。
     正解是去找项目 owner 把 token 主人加进项目成员，不要换成别的项目继续导。

## 工具契约（与实现对齐）

八个工具都返回 JSON 文本内容块；调用失败（如项目不存在）返回 `isError: true` 的文本结果，不会中断会话。

| 工具 | 入参 | 返回 |
|---|---|---|
| `testcase-platform:list_projects` | 无 | `[{ id, name, description, createdAt, updatedAt }]` |
| `testcase-platform:create_project` | `name`(必填)、`description`(可选) | 新建项目对象（含 `id`） |
| `testcase-platform:get_module_tree` | `projectId` | **两个文本块**：① 缩进大纲（`- 名称 (id: …, 3 cases / 2 active)`，零用例/无 active 的模块带 `←` 标记）② 扁平 JSON `[{ id, name, parentId, depth, caseCount, activeCaseCount, gap }]`。**计数含子孙模块**（用例一般挂在叶子上，中间层是文件夹）；`gap` 取 `"empty"`/`"no-active"`/`null`。迁移时用它判断目标模块是不是已经有一批同源用例 |
| `testcase-platform:ensure_module_path` | `projectId`、`path`(字符串数组，1–10 段) | `{ moduleId, createdModuleIds }`——`moduleId` 是最深一级模块 id（用作用例的 `moduleId`）；`createdModuleIds` 只含本次真正新建的层级，幂等重跑为 `[]` |
| `testcase-platform:import_test_cases` | `projectId`、`onDuplicate`(**必填**)、`cases`(1–50 条；**逐条校验，非法行不影响整批**) | `{ created[], skipped[], errors[] }`，详见下 |
| `testcase-platform:read_cases` | `projectId`，可选 `moduleId`/`includeDescendants`/`keyword`/`status`/`priority[]`/`tags[]`/`sourceRefPrefix`/`detail`/`page`/`pageSize` | `{ detail, items[], page, pageSize, total }`。`detail: "full"` 才带 `preconditions`/`steps`，**每页默认 10 条、最多 20 条**。迁移时的用途只有一个：**导前**核对目标模块里是不是已经有内容相同、只是 sourceRef 对不上的用例（换过一次 sourceRef 规则就会这样，幂等键失灵，重跑会整批重复入库）|
| `testcase-platform:list_case_tags` | `projectId` | 项目已用标签的去重排序数组。源文件里的标签先跟它对一遍，同义标签（`登录`/`用户登录`/`auth`）并存会稀释平台的标签过滤 |
| `testcase-platform:search_cases` | `projectId`、`keyword`(必填)、`limit`(可选，默认 20，上限 50) | `[{ id, name, moduleId, priority, status, caseType, sourceRef, updatedAt }]`，按 `updatedAt` 倒序；`%`/`_` 按字面量转义 |

### `testcase-platform:import_test_cases` 返回结构

```jsonc
{
  "created": [ { "index": 0, "caseId": "…", "name": "…", "sourceRef": "…",
                 "action": "created" | "overwritten", "version": 1,
                 "warning": "…"?              // 仅 create-anyway 命中重复时出现
               } ],
  "skipped": [ { "index": 1, "name": "…", "sourceRef": "…",
                 "existingCaseId": "…", "reason": "…" } ],
  "errors":  [ { "index": 2, "name": "…", "sourceRef": "…", "message": "…" } ]
}
```

- **`index` 是该批次内 0 起的下标**，不是源文件行号。汇总时必须自己维护「批次内下标 → 源行号/节点路径」的映射
- `errors[]` 同时收纳**字段校验失败**与**执行失败**两类行，按 `index` 升序；`created`/`skipped`/`errors` 三者的 `index` 合起来正好覆盖本批全部下标
- `overwritten` 的 `version` 是覆盖后的新版本号（走版本快照管道，历史保留）

### `onDuplicate` 三种策略的准确语义

去重键是 `(projectId, sourceRef)`（数据库部分唯一索引）。

| 策略 | sourceRef 已存在时 | 效果 |
|---|---|---|
| `skip` | 不动已有用例 | 计入 `skipped`，带 `existingCaseId` |
| `overwrite` | 走版本快照管道更新已有用例 | 计入 `created`，`action: "overwritten"`，`version` 自增。**注意：只覆盖内容字段（name/priority/caseType/status/preconditions/steps/tags/maintainer），不会把用例移动到新的 `moduleId`**——源数据换了模块时需人工处理 |
| `create-anyway` | 新建一条用例，但**其 `sourceRef` 会被置为 `null`**（唯一索引不允许重复） | 计入 `created` 并带 `warning`；该条此后无法再参与幂等去重，重跑会再次重复创建 |

**无 `sourceRef` 的行**：回退为「目标模块内同名匹配」——
- `skip` / `overwrite` 策略下，模块内已有同名用例 → 计入 `skipped`，`reason` 明示「该行无法幂等去重」的警告
- `create-anyway` 策略下照常新建（会产生重复）

这正是 SKILL 要求**每条都必须设 sourceRef** 的原因。

## 工作流

按顺序执行，**第 2 步必须获得用户确认后才能写入任何数据**。

### 1. 解析源文件

- 识别格式：Excel/CSV 平铺表、XMind 层级、TestRail 导出等
- 用 [references/source-formats.md](references/source-formats.md) 的同义词表识别列含义；读取全部数据行，统计总数
- 记录每条记录的源定位（行号/节点路径/源 ID），后续用于 sourceRef 与失败报告

### 2. 汇报字段映射方案，等用户确认

向用户输出并确认：

- 列 → 平台字段的映射表（含忽略了哪些列）
- 枚举规范化方案（优先级/类型/状态的取值映射，见下方规范化规则）
- 模块路径推导方式（模块列拆分规则或 XMind 层级判定）
- sourceRef 生成规则、目标项目（新建还是复用）、onDuplicate 策略建议
  - 首次迁移/重跑补漏 → `skip`（默认推荐）
  - 用户明确要求源数据覆盖平台已有数据 → `overwrite`
  - `create-anyway` 仅在用户明确知晓会产生重复时使用

用户确认后再继续；对有歧义的列（如「高」是否映射 P0）逐条问清。

### 3. 选定项目

- `testcase-platform:list_projects` → 展示已有项目，**优先引导复用**已有项目
- 确无匹配且用户同意时才 `testcase-platform:create_project`

### 4. 获取模块树并推导模块路径

- `testcase-platform:get_module_tree` 查看现状，规划源模块如何挂接（避免与已有模块重名歧义；同名即复用）
- 为每条用例算出模块路径数组（如 `["订单", "支付", "退款"]`）

### 5. 规范化用例

按下方「规范化规则」把每条源记录转成平台字段（字段/枚举定义见 [references/case-schema.md](references/case-schema.md)）。

### 6. 建模块 + 分批导入

- 对每个**去重后的**模块路径调用 `testcase-platform:ensure_module_path`，缓存 `路径 → moduleId`
- `testcase-platform:import_test_cases` 分批提交，**每批 ≤50 条**，带确认过的 `onDuplicate` 策略
- 每批记录返回的 created/skipped/errors（错误不中断，见「部分失败处理」）

### 7. 抽查

- `testcase-platform:search_cases` 抽查 2-3 个关键字（覆盖不同模块/优先级），核对名称、模块、优先级是否对得上。
- **核对步骤正文必须用 `testcase-platform:read_cases(..., detail: "full")`**：`search_cases` 不返回 `steps`/`preconditions`，拿它去验「步骤是否正确入库」是验不了的——步骤拆分（编号配对、预期整体挂尾）是这套流程里最容易错的一环，至少抽 1-2 条读正文确认。

### 8. 输出迁移汇总表

```
迁移汇总：源文件 xxx.xlsx，共 120 条
- 成功创建：110
- 跳过（sourceRef 已存在）：7
- 失败：3
  | 源行号 | 用例名称 | sourceRef | 失败原因 |
  |---|---|---|---|
  | 15 | ... | xxx.xlsx#row:15 | name is required |
新建模块：登录/账号密码登录、订单/退款（共 N 个）
抽查结果：3/3 通过
```

失败行必须能定位回源文件（行号/节点路径）。

## 规范化规则

完整映射示例见 [references/mapping-examples.md](references/mapping-examples.md)。

### 优先级映射（目标枚举：P0/P1/P2/P3，默认 P2）

| 目标 | 源值 |
|---|---|
| P0 | P0、冒烟、Blocker、Critical、最高、致命；「高/High」且为源体系最高档并经用户确认时 |
| P1 | P1、高、High、Major、重要（源体系存在更高档 Critical 时的「高」） |
| P2 | P2、中、Medium、Normal、一般；**无法识别时的默认值** |
| P3 | P3、低、Low、Minor、Trivial、次要 |

原则：源体系同时有 Critical 与 High → Critical→P0、High→P1；「高」已是最高档 → 默认 P1，映射确认时明示并允许用户改为 P0。

### 平铺表格的模块列拆分

- 单列路径：按 `/`、`>`、`-`、`\`、`::` 等分隔符拆成路径数组（分隔符在映射确认时明示）
- 多列（一级模块/二级模块/…）：按列序拼路径，空列截断
- 无模块列：与用户商定统一挂接路径（如按文件名/sheet 名建一级模块）

### XMind 层级 → 模块/用例 的启发式

- 叶子的祖先链 = 模块路径；根节点默认作为一级模块（映射确认时给出「根=项目、跳过根」备选方案）
- 用例节点判定（满足其一）：带优先级标记（`[P0]` 或优先级图标）；子节点形如「前置/步骤/预期」；无子节点且父层已明确是模块层
- 用例节点的子节点解析为 preconditions/steps，不再下钻建模块
- 无用例特征的中间/叶子节点 → 只建模块（保留空模块结构）

### 步骤文本拆分为 steps

目标结构：`steps: [{ "id": "<uuid>", "step": "...", "expected": "..." }]`，**每步 id 必须唯一（生成 uuid）**。

- 步骤列与预期列都有编号（`1.`/`1、`/`Step 1`）：按编号一一配对；预期缺号的步骤 `expected: ""`
- 预期为整体一段（无编号）：挂到最后一步的 expected，其余步为空——在映射确认时明示该策略
- 单元格内多行无编号：每行一个 step
- 无步骤只有预期：生成一步 `{ step: "执行用例", expected: <整体预期> }`（确认时明示）

### sourceRef（必设，幂等重跑安全）

- **每条导入用例必须设置 sourceRef**，同一项目内唯一、对同一源可复现：
  - 源自带稳定 ID → `<来源>#<ID>`（如 `testrail#C1234`）
  - Excel/CSV → `<文件名>#<sheet名>!row:<行号>`（单 sheet 可省 sheet 名）
  - XMind → `<文件名>#<根到用例的节点路径>`（能取到稳定节点 id 则用 id）
- 平台按 `(projectId, sourceRef)` 部分唯一索引去重；不设 sourceRef 的行无法去重，重跑会重复入库

## 部分失败处理

> ⚠️ **两类失败要分清**：
> 1. **批量层面失败（整批拒绝）**——只有**批参数本身**不合法才会整批拒绝：`projectId` 不是 uuid、`onDuplicate` 不在三种取值内、`cases` 不是数组 / 为空 / >50 条。此时返回 `BAD_REQUEST: Input validation failed`，一条都不入库。
> 2. **逐条失败（不中断）**——**单行不满足 schema**（`name` 为空、`moduleId` 不是 uuid 或缺失、`priority` 不在枚举内、`steps[].id` 为空等）与**单行执行失败**（`moduleId` 不存在或不属于该项目、数据库约束冲突）都只影响该行，计入 `errors[]`，其余行照常创建。校验失败的 `message` 形如 `入参校验失败：name: Too small: expected string to have >=1 characters`，能看出是哪个字段不合法。

- 脏数据可以直接提交：非法行会带 `index` 与字段级原因落到 `errors[]`，不必在规范化阶段先剔除（但仍建议尽量规范化，减少返工）
- 单条失败**不中断**整体迁移，收集 `errors` 继续后续批次
- 全部批次完成后统一汇总，失败条目按「批次内 index」反查源行号/节点路径与原因
- 重跑安全：修复源数据后用同一 sourceRef 规则、`onDuplicate: skip` 整文件重跑——已成功的条目被 skip，只补导失败/新增的行
- 若某批整体调用失败（网络/服务不可用），记录批范围，服务恢复后仅重跑该批即可（同样靠 sourceRef 兜底）

## 参考文档

- [references/case-schema.md](references/case-schema.md)——平台用例字段、枚举、默认值、sourceRef 约束（事实来源：`packages/db/src/schema/`）
- [references/mapping-examples.md](references/mapping-examples.md)——Excel/XMind/TestRail 三个完整映射示例
- [references/source-formats.md](references/source-formats.md)——中英列名同义词表与枚举取值映射
TCP_SKILL_EOF_6
			;;
		'testcase-migration/references/case-schema.md')
		cat <<'TCP_SKILL_EOF_7'
# 平台用例字段规范（case-schema）

> 事实来源：`packages/db/src/schema/test-cases.ts`、`modules.ts`、`projects.ts`。
> 本文描述导入时（`testcase-platform:import_test_cases`）每条用例可提供的字段、枚举值与默认值。
> 服务端生成的字段（id、currentVersion、createdAt、updatedAt 等）不需要也不应由导入方提供。

## 用例（test_cases）字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `name` | string | ✅ | — | 用例名称/标题 |
| `moduleId` | uuid | ✅（由 testcase-platform:ensure_module_path 获得） | — | 所属模块。导入前必须先通过 `testcase-platform:ensure_module_path` 拿到模块 id |
| `projectId` | uuid | ✅（工具调用**顶层**参数，不写在每条用例里） | — | 所属项目。服务端校验 `moduleId` 必须属于该 projectId，否则该条计入 `errors`（`moduleId 不存在或不属于该项目`） |
| `priority` | enum | ❌ | `"P2"` | 见下方枚举 |
| `caseType` | enum | ❌ | `"functional"` | 见下方枚举 |
| `status` | enum | ❌ | `"draft"` | 见下方枚举。迁移导入建议保持默认 `draft`，除非源数据明确标记已评审 |
| `preconditions` | string \| null | ❌ | `null` | 前置条件，纯文本（可多行） |
| `steps` | `CaseStep[]` (jsonb) | ❌ | `[]` | 步骤数组，结构见下 |
| `tags` | `string[]` (jsonb) | ❌ | `[]` | 标签数组 |
| `maintainer` | string \| null | ❌ | `null` | 维护人（自由文本，平台无登录） |
| `sourceRef` | string \| null | 迁移场景**必设** | `null` | 源数据唯一标识，幂等去重键，见下 |
| ~~`sortOrder`~~ | int | — | — | **`testcase-platform:import_test_cases` 不接受该字段**（多余字段会被静默忽略）；新用例由服务端追加到模块末尾 |

服务端管理、导入方**不要提供**：`id`、`currentVersion`（默认 1，乐观锁）、`lastModifiedBy`、`createdAt`、`updatedAt`。

> 字段校验是**逐条**进行的：某条用例不满足上表约束（`name` 为空、`moduleId` 缺失或非 uuid、枚举值非法、`steps[].id` 为空等）只会让**该条**落入 `errors[]`（带批次内 `index` 与指明字段的 `message`），同批其余用例照常入库。

## 枚举值（与 pgEnum 逐字一致）

- **priority**（`case_priority`）：`P0` | `P1` | `P2` | `P3` —— 默认 `P2`
- **caseType**（`case_type`）：`functional` | `interface` | `performance` | `security` | `compatibility` | `other` —— 默认 `functional`
- **status**（`case_status`）：`draft` | `active` | `deprecated` —— 默认 `draft`

任何其他写法（如 `p0`、`High`、`功能`）都必须先规范化为上述枚举值，规范化规则见 SKILL.md 与 `source-formats.md`。

## steps 结构（CaseStep）

```json
[
  { "id": "<唯一字符串，如 uuid>", "step": "操作描述", "expected": "预期结果" }
]
```

- `id`：每个步骤的唯一字符串 id（生成 uuid 即可），前端按 id 做版本 diff 配对，**不能省略、不能重复**
- `step`：该步的操作/动作描述
- `expected`：该步的预期结果；源数据只有整体预期时，放在最后一步的 `expected`，或拆分对齐（见 SKILL.md 步骤拆分规则）

## sourceRef 与幂等去重

- 数据库有部分唯一索引：`UNIQUE (projectId, sourceRef) WHERE source_ref IS NOT NULL`
- 即：同一项目内 `sourceRef` 不可重复；`sourceRef` 为 null 的行不受约束（也就**无法去重**）
- `testcase-platform:import_test_cases` 依赖它实现 `onDuplicate: skip | overwrite | create-anyway` 策略（三者的准确语义见 SKILL.md）
- ⚠️ `create-anyway` 命中已存在的 sourceRef 时，新建的用例**其 sourceRef 会被服务端置为 `null`**（唯一索引不允许重复），返回项带 `warning`
- ⚠️ 无 sourceRef 的行退化为「目标模块内同名匹配」：`skip`/`overwrite` 下同名即跳过并给出警告，`create-anyway` 下直接重复创建
- **迁移导入必须为每条用例设置稳定、可复现的 sourceRef**，推荐格式：
  - Excel：`<文件名>#row:<行号>`（如 `login-cases.xlsx#row:12`）
  - XMind：`<文件名>#<稳定节点路径或节点 id>`
  - TestRail：`testrail#C<case id>`（如 `testrail#C1234`）
- 同一份源重跑：`skip` 策略下已导入的全部 skipped，天然幂等
- **`gen:` 是另一套命名空间**：从需求新设计的用例（testcase-authoring skill）用 `gen:<需求标识>#<用例名 slug>`。迁移搬运的用例**不要用 `gen:` 开头**——平台的 `sourceRefPrefix` 过滤靠这个前缀区分「搬进来的存量」与「这轮生成的」，混用会让 `read_cases(sourceRefPrefix: "gen:PROJ-1234#")` 捞出一堆不相干的行。
- **不要中途改 sourceRef 规则**：同一份源换了规则再重跑，旧行的键对不上，`skip` 认不出来，整批会重复入库。规则改了就得先用 `testcase-platform:read_cases(detail: "full")` 核对目标模块里已有什么。

## 模块（modules）与项目（projects）

- `projects`：`id`(uuid)、`name`(必填)、`description`(可空)
- `modules`：`id`(uuid)、`projectId`(必填 FK)、`parentId`(可空自引用，null=根节点)、`name`(必填)、`sortOrder`(int, 默认 0)
- 模块树无限层级；迁移时用 `testcase-platform:ensure_module_path` 按名称路径（如 `["订单", "支付", "退款"]`）逐级找/建，幂等
- `testcase-platform:ensure_module_path` 的 `path` 单次调用**最多 10 段**（更深的层级分多次调用逐段下钻）；同级按 `name` 精确匹配复用，匹配不到才新建并追加到同级末尾
- 返回 `{ moduleId, createdModuleIds }`：`createdModuleIds` 只含本次新建的层级，可直接用于汇总表的「新建模块」一行

## 版本快照（case_versions，仅供了解）

每次用例创建/修改，服务端自动写入全量快照（version 自增）。导入创建的用例同样产生 v1 快照；`onDuplicate: overwrite` 覆盖已有用例时同样走快照管道，产生 v2/v3…（历史不可变），返回项的 `version` 即覆盖后的新版本号。导入方无需任何操作。

经 MCP 通道写入的记录，`savedBy` / `lastModifiedBy` 统一记为 `MCP 迁移`。
TCP_SKILL_EOF_7
			;;
		'testcase-migration/references/mapping-examples.md')
		cat <<'TCP_SKILL_EOF_8'
# 迁移映射示例（mapping-examples）

三个端到端示例：源片段 → 字段映射 → MCP 工具调用序列 → 结果。工具入参/返回的权威契约见 SKILL.md「工具契约（与实现对齐）」一节；下文示例中的返回值为节选示意（`created`/`skipped`/`errors` 实际都是**数组**，此处只写条数）。

---

## 示例 1：Excel 平铺表

### 源片段（`登录模块用例.xlsx`，sheet「登录」）

| 行号 | 模块 | 用例名称 | 前置条件 | 步骤 | 预期结果 | 优先级 | 维护人 |
|---|---|---|---|---|---|---|---|
| 2 | 登录/账号密码登录 | 正确账号密码登录成功 | 已注册账号 test01 | 1. 打开登录页\n2. 输入正确账号密码\n3. 点击登录 | 1. 页面正常展示\n2. 无报错提示\n3. 跳转首页并展示昵称 | 高 | 张三 |
| 3 | 登录/账号密码登录 | 密码错误提示 | 已注册账号 test01 | 1. 打开登录页\n2. 输入正确账号+错误密码\n3. 点击登录 | 3. 提示「账号或密码错误」 | 中 | 张三 |

### 映射方案（向用户确认后执行）

- 模块列 `登录/账号密码登录` → 按 `/` 拆分为路径 `["登录", "账号密码登录"]`
- 步骤/预期按编号 `1.`/`2.`/`3.` 对齐拆分；预期缺号的步骤 expected 置空字符串
- 优先级：高→P1、中→P2（本表无「致命/最高」档，「高」即最高档，已与用户确认取 P1）
- sourceRef = `登录模块用例.xlsx#登录!row:<行号>`（多 sheet 时带 sheet 名）

### 工具调用序列

```
1. testcase-platform:list_projects                          → 用户选择复用项目「商城平台」(projectId: pj-uuid)
2. testcase-platform:get_module_tree { projectId }          → 树中尚无「登录」分支
3. testcase-platform:ensure_module_path { projectId, path: ["登录", "账号密码登录"] }
                                          → { moduleId: md-uuid }（缺失层级已创建）
4. testcase-platform:import_test_cases {
     projectId,
     onDuplicate: "skip",
     cases: [
       {
         moduleId: "md-uuid",
         name: "正确账号密码登录成功",
         preconditions: "已注册账号 test01",
         priority: "P1",
         maintainer: "张三",
         sourceRef: "登录模块用例.xlsx#登录!row:2",
         steps: [
           { "id": "<uuid>", "step": "打开登录页", "expected": "页面正常展示" },
           { "id": "<uuid>", "step": "输入正确账号密码", "expected": "无报错提示" },
           { "id": "<uuid>", "step": "点击登录", "expected": "跳转首页并展示昵称" }
         ]
       },
       {
         moduleId: "md-uuid",
         name: "密码错误提示",
         preconditions: "已注册账号 test01",
         priority: "P2",
         maintainer: "张三",
         sourceRef: "登录模块用例.xlsx#登录!row:3",
         steps: [
           { "id": "<uuid>", "step": "打开登录页", "expected": "" },
           { "id": "<uuid>", "step": "输入正确账号+错误密码", "expected": "" },
           { "id": "<uuid>", "step": "点击登录", "expected": "提示「账号或密码错误」" }
         ]
       }
     ]
   }                                       → created 2 条（action: "created", version: 1）、skipped 0、errors 0
5. testcase-platform:search_cases { projectId, keyword: "密码错误" }   → 抽查命中，字段正确
```

### 重跑（幂等验证）

同一文件再次导入、`onDuplicate: "skip"` → created 0、**skipped 2**（每条带 `existingCaseId`）、errors 0。

---

## 示例 2：XMind 层级脑图

### 源结构（`购物车.xmind`）

```
购物车（根）
├── 加购
│   ├── 商品详情页加购
│   │   ├── [P0] 普通商品加购成功
│   │   └── [P2] 库存不足时加购
│   └── 列表页快捷加购
└── 结算
    └── [P1] 勾选多商品合并结算
        ├── 前置：购物车已有3件商品
        ├── 步骤1：全选商品 → 底部合计金额正确
        └── 步骤2：点击结算 → 跳转订单确认页
```

### 启发式映射（向用户确认后执行）

- 叶子前的祖先链 = 模块路径；根节点「购物车」作为一级模块（若用户希望根=项目名则跳过根，确认时给出两种方案）
- 判定「用例节点」：带优先级标记（`[P0]`/优先级图标）、或其子节点形如 前置/步骤/预期 → 该节点是用例，其下子节点解析为 preconditions/steps
- 「列表页快捷加购」无子用例且无用例特征 → 只建模块（空模块也建，保留结构）
- 步骤节点 `步骤N：<step> → <expected>` 按 `→`（或「预期：」子节点）拆 step/expected
- sourceRef = `购物车.xmind#<根到该用例的节点路径>`（如 `购物车.xmind#购物车/加购/商品详情页加购/普通商品加购成功`）；XMind 文件内若可取到稳定节点 id 则优先用 id

### 工具调用序列（要点）

```
1. testcase-platform:list_projects → 复用或 testcase-platform:create_project { name: "商城平台" }
2. testcase-platform:get_module_tree { projectId }
3. testcase-platform:ensure_module_path { projectId, path: ["购物车", "加购", "商品详情页加购"] } → md-1
   testcase-platform:ensure_module_path { projectId, path: ["购物车", "加购", "列表页快捷加购"] } → md-2（仅建模块）
   testcase-platform:ensure_module_path { projectId, path: ["购物车", "结算"] } → md-3
4. testcase-platform:import_test_cases { projectId, onDuplicate: "skip", cases: [
     { moduleId: md-1, name: "普通商品加购成功", priority: "P0",
       sourceRef: "购物车.xmind#购物车/加购/商品详情页加购/普通商品加购成功", steps: [...] },
     { moduleId: md-1, name: "库存不足时加购", priority: "P2", sourceRef: "...", steps: [...] },
     { moduleId: md-3, name: "勾选多商品合并结算", priority: "P1",
       preconditions: "购物车已有3件商品",
       sourceRef: "购物车.xmind#购物车/结算/勾选多商品合并结算",
       steps: [
         { "id": "<uuid>", "step": "全选商品", "expected": "底部合计金额正确" },
         { "id": "<uuid>", "step": "点击结算", "expected": "跳转订单确认页" }
       ] }
   ] } → created 3 条、skipped 0、errors 0
5. testcase-platform:search_cases { projectId, keyword: "结算" } 抽查
```

---

## 示例 3：TestRail CSV 导出

### 源片段（`testrail-export.csv`）

```csv
ID,Title,Section,Priority,Type,Preconditions,Steps,Expected Result
C101,"Verify login with valid credentials","Auth > Login",Critical,Functional,"User test01 exists","1. Open login page
2. Enter valid credentials
3. Click Login","User lands on dashboard"
C102,"API returns 401 for expired token","Auth > Token",High,API,"Token expired","1. Call /api/me with expired token","Response is 401 with error body"
```

### 映射方案（向用户确认后执行）

- `Section` 按 ` > ` 拆模块路径：`["Auth", "Login"]`、`["Auth", "Token"]`
- Priority：源体系同时存在 Critical 与 High → Critical→P0、High→P1（TestRail 数值 priority_id 见 source-formats.md）
- Type：Functional→functional、API→interface
- `Steps` 多行整体拆步骤；`Expected Result` 为整体预期（未按步编号）→ 挂到最后一步的 expected，其余步 expected 为空（方案在确认环节明示）
- sourceRef = `testrail#<ID>`（源自带稳定 ID，优先于行号）

### 工具调用序列（要点）

```
1. testcase-platform:list_projects → 选定 projectId
2. testcase-platform:get_module_tree { projectId }
3. testcase-platform:ensure_module_path { projectId, path: ["Auth", "Login"] } → md-a
   testcase-platform:ensure_module_path { projectId, path: ["Auth", "Token"] } → md-b
4. testcase-platform:import_test_cases { projectId, onDuplicate: "skip", cases: [
     { moduleId: md-a, name: "Verify login with valid credentials",
       priority: "P0", caseType: "functional",
       preconditions: "User test01 exists", sourceRef: "testrail#C101",
       steps: [
         { "id": "<uuid>", "step": "Open login page", "expected": "" },
         { "id": "<uuid>", "step": "Enter valid credentials", "expected": "" },
         { "id": "<uuid>", "step": "Click Login", "expected": "User lands on dashboard" }
       ] },
     { moduleId: md-b, name: "API returns 401 for expired token",
       priority: "P1", caseType: "interface",
       preconditions: "Token expired", sourceRef: "testrail#C102",
       steps: [
         { "id": "<uuid>", "step": "Call /api/me with expired token",
           "expected": "Response is 401 with error body" }
       ] }
   ] } → created 2 条、skipped 0、errors 0
5. testcase-platform:search_cases { projectId, keyword: "401" } 抽查
```

### 部分失败示例

**先分清两类失败（详见 SKILL.md「部分失败处理」）：**

- **整批拒绝只发生在批参数层面**：`projectId` 非 uuid、`onDuplicate` 取值非法、`cases` 为空或 >50 条 → `BAD_REQUEST: Input validation failed`，一条都不入库。
- **单行不满足 schema 只影响该行**：如某行缺 Title（`name` 为空），该行落入 `errors[]`，其余行照常入库，`message` 会指出违规字段。
- 执行阶段的逐条失败同样只影响该行，例如 `moduleId` 不属于该 projectId：

```jsonc
{
  "created": [ /* 41 条 */ ],
  "skipped": [ /* 7 条 */ ],
  "errors":  [ { "index": 12, "name": "…", "sourceRef": "testrail#C214",
                 "message": "moduleId 不存在或不属于该项目" },
               { "index": 30, "name": "", "sourceRef": "testrail#C233",
                 "message": "入参校验失败：name: Too small: expected string to have >=1 characters" } ]
}
```

`index` 是**该批次内的 0 起下标**，不是 CSV 行号——按自己维护的「批次内下标 → 源 ID/行号」映射反查后再报给用户。修复源数据后用同一 sourceRef 规则、`onDuplicate: "skip"` 重跑，已成功的 41 条被 skip，只补导修复的行。
TCP_SKILL_EOF_8
			;;
		'testcase-migration/references/source-formats.md')
		cat <<'TCP_SKILL_EOF_9'
# 源文件列名同义词表（source-formats）

解析源文件（Excel/CSV/TestRail 导出等）时，用本表把中英文列名映射到平台字段。匹配时忽略大小写、空格与全半角差异；同一字段命中多列时向用户确认。

## 列名 → 平台字段

| 平台字段 | 常见中文列名 | 常见英文列名 |
|---|---|---|
| `name` | 用例名称、用例标题、标题、名称、用例名、测试点、检查点、案例名称 | Title、Name、Case Name、Test Case、Summary、Test Point |
| `preconditions` | 前置条件、前提条件、预置条件、前提、准备条件 | Precondition、Preconditions、Prerequisite、Setup |
| `steps`（step 部分） | 步骤、操作步骤、测试步骤、执行步骤、步骤描述 | Steps、Test Steps、Step Description、Procedure、Action |
| `steps`（expected 部分） | 预期、预期结果、期望结果、预期输出、验证点 | Expected、Expected Result(s)、Expected Outcome、Verification |
| `priority` | 优先级、用例等级、等级、级别、重要性 | Priority、Severity、Importance、Level |
| `caseType` | 用例类型、类型、测试类型、测试分类 | Type、Case Type、Test Type、Category |
| `status` | 状态、用例状态、评审状态 | Status、State、Review Status |
| `moduleId`（经模块路径） | 模块、所属模块、功能模块、子模块、一级模块/二级模块…、目录、分组 | Module、Section、Suite、Component、Feature、Folder、Group |
| `tags` | 标签、标记、关键词 | Tags、Labels、Keywords |
| `maintainer` | 维护人、负责人、作者、创建人、编写人、owner | Maintainer、Owner、Author、Created By、Assignee |
| `sourceRef`（若源自带 id） | 用例编号、编号、用例ID、序号 | ID、Case ID、Test Case ID、External ID |

注意：
- 源自带的「编号/ID」列优先用于构造 `sourceRef`（加上来源前缀保证项目内唯一，如 `testrail#C1234`）；没有时退回 `<文件名>#row:<行号>`。
- 「序号」若只是表内行号而非稳定业务编号，不要单独作为 sourceRef，仍用 `文件名#row:行号` 形式。
- 模块列可能是单列路径（`订单/支付/退款` 或 `订单>支付`），也可能拆成「一级模块/二级模块/三级模块」多列——都要拼成路径数组交给 `testcase-platform:ensure_module_path`。

## 优先级取值 → 平台枚举

| 平台值 | 常见源值 |
|---|---|
| `P0` | P0、0、冒烟、Blocker、Critical、最高、致命 |
| `P1` | P1、1、高、High、Major、重要、Urgent |
| `P2` | P2、2、中、Medium、Normal、一般（**默认值**，无法识别时用它） |
| `P3` | P3、3、低、Low、Minor、Trivial、次要、提示 |

TestRail 数值型 priority_id（1=Low…4=Critical）：4→P0、3→P1、2→P2、1→P3。
「高/High/Critical」类源值落 P0 还是 P1 取决于源体系是否有更高一档：若源中同时存在 Critical 与 High，则 Critical→P0、High→P1；若「高」已是最高档，映射方案默认 P1，并在字段映射确认环节向用户明示、允许改为 P0。

## 用例类型取值 → 平台枚举

| 平台值 | 常见源值 |
|---|---|
| `functional` | 功能、功能测试、Functional、Feature（**默认值**） |
| `interface` | 接口、接口测试、API、Interface |
| `performance` | 性能、压测、Performance、Load、Stress |
| `security` | 安全、Security、渗透 |
| `compatibility` | 兼容、兼容性、Compatibility、跨浏览器、多端 |
| `other` | 其他、Other，以及无法归类的值（归 other 前向用户确认） |

## 状态取值 → 平台枚举

| 平台值 | 常见源值 |
|---|---|
| `draft` | 草稿、待评审、Draft、New、Untested（**默认值**，迁移建议统一用它） |
| `active` | 已评审、生效、正常、Active、Approved、Current |
| `deprecated` | 废弃、作废、失效、Deprecated、Obsolete、Rejected |
TCP_SKILL_EOF_9
			;;
	esac
}
# <<< END GENERATED SKILLS

# emit_skill_file <skill> <相对路径>：把一份 skill 文件的正文吐到 stdout。
emit_skill_file() {
	skill_file_content "$1" "$2" | sed "s|__MCP_URL__|$MCP_URL|g"
}

# ---------------------------------------------------------------- JSON 合并

detect_json_tool() {
	if command -v jq >/dev/null 2>&1; then
		JSON_TOOL="jq"
	elif command -v python3 >/dev/null 2>&1; then
		JSON_TOOL="python3"
	else
		JSON_TOOL="none"
	fi
}

# 没有 jq 也没有 python3 时的出路：不写，打印片段。
refuse_json_write() {
	rj_target="$1"
	rj_topkey="$2"
	rj_entry="$3"
	warn "这台机器上既没有 jq 也没有 python3，无法安全地合并 JSON。"
	warn "这不是崩溃——脚本选择不写，因为覆盖式写入会毁掉你已有的 MCP 配置。"
	info "请手动把下面这段合并进：$rj_target"
	info "（顶层键是 \"$rj_topkey\"，条目名是 \"$MCP_SERVER_NAME\"）"
	printf '\n'
	printf '  "%s": {\n    "%s": %s\n  }\n' "$rj_topkey" "$MCP_SERVER_NAME" "$rj_entry"
	printf '\n'
	info "装上 jq（brew install jq / apt install jq）或 python3 后重跑即可自动完成。"
	EXIT_CODE=3
}

# merge_json <target> <topkey> <entry_json> <base_json>
# 把 entry 挂到 <topkey>.<MCP_SERVER_NAME> 上，保留文件里已有的一切；
# base_json 里的顶层键只在文件中不存在时才补（用于 opencode 的 $schema）。
merge_json() {
	mj_target="$1"
	mj_topkey="$2"
	mj_entry="$3"
	mj_base="$4"

	if [ "$DRY_RUN" -eq 1 ]; then
		info "将合并进 $mj_target （$mj_topkey.${MCP_SERVER_NAME}）"
		info "条目：$mj_entry"
		if [ -f "$mj_target" ]; then
			info "该文件已存在，届时会先备份成 $mj_target.bak.<纪元秒>"
		fi
		return 0
	fi

	if [ "$JSON_TOOL" = "none" ]; then
		refuse_json_write "$mj_target" "$mj_topkey" "$mj_entry"
		return 0
	fi

	mj_src="$mj_target"
	if [ ! -s "$mj_target" ]; then
		mj_src="/dev/null"
	fi

	mj_tmp="${TMPDIR:-/tmp}/tcp-merge.$$"
	rm -f "$mj_tmp"

	mj_rc=0
	if [ "$JSON_TOOL" = "jq" ]; then
		jq -n \
			--slurpfile existing_arr "$mj_src" \
			--arg topkey "$mj_topkey" \
			--arg name "$MCP_SERVER_NAME" \
			--argjson entry "$mj_entry" \
			--argjson base "$mj_base" \
			'( $existing_arr[0] // {} ) as $existing
			 | ($base + $existing)
			 | .[$topkey] = ( ( .[$topkey] // {} ) + { ($name): $entry } )' \
			> "$mj_tmp" 2>/dev/null || mj_rc=$?
	else
		python3 - "$mj_src" "$mj_topkey" "$MCP_SERVER_NAME" "$mj_entry" "$mj_base" \
			> "$mj_tmp" 2>/dev/null <<'PY' || mj_rc=$?
import json
import sys

src, topkey, name, entry_raw, base_raw = sys.argv[1:6]

if src == "/dev/null":
    existing = {}
else:
    with open(src, encoding="utf-8") as handle:
        text = handle.read().strip()
    existing = json.loads(text) if text else {}

if not isinstance(existing, dict):
    raise SystemExit("top level of the config file is not a JSON object")

merged = dict(json.loads(base_raw))
merged.update(existing)
section = dict(merged.get(topkey) or {})
section[name] = json.loads(entry_raw)
merged[topkey] = section

json.dump(merged, sys.stdout, ensure_ascii=False, indent=2)
sys.stdout.write("\n")
PY
	fi

	if [ "$mj_rc" -ne 0 ] || [ ! -s "$mj_tmp" ]; then
		rm -f "$mj_tmp"
		fail "$mj_target 不是合法的 JSON 对象，已放弃写入（原文件未被改动）。"
		info "请先修好这个文件，或手动加入下面这段："
		printf '  "%s": { "%s": %s }\n' "$mj_topkey" "$MCP_SERVER_NAME" "$mj_entry"
		return 0
	fi

	if [ -f "$mj_target" ] && cmp -s "$mj_tmp" "$mj_target"; then
		rm -f "$mj_tmp"
		ok "$mj_target 已是最新，跳过写入"
		return 0
	fi

	if [ -f "$mj_target" ]; then
		backup_file "$mj_target"
	fi
	mv "$mj_tmp" "$mj_target"
	ok "已写入 $mj_target"
}

# ---------------------------------------------------------------- 平台检测

detect_platforms() {
	step "1/4 检测本地 agent"
	for tool in claude codex pi opencode zcode; do
		if command -v "$tool" >/dev/null 2>&1; then
			DETECTED="$DETECTED$tool "
			ok "检测到 $tool"
		else
			info "未检测到 $tool"
		fi
	done
	if [ "$DETECTED" = " " ]; then
		warn "一个都没检测到。仍会按 --platform 的要求写配置，装好客户端后即可用。"
	fi
}

# want <platform>：这一轮要不要处理这个平台
want() {
	case "$PLATFORM" in
		all)
			case "$DETECTED" in
				*" $1 "*) return 0 ;;
				*) return 1 ;;
			esac
			;;
		"$1") return 0 ;;
		*) return 1 ;;
	esac
}

is_detected() {
	case "$DETECTED" in
		*" $1 "*) return 0 ;;
		*) return 1 ;;
	esac
}

# ---------------------------------------------------------------- 装 skill

# install_one_skill <skill 名>：把这个 skill 的全部文件落到真身目录。
install_one_skill() {
	ios_skill="$1"
	ios_dir="$SKILLS_ROOT/$ios_skill"
	info "skill $ios_skill -> $ios_dir"
	for ios_rel in $(skill_file_list "$ios_skill"); do
		ios_target="$ios_dir/$ios_rel"
		if [ "$DRY_RUN" -eq 1 ]; then
			info "将写入 $ios_target"
			continue
		fi
		ensure_dir "$(dirname "$ios_target")"
		emit_skill_file "$ios_skill" "$ios_rel" | install_content "$ios_target"
	done
}

# link_for_claude <skill 名>：Claude Code 只扫 .claude/skills/，给它一个指向
# 真身的符号链接，而不是复制第二份（复制出来的那份改了不会同步，很难发现）。
link_for_claude() {
	lfc_skill="$1"
	lfc_dir="$SKILLS_ROOT/$lfc_skill"
	lfc_link="$CLAUDE_SKILLS_ROOT/$lfc_skill"

	if [ "$DRY_RUN" -eq 1 ]; then
		info "将创建符号链接 $lfc_link -> $lfc_dir"
		return 0
	fi
	if [ -L "$lfc_link" ]; then
		lfc_existing="$(readlink "$lfc_link")"
		if [ "$lfc_existing" = "$lfc_dir" ]; then
			ok "符号链接已存在且指向正确：$lfc_link"
		else
			warn "$lfc_link 已是一个指向别处的符号链接（-> ${lfc_existing}），未改动。"
			info "确认可以替换后，手动执行：rm '$lfc_link' && ln -s '$lfc_dir' '$lfc_link'"
		fi
		return 0
	fi
	if [ -e "$lfc_link" ]; then
		# 在本仓库自己的工作副本里跑脚本就会走到这里：.claude/skills/<name>
		# 本来就是真身目录。不动它是对的。
		warn "$lfc_link 已存在且不是符号链接（可能是你自己的 skill），未改动。"
		info "如需替换，请自行备份后删除它再重跑本脚本。"
		return 0
	fi
	ensure_dir "$CLAUDE_SKILLS_ROOT"
	ln -s "$lfc_dir" "$lfc_link"
	ok "已创建符号链接 $lfc_link -> $lfc_dir"
}

note_pi_skills() {
	printf '\n'
	info "pi 提示：pi 会扫 .agents/skills/，上面那两份真身它直接能用，不需要符号链接。"
	info "如果你想让 pi 认全局的 ~/.agents/skills，可以在 ~/.pi/agent/settings.json 里加："
	info '    { "skills": ["~/.agents/skills"] }'
	info "本脚本不替你改 settings.json —— 那是你的文件，可能已有别的内容。"
}

install_skill() {
	step "2/4 安装 skill（所有平台共用同一份真身）"
	for skill in $SKILL_NAMES; do
		install_one_skill "$skill"
	done

	step "2b/4 为 Claude Code 建符号链接（它只扫 .claude/skills/）"
	for skill in $SKILL_NAMES; do
		link_for_claude "$skill"
	done

	if is_detected pi; then
		note_pi_skills
	fi
}

# ---------------------------------------------------------------- Claude Code

configure_claude() {
	step "3/4 配置 Claude Code"
	entry="{\"type\":\"http\",\"url\":\"$MCP_URL\",\"headers\":{\"Authorization\":\"Bearer \${AS_TOKEN}\"}}"

	if [ "$SCOPE" = "user" ]; then
		info "user scope 下 Claude Code 的配置在 ~/.claude.json 里，那个文件同时装着"
		info "会话历史等一堆结构，本脚本不去动它。请执行官方命令（注意用单引号，"
		info "这样 \${AS_TOKEN} 会作为占位符留在配置里，而不是把你的 token 值写死）："
		printf '\n'
		printf "    claude mcp add --scope user --transport http %s '%s' --header 'Authorization: Bearer \${AS_TOKEN}'\n" \
			"$MCP_SERVER_NAME" "$MCP_URL"
		printf '\n'
		info "或者手工在 ~/.claude.json 的 mcpServers 里加："
		printf '    "%s": %s\n' "$MCP_SERVER_NAME" "$entry"
		return 0
	fi

	target="$BASE_DIR/.mcp.json"
	merge_json "$target" "mcpServers" "$entry" '{}'
}

# ---------------------------------------------------------------- Codex

configure_codex() {
	step "3/4 配置 Codex（TOML）"
	if [ "$SCOPE" = "user" ]; then
		target="$HOME/.codex/config.toml"
	else
		target="$BASE_DIR/.codex/config.toml"
		info "项目级 Codex 配置要求该项目已被 trust，否则 Codex 不读它。"
	fi

	# Codex 不做 ${VAR} 字符串插值，只接受「环境变量的名字」。
	block="[mcp_servers.$MCP_SERVER_NAME]
url = \"$MCP_URL\"
bearer_token_env_var = \"AS_TOKEN\"
"

	if [ "$DRY_RUN" -eq 1 ]; then
		info "将追加到 ${target}："
		printf '%s' "$block" | sed 's/^/      /'
		if [ -f "$target" ]; then
			info "该文件已存在，届时会先备份成 $target.bak.<纪元秒>"
		fi
		return 0
	fi

	ensure_dir "$(dirname "$target")"

	# 不解析整个 TOML —— 只看这个 table 头在不在。在就不重复追加。
	if [ -f "$target" ] && grep -q "^[[:space:]]*\[mcp_servers\.$MCP_SERVER_NAME\]" "$target"; then
		ok "$target 里已存在 [mcp_servers.$MCP_SERVER_NAME]，未重复追加。"
		info "本脚本认为它应该长这样，请自行核对："
		printf '%s' "$block" | sed 's/^/      /'
		return 0
	fi

	if [ -f "$target" ]; then
		backup_file "$target"
		# TOML 的 table 追加到文件末尾是安全的：新 table 头结束了上一个 table。
		printf '\n%s' "$block" >> "$target"
	else
		printf '%s' "$block" > "$target"
	fi
	ok "已追加 [mcp_servers.$MCP_SERVER_NAME] 到 $target"
}

# ---------------------------------------------------------------- opencode

configure_opencode() {
	step "3/4 配置 opencode"
	if [ "$SCOPE" = "user" ]; then
		target="$HOME/.config/opencode/opencode.json"
	else
		target="$BASE_DIR/opencode.json"
	fi

	# 三处与众不同：顶层键是 mcp（不是 mcpServers）；type 是 "remote"（不是
	# "http"）；插值语法是 {env:AS_TOKEN}（不是 ${...}）。
	# "oauth": false 必须显式写，否则 opencode 会自己去试 OAuth。
	entry="{\"type\":\"remote\",\"url\":\"$MCP_URL\",\"enabled\":true,\"oauth\":false,\"headers\":{\"Authorization\":\"Bearer {env:AS_TOKEN}\"}}"
	# $schema 是 opencode 配置文件里的字面 JSON 键名，必须原样写进文件、
	# 恰恰不能被 shell 展开，单引号正是为此。shellcheck 的提醒在这里是反的。
	# shellcheck disable=SC2016
	base='{"$schema":"https://opencode.ai/config.json"}'

	if [ "$DRY_RUN" -ne 1 ]; then
		ensure_dir "$(dirname "$target")"
	fi
	merge_json "$target" "mcp" "$entry" "$base"
}

# ---------------------------------------------------------------- zcode

configure_zcode() {
	step "3/4 配置 zcode"
	if [ "$SCOPE" = "user" ]; then
		target="$HOME/.agents/mcp.json"
	else
		target="$BASE_DIR/.agents/mcp.json"
	fi

	# zcode 未证实支持环境变量插值，所以这里写字面量占位符，由用户手工替换。
	entry="{\"type\":\"http\",\"url\":\"$MCP_URL\",\"headers\":{\"Authorization\":\"Bearer <YOUR_TOKEN>\"}}"

	if [ "$DRY_RUN" -ne 1 ]; then
		ensure_dir "$(dirname "$target")"
	fi
	merge_json "$target" "mcpServers" "$entry" '{}'

	printf '\n'
	warn "zcode 的这份配置有三条必须知道的事："
	warn "(a) 【未验证】zcode 官方文档只给了 stdio 的 JSON 示例，远程 HTTP 的逐字字段名"
	warn "    没有文档原文。上面这份结构是从「.agents/mcp.json 采用行业标准结构」推断的。"
	warn "    如果 zcode 不认，改走 GUI：Settings -> MCP Servers -> New MCP Server，"
	warn "    填 URL（${MCP_URL}）+ 一个 Authorization: Bearer <你的 token> 头。"
	warn "(b) 同一 scope 下，只要 .zcode 的 config 里有任何一个 MCP server，"
	warn "    .agents/mcp.json 会被【整份忽略、不合并】。两边同时配了就以 .zcode 为准。"
	warn "(c) zcode 未证实支持 \${VAR} 插值，所以上面写的是字面量占位符 <YOUR_TOKEN>。"
	warn "    本脚本【不替你填 token】——请手工把 $target 里的 <YOUR_TOKEN> 换成你的真 token。"
	warn "    换完记得确认这个文件没被提交进 git（它会含明文凭据）。"
}

# ---------------------------------------------------------------- pi

note_pi() {
	step "3/4 pi"
	info "pi 不支持 MCP —— 它的 README 逐字写着 \"No MCP\"。"
	info "pi 只装 skill：走 skill + curl 直连 ${MCP_URL}，不要试图给它配 MCP。"
	# skill 正文里【不含】调用示例：那段 curl 说明随旧的单个 testcase-platform
	# skill 一起删掉了，两个新 skill 都只写流程、不写传输层。别再改回「正文里已
	# 经写了」——那是一句会被 grep 证伪的假话（grep -rn curl .claude/skills/ 为空）。
	info "两个 skill 都不含调用示例：要在 pi 上用这个端点，得自己按标准的"
	info "JSON-RPC over HTTP 直连（tools/list 探工具、tools/call 调用）。"
}

# ---------------------------------------------------------------- token 提醒

token_notice() {
	step "4/4 token"
	if [ "${AS_TOKEN:-}" = "" ]; then
		warn "环境变量 AS_TOKEN 未设置——现在连上去会拿到 HTTP 401。"
		info "去平台里「设置 -> API Token -> 新建 Token」拿一枚（as_ 开头），然后："
		printf '\n'
		printf "    export AS_TOKEN='<粘贴你的 token>'\n"
		printf '\n'
		info "建议把这行写进 ~/.zshrc 或 ~/.bashrc，而不是只在当前 shell 里 export"
		info "（留在 shell history 里的凭据，别人翻一下 history 就拿到了）。"
		info "本脚本从不接受 token 参数，也从不把 token 值写进任何文件。"
	else
		ok "环境变量 AS_TOKEN 已设置（值不会被打印，也不会被写进任何文件）。"
	fi
}

# ---------------------------------------------------------------- 主流程

main() {
	say "测试用例平台 · 本地 agent 一键安装"
	say "--------------------------------------------"
	say "  MCP 端点 : $MCP_URL"
	say "  平台     : $PLATFORM"
	say "  作用域   : $SCOPE  ($BASE_DIR)"
	if [ "$SKILL_ONLY" -eq 1 ]; then
		say "  模式     : --skill-only（不碰任何 MCP 配置）"
	fi
	if [ "$DRY_RUN" -eq 1 ]; then
		say "  模式     : --dry-run（只打印，不写任何字节）"
	fi

	detect_json_tool
	detect_platforms
	install_skill

	if [ "$SKILL_ONLY" -eq 1 ]; then
		step "3/4 MCP 配置"
		info "--skill-only：跳过所有 MCP 配置。"
	else
		if [ "$JSON_TOOL" = "none" ]; then
			warn "没有 jq 也没有 python3：JSON 类配置将只打印片段，不会写入。"
		fi
		want claude   && configure_claude   || true
		want codex    && configure_codex    || true
		want opencode && configure_opencode || true
		want zcode    && configure_zcode    || true
		if [ "$PLATFORM" = "all" ] && is_detected pi; then
			note_pi
		fi
	fi

	token_notice

	printf '\n--------------------------------------------\n'
	if [ "$DRY_RUN" -eq 1 ]; then
		say "dry-run 结束：没有创建任何目录、备份或文件。"
	elif [ "$EXIT_CODE" -eq 0 ]; then
		say "完成。重启你的 agent 让新配置生效，然后让它「列出测试用例平台上的项目」试试。"
	else
		say "部分步骤未完成（见上面的 [!] / [X]）。已写入的部分是有效的，"
		say "剩下的按提示手工补齐后即可使用。"
	fi
	exit "$EXIT_CODE"
}

main
