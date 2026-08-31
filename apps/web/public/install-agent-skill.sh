#!/bin/sh
#
# install-agent-skill.sh —— 把「本地 agent ←→ 测试用例平台」这条连接一条命令装好。
#
# 由来
# ----
# 平台在 /mcp 上提供一个无状态的 Streamable HTTP MCP 端点（六个工具：
# list_projects / create_project / get_module_tree / ensure_module_path /
# import_test_cases / search_cases），鉴权是 `Authorization: Bearer <API Token>`。
# 用户要用自己的本地 agent 连上来，需要做两件事：装一份告诉 agent 怎么用这些工具
# 的 skill，再把 MCP 端点写进 agent 的配置。这两件事手工做要翻四份不同的文档，
# 所以有了这个脚本。
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
SKILL_NAME="testcase-platform"
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

# URL 会被原样嵌进 JSON 字符串字面量，带引号或反斜杠会把文件写坏。
# 下面是 case 的 glob 模式，不是字符串拼接：`*'"'*` 匹配含双引号的值，
# `*'\'*` 匹配含反斜杠的值。shellcheck 误以为这里是想转义单引号。
# shellcheck disable=SC1003
case "$MCP_URL" in
	*'"'*|*'\'*)
		say "错误：--url 不能包含引号或反斜杠：$MCP_URL"
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

SKILL_DIR="$BASE_DIR/.agents/skills/$SKILL_NAME"
SKILL_FILE="$SKILL_DIR/SKILL.md"
CLAUDE_LINK="$BASE_DIR/.claude/skills/$SKILL_NAME"

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

# ---------------------------------------------------------------- SKILL.md

