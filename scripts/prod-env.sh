#!/usr/bin/env bash
# 合并并检查单机生产部署的 env 文件。make up:prod 在每次启动前执行本脚本。
#
# 用法：scripts/prod-env.sh <模板文件> <生产 env 文件>
#
# 规则：
#   1. 生产 env 文件不存在时，从模板复制一份（权限 600），然后以退出码 1 停止，由人填写取值。
#   2. 模板中有、生产 env 文件中没有的键，连同模板中紧挨在它上方的注释，追加到文件末尾。
#      生产 env 文件中已有的键和值一律不修改。
#   3. 生产 env 文件中有、模板中没有的键，只给警告。
#   4. 模板中紧挨在键上方的注释含有 [必填] 时，该键为必填。必填键的值为空时，以退出码 1 停止。
#
# 退出码：0 可以启动；1 需要人处理；2 用法错误。
#
# 只用 POSIX awk 的功能：macOS 自带的 awk（one true awk）没有 gensub，match 也不能取分组。
set -euo pipefail

if [ "$#" -ne 2 ]; then
	echo "用法：$0 <模板文件> <生产 env 文件>" >&2
	exit 2
fi
template="$1"
target="$2"

if [ ! -f "${template}" ]; then
	echo "❌ 找不到模板：${template}" >&2
	exit 2
fi

if [ ! -f "${target}" ]; then
	(umask 077 && cp "${template}" "${target}")
	echo "📝 已从模板生成 ${target}（权限 600）。"
	echo "   填好标有 [必填] 的键，然后再执行一次 make up:prod。"
	exit 1
fi

echo "▶ 合并 ${target}"

# awk 的输出每行一条记录，第一列是类型，用制表符分隔：
#   M  要追加到生产 env 文件的一行（注释或键）
#   N  模板中有、生产 env 文件中没有的键名
#   X  生产 env 文件中有、模板中没有的键名
#   R  值为空的必填键名
# 先读生产 env 文件（FNR == NR），再读模板。
# 值的规则与 docker compose 的 env_file 相同：引号中的内容是值；没有引号时，空白后的 # 开始注释。
report="$(awk -v q="'" '
function keyof(line) {
	if (line !~ /^[ \t]*(export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=/) return ""
	sub(/^[ \t]*(export[ \t]+)?/, "", line)
	sub(/[ \t]*=.*/, "", line)
	return line
}
function valueof(line,    first, rest, end) {
	sub(/^[^=]*=/, "", line)
	sub(/^[ \t]+#.*$/, "", line)
	sub(/^[ \t]+/, "", line)
	first = substr(line, 1, 1)
	if (first == q || first == "\"") {
		rest = substr(line, 2)
		end = index(rest, first)
		return end ? substr(rest, 1, end - 1) : rest
	}
	sub(/[ \t]+#.*$/, "", line)
	sub(/[ \t]+$/, "", line)
	return line
}
FNR == NR {
	k = keyof($0)
	if (k != "") {
		if (!(k in have)) targetKeys[++targetCount] = k
		have[k] = 1
		value[k] = valueof($0)
	}
	next
}
/^[ \t]*$/ { comments = ""; required = 0; next }
/^[ \t]*#/ {
	comments = comments "M\t" $0 "\n"
	if (index($0, "[必填]")) required = 1
	next
}
{
	k = keyof($0)
	if (k != "") {
		inTemplate[k] = 1
		if (k in have) {
			current = value[k]
		} else {
			printf "%sM\t%s\n", comments, $0
			print "N\t" k
			current = valueof($0)
		}
		if (required && current == "") print "R\t" k
	}
	comments = ""
	required = 0
}
END {
	for (i = 1; i <= targetCount; i++) {
		if (!(targetKeys[i] in inTemplate)) print "X\t" targetKeys[i]
	}
}
' "${target}" "${template}")"

tab="$(printf '\t')"
section() {
	printf '%s\n' "${report}" | grep "^$1${tab}" | cut -f2- || true
}
names() {
	section "$1" | tr '\n' ' ' | sed 's/ $//'
}

added="$(names N)"
if [ -n "${added}" ]; then
	if [ -n "$(tail -c 1 "${target}")" ]; then
		echo >> "${target}"
	fi
	{
		echo
		echo "# ── 以下各键由 make up:prod 于 $(date '+%Y-%m-%d') 从 $(basename "${template}") 补入。检查取值。──"
		section M
	} >> "${target}"
	echo "  ➕ 从模板补入（已追加到文件末尾）：${added}"
fi

extra="$(names X)"
if [ -n "${extra}" ]; then
	echo "  ⚠️  模板中没有这些键，确认它们没有拼错、也没有废弃：${extra}"
fi

if [ -n "$(find "${target}" -perm -004 2>/dev/null)" ]; then
	echo "  ⚠️  其他用户可以读取 ${target}。执行：chmod 600 ${target}"
fi

missing="$(names R)"
if [ -n "${missing}" ]; then
	echo "❌ 这些必填键没有值：${missing}" >&2
	echo "   编辑 ${target}，然后再执行一次 make up:prod。" >&2
	exit 1
fi

echo "  ✅ 必填项齐全"