# 正文里的 __MCP_URL__ 由调用方 sed 替换；heredoc 用引号包住，
# 于是 $AS_TOKEN 这类写法原样保留，不会被 shell 吃掉。
skill_md() {
	cat <<'SKILL_EOF' | sed "s|__MCP_URL__|$MCP_URL|g"
---
name: testcase-platform
description: 通过 MCP 连接测试用例平台，读写测试用例：列项目、查/建模块树、批量导入用例、按名称搜索用例。触发场景：测试用例、用例平台、导入用例、批量导入用例、迁移测试用例、用例入库、查用例、建用例模块、test case、import test cases、testcase platform。
---

# 测试用例平台

平台是一套测试用例管理系统（项目 → 模块树 → 用例，带版本快照），在 `__MCP_URL__`
暴露一个**无状态 Streamable HTTP MCP 端点**，共六个工具。

## 连接与身份

- 端点：`__MCP_URL__`
- 鉴权：每个请求都要带 `Authorization: Bearer $AS_TOKEN`（token 在平台里
  「设置 → API Token → 新建 Token」生成，`as_` 开头）。
- **身份 = 该 token 所属用户的身份与权限**，没有「MCP 默认身份」也不会静默降级。
  你能看到、能写入的只有 token 主人参与的项目（平台 admin 看得到全部）。
- 导入的 `lastModifiedBy` / `savedBy` 记 token 主人的用户名，**别用别人的 token 导数据**。

客户端不支持 MCP 时（如 pi）直接 curl：POST `__MCP_URL__`，头带上面的 Bearer 加
`Content-Type: application/json` 与 `Accept: application/json, text/event-stream`，
body 是标准 JSON-RPC（`tools/list` / `tools/call`）。

## 六个工具

| 工具 | 入参 | 返回 |
|---|---|---|
| `list_projects` | 无 | `[{ id, name, description, createdAt, updatedAt }]`，只含你可见的项目 |
| `create_project` | `name`（必填，非空）、`description`（可选） | 新建的项目对象，含 `id` |
| `get_module_tree` | `projectId`（uuid） | **两个文本块**：① 缩进大纲 `- 名称 (id: …)`；② 扁平 JSON `[{ id, name, parentId, depth }]` |
| `ensure_module_path` | `projectId`（uuid）、`path`（字符串数组，1–10 段，从根到叶） | `{ moduleId, createdModuleIds }` |
| `import_test_cases` | `projectId`（uuid）、`onDuplicate`（**必填**）、`cases`（1–50 条） | `{ created[], skipped[], errors[] }` |
| `search_cases` | `projectId`（uuid）、`keyword`（必填，非空）、`limit`（可选，默认 20，上限 50） | 摘要行数组，按 `updatedAt` 倒序 |

细节：

- `ensure_module_path` 沿 `path` 从根往下走，缺哪层建哪层，按**名称**匹配已有模块；
  幂等（同一 path 重跑 `createdModuleIds` 为 `[]`）。返回的 `moduleId` 是**最深一级**
  模块的 id，用例的 `moduleId` 就填它。
- `search_cases` 对用例名做大小写不敏感的子串匹配（`%` `_` 按字面量转义），返回
  `{ id, name, moduleId, priority, status, caseType, sourceRef, updatedAt }`，用来抽查。

## import_test_cases 的硬约束

1. **每批最多 50 条**，超了整批被拒；多了自己切批。
2. **每条都要带 `sourceRef`**（项目内唯一的稳定字符串，如 `testrail:C1234`、
   `excel:登录模块:第12行`）。它是**幂等键**，重跑同一批不会产生重复用例。
   没带 `sourceRef` 的行，若目标模块已有同名用例，会被跳过并附一条 warning。
3. `onDuplicate` 必填：`skip`（已存在则原样保留）、`overwrite`（走版本快照管线更新，
   **会记一个新版本**）、`create-anyway`（新建一条但 `sourceRef` 被置为 `null`，
   唯一索引不允许重复）。
4. **逐行校验、互不牵连**：某行字段不合法（名称空、moduleId 不是 uuid、枚举值不认识…）
   只会进 `errors`，带上本批内的 `index` 和指名字段的 message，其余行照常写入。
   脏数据可以直接提交，再照报告修。

返回结构：`created[]` 为 `{ index, caseId, name, sourceRef, version, action, warning? }`
（`action` 是 `created` 或 `overwritten`）；`skipped[]` 为
`{ index, name, sourceRef, existingCaseId, reason }`；`errors[]` 为
`{ index, name, sourceRef, message }`。

## 用例字段

`moduleId`（uuid）与 `name`（非空）必填，其余都有默认值：`priority` 取
`P0`|`P1`|`P2`|`P3`（默认 `P2`）；`caseType` 取 `functional`|`interface`|`performance`|
`security`|`compatibility`|`other`（默认 `functional`）；`status` 取
`draft`|`active`|`deprecated`（默认 `draft`）；`steps` 是 `[{ id, step, expected }]`
（默认 `[]`，**`id` 必须非空且在该用例内唯一**）；`preconditions` / `maintainer` /
`sourceRef` 是字符串或 `null`（默认 `null`）；`tags` 是字符串数组（默认 `[]`）。

## 错误语义（重要，别猜）

- **没带 / 带错 Bearer** → HTTP **401** + `WWW-Authenticate: Bearer`。这时一个工具都
  不会被注册，`tools/list` 也拿不到。去检查 `AS_TOKEN`。
- **token 主人不是该项目成员** → **不是 HTTP 403**。服务端把这类权限错误包成了
  普通的工具结果：HTTP 仍是 **200**，工具返回
  `{ isError: true, content: [{ type: "text", text: "Error: …" }] }`；
  NOT_FOUND、BAD_REQUEST 也走这条路。
  **所以每次调用都要看 `isError` 和文本，别因为「没报错」就当成功。**
  疑似权限问题就去找项目 owner 把 token 主人加进项目，**不要换个项目继续导**。

## 标准工作流

1. **先 `list_projects`** —— 一次调用同时确认连接通、token 有效、你能看到哪些项目。
   它失败就别往下走。
2. 与用户确认目标项目；没有合适的，问过用户再 `create_project`。
3. `get_module_tree` 看现有结构，`ensure_module_path` 补齐模块路径拿到 `moduleId`。
   **优先复用已有模块，别造平行的重复层级。**
4. **把字段映射方案报告给用户，等他确认后再写入。** 源数据的哪一列映射到
   `name` / `priority` / `steps` / `sourceRef`，`sourceRef` 怎么构造，`onDuplicate`
   选哪个——先说清楚，得到确认才调 `import_test_cases`。**这一步不能省。**
5. 分批导入（≤50/批），每批之后看 `created` / `skipped` / `errors` 三段。
6. 用 `search_cases` 抽查几条，再给用户一份汇总：成功多少、跳过多少及原因、
   失败多少及具体行号与原因。

别做的事：没确认字段映射就直接导；`isError: true` 时假装成功或编造导入结果；
不带 `sourceRef` 批量导入；为绕开权限错误换个项目导。
SKILL_EOF
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
	info "（顶层键是 \"$rj_topkey\"，条目名是 \"$SKILL_NAME\"）"
	printf '\n'
	printf '  "%s": {\n    "%s": %s\n  }\n' "$rj_topkey" "$SKILL_NAME" "$rj_entry"
	printf '\n'
	info "装上 jq（brew install jq / apt install jq）或 python3 后重跑即可自动完成。"
	EXIT_CODE=3
}

# merge_json <target> <topkey> <entry_json> <base_json>
# 把 entry 挂到 <topkey>.<SKILL_NAME> 上，保留文件里已有的一切；
# base_json 里的顶层键只在文件中不存在时才补（用于 opencode 的 $schema）。
merge_json() {
	mj_target="$1"
	mj_topkey="$2"
	mj_entry="$3"
	mj_base="$4"

	if [ "$DRY_RUN" -eq 1 ]; then
		info "将合并进 $mj_target （$mj_topkey.${SKILL_NAME}）"
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
			--arg name "$SKILL_NAME" \
			--argjson entry "$mj_entry" \
			--argjson base "$mj_base" \
			'( $existing_arr[0] // {} ) as $existing
			 | ($base + $existing)
			 | .[$topkey] = ( ( .[$topkey] // {} ) + { ($name): $entry } )' \
			> "$mj_tmp" 2>/dev/null || mj_rc=$?
	else
		python3 - "$mj_src" "$mj_topkey" "$SKILL_NAME" "$mj_entry" "$mj_base" \
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
		printf '  "%s": { "%s": %s }\n' "$mj_topkey" "$SKILL_NAME" "$mj_entry"
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

install_skill() {
	step "2/4 安装 skill（所有平台共用同一份真身）"

	if [ "$DRY_RUN" -eq 1 ]; then
		info "将创建目录 $SKILL_DIR"
		info "将写入 $SKILL_FILE"
		if [ -f "$SKILL_FILE" ]; then
			info "该文件已存在，届时会先备份成 $SKILL_FILE.bak.<纪元秒>"
		fi
	else
		ensure_dir "$SKILL_DIR"
		skill_md | install_content "$SKILL_FILE"
	fi

	# Claude Code 是唯一不扫 .agents/skills/ 的，只认 .claude/skills/，
	# 所以给它一个指向真身的符号链接，而不是复制第二份。
	step "2b/4 为 Claude Code 建符号链接（它只扫 .claude/skills/）"
	if [ "$DRY_RUN" -eq 1 ]; then
		info "将创建符号链接 $CLAUDE_LINK -> $SKILL_DIR"
	elif [ -L "$CLAUDE_LINK" ]; then
		existing_target="$(readlink "$CLAUDE_LINK")"
		if [ "$existing_target" = "$SKILL_DIR" ]; then
			ok "符号链接已存在且指向正确：$CLAUDE_LINK -> $SKILL_DIR"
		else
			warn "$CLAUDE_LINK 已是一个指向别处的符号链接（-> ${existing_target}），未改动。"
			info "确认可以替换后，手动执行：rm '$CLAUDE_LINK' && ln -s '$SKILL_DIR' '$CLAUDE_LINK'"
		fi
	elif [ -e "$CLAUDE_LINK" ]; then
		warn "$CLAUDE_LINK 已存在且不是符号链接（可能是你自己的 skill），未改动。"
		info "如需替换，请自行备份后删除它再重跑本脚本。"
	else
		ensure_dir "$(dirname "$CLAUDE_LINK")"
		ln -s "$SKILL_DIR" "$CLAUDE_LINK"
		ok "已创建符号链接 $CLAUDE_LINK -> $SKILL_DIR"
	fi

	if is_detected pi; then
		printf '\n'
		info "pi 提示：pi 会扫 .agents/skills/，上面那份真身它直接能用，不需要符号链接。"
		info "如果你想让 pi 认全局的 ~/.agents/skills，可以在 ~/.pi/agent/settings.json 里加："
		info '    { "skills": ["~/.agents/skills"] }'
		info "本脚本不替你改 settings.json —— 那是你的文件，可能已有别的内容。"
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
			"$SKILL_NAME" "$MCP_URL"
		printf '\n'
		info "或者手工在 ~/.claude.json 的 mcpServers 里加："
		printf '    "%s": %s\n' "$SKILL_NAME" "$entry"
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
	block="[mcp_servers.$SKILL_NAME]
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
	if [ -f "$target" ] && grep -q "^[[:space:]]*\[mcp_servers\.$SKILL_NAME\]" "$target"; then
		ok "$target 里已存在 [mcp_servers.$SKILL_NAME]，未重复追加。"
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
	ok "已追加 [mcp_servers.$SKILL_NAME] 到 $target"
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
	info "skill 正文里已经写了 curl 的调用方式（JSON-RPC over HTTP）。"
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
