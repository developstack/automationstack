# 本地开发环境的一键起停。
#
# 覆盖两种 Postgres 后端：Homebrew 装在宿主机上的（端口 5432）、docker compose
# 起的容器（宿主机端口 5433，见 docker-compose.yml 里那段注释）。这台仓库的
# 开发机上**没有 docker**，所以整套流程必须在只有 Homebrew Postgres 的机器上
# 完整跑通——`DB_BACKEND` 就是为此存在的，它决定连哪个库、用哪套起停命令。
#
# 常用入口：
#   make setup   首次配置（装依赖 + 补齐缺失的 .env，已存在的一律不动）
#   make dev     前台跑 turbo dev，日常开发用这个
#   make up      后台起全套（Postgres → 迁移 → dev 服务），日志落到 .dev-logs/
#   make down    停掉 up 起的一切
#   make doctor  体检：版本 / 端口 / .env / 数据库连通性 / 迁移是否落后
#
# ── 关于 shell 与 GNU Make 版本 ─────────────────────────────────────────────
# macOS 自带的是 **GNU Make 3.81**（2006 年，因为 3.82 起改成了 GPLv3，Apple
# 不再随系统更新）。它有两条直接影响写法的限制：
#   1. 不支持 `.ONESHELL`。所以**每一行 recipe 都是一个独立的 shell**，
#      跨行的逻辑一律用 `\` 续行拼成「一条命令」，绝不写成两行——那是
#      「cd 了但下一行没生效」的经典 bug 的来源。
#   2. 不认 `.SHELLFLAGS`（3.82 才加的）。下面照样声明它，是为了让装了新版
#      make（`brew install make` 的 gmake、以及绝大多数 Linux）的人拿到
#      fail-fast 行为；而在 3.81 上它只是一个没人读的变量，于是每条 recipe
#      **自己再写一次 `set -euo pipefail`**。两处都写不是冗余，是因为没有
#      任何一处能覆盖全部 make 版本。
#
# recipe 里禁止出现 `#` 注释：`\` 续行是由 shell 而不是 make 拼接的，一个
# `#` 会把它后面所有被拼进来的行全部吃掉，而且不会报错。解释一律写在
# 目标上方（也就是这种、顶格的 make 注释）。
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# 仓库根目录。不假设 make 的工作目录就是仓库根（`make -f path/to/Makefile`
# 时它不是），所有 recipe 第一件事就是 cd 到这里。
ROOT_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))

# 递归调用自己时用 $(MAKE_CMD) 而不是 $(MAKE)——这不是风格问题。
# make 会在 recipe 里**按字面**找 `$(MAKE)` / `${MAKE}`，找到就把这一行标成
# 「递归」，而被标记的行**在 `make -n` 下照样真的执行**（这个豁免的本意是让
# 递归 make 也能把子目录的 dry-run 打出来）。本仓库每条 recipe 都是用 `\` 拼成的
# 一整行，于是「有一处调了子 make」会让整条 recipe——起数据库、跑迁移、拉起
# 后台进程——在一次本以为无副作用的 `make -n up` 里全部真的跑掉。
# 换个变量名就绕开了那次字面匹配；MAKEFLAGS 依然照常导给子 make，
# 所以 -n 之类的开关不会丢。
MAKE_CMD := $(MAKE)

# ── 可覆盖的参数 ────────────────────────────────────────────────────────────
# DB_BACKEND: brew | docker | auto（默认 auto，探测规则见 DB_BACKEND_RESOLVED）
DB_BACKEND ?= auto
# make down 时是否保留 Postgres。Homebrew 的 postgresql 是**机器级**服务，
# 别的项目可能正连着它，所以留一个不碰它的出口：make down KEEP_DB=1
KEEP_DB ?=
# make db-reset 的非交互确认（值必须等于库名）。见 db-reset。
CONFIRM ?=
# make logs / make ps 只看某一个 app：make logs APP=server
APP ?=

PG_DB := automationstack
# Homebrew 的 Postgres 监听 5432；compose 那个刻意映射到 5433，就是为了不和
# 前者撞车（docker-compose.yml 的 postgres.ports 有完整解释）。两个端口对应
# 两套连接参数，`make setup` 生成 DATABASE_URL 时必须跟着后端走。
BREW_PG_PORT := 5432
DOCKER_PG_PORT := 5433
# 等库 ready 的秒数上限。冷启动的容器要跑 initdb，比宿主机上那个慢得多。
PG_WAIT_TIMEOUT := 60

LOG_DIR := $(ROOT_DIR)/.dev-logs
ENV_ROOT := $(ROOT_DIR)/.env
ENV_SERVER := $(ROOT_DIR)/apps/server/.env
ENV_WEB := $(ROOT_DIR)/apps/web/.env

# 要后台拉起哪些 dev 服务：扫 apps/*，凡是 package.json 里有 dev 脚本的都算。
#
# 刻意**不**写死 server / web。另一个分支上还有 apps/farm（:3002）与
# apps/node-agent，rebase 过来之后这里会自动纳入，不用改 Makefile；反过来
# 在 main 上它们不存在，探测结果里也就没有它们。
DEV_APPS := $(shell for d in "$(ROOT_DIR)"/apps/*/; do [ -f "$${d}/package.json" ] || continue; grep -q '"dev"[[:space:]]*:' "$${d}/package.json" || continue; basename "$${d}"; done)

# 各 app 的端口。写成 PORT_<目录名> 是为了能被 $(PORT_$(app)) 这种计算变量名
# 取到，端口表因此只有这一份，ps / down / doctor 都从它派生。
# farm 的 3002 是照另一个分支的约定预留的：apps/farm 合进来时这里不用改，
# 而它不存在时也不会出现在 DEV_APPS 里，PORT_farm 就是一条死条目。
# 探测到但没登记端口的 app（比如 node-agent 这种不监听 HTTP 的）取到空串，
# 显示成 "-"，不影响起停。
PORT_server := 3000
PORT_web := 3001
PORT_farm := 3002
DEV_PORTS := $(foreach app,$(DEV_APPS),$(PORT_$(app)))
APP_PORT_MAP := $(foreach app,$(DEV_APPS),$(app)=$(PORT_$(app)))

# 探测结果：brew / docker / none（探测不到）/ unknown（DB_BACKEND 填了别的值）。
#
# 用 `=` 而不是 `:=`：这里会 `docker info` 探活，探不到 daemon 时要等一小会儿，
# 不该在 `make help` 这种压根不碰数据库的目标上白等。递归展开意味着只有真正
# 引用它的 recipe 才付这个代价——所以每条 recipe 只引用一次，先塞进 shell 变量。
#
# 顺序是 docker 优先、brew 兜底。探不到就返回 none，由各目标报错退出；
# **不静默降级**——猜错后端的后果是连上一个空库然后在迁移那步炸，
# 而报错原文会指向 drizzle 而不是「你根本没起数据库」。
#
# ⚠️ 这段 shell 里**不能出现 `case`**：`$(shell ...)` 的参数是按括号配对切出来的，
# 而 `case x in brew|docker)` 里那个右括号会被当成 `$(shell` 的收尾——函数在那里
# 就截断了，后半截原样变成字符串。症状是 backend 变量里塞着一坨 shell 源码、
# 探测永远失效，且不报任何错。所以这里一律写成 if/elif。
DB_BACKEND_RESOLVED = $(shell \
	if [ '$(DB_BACKEND)' = brew ] || [ '$(DB_BACKEND)' = docker ]; then echo '$(DB_BACKEND)'; \
	elif [ '$(DB_BACKEND)' != auto ]; then echo unknown; \
	elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then echo docker; \
	elif command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -q '^postgresql'; then echo brew; \
	else echo none; fi)

.PHONY: help install setup dev up down restart logs ps status \
	db-up db-down db-wait db-migrate db-generate db-seed db-seed-admin \
	db-seed-demo db-studio db-reset check doctor clean _backend-guard

.DEFAULT_GOAL := help

##@ 上手

# 自文档化：说明直接从目标后面的 `## ` 注释里抓，加目标就等于加文档，
# 不存在「加了目标忘了更新 help」这种漂移。
# awk 的 FS 用 `:.*## ` 而不是常见的 `:.*?## `：非贪婪 `?` 是 PCRE 的写法，
# macOS 自带的 awk（one true awk）只认 POSIX ERE，那里的 `*?` 行为未定义。
help: ## 显示本说明（默认目标）
	@printf '\n\033[1mautomationstack 本地开发\033[0m\n'
	@printf '用法: make <target> [VAR=value]\n'
	@awk 'BEGIN {FS = ":.*## "} /^##@ / {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf '\n\033[1m可覆盖的变量\033[0m\n'
	@printf '  \033[36m%-14s\033[0m %s\n' 'DB_BACKEND' 'brew | docker | auto（当前: $(DB_BACKEND)）'
	@printf '  \033[36m%-14s\033[0m %s\n' 'KEEP_DB' '非空时 make down 不停 Postgres'
	@printf '  \033[36m%-14s\033[0m %s\n' 'APP' 'make logs / ps 只看某个 app'
	@printf '  \033[36m%-14s\033[0m %s\n' 'CONFIRM' 'make db-reset 的非交互确认'
	@printf '\n检测到的 dev 服务: $(DEV_APPS)\n\n'

install: ## 安装依赖（pnpm install）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	echo "▶ pnpm install"; \
	pnpm install

# ⚠️ 这个目标**永远不会覆盖已有的 .env**。
#
# apps/server/.env 和 apps/web/.env 里装的是真实口令、会话密钥、以及数据库
# 凭据主密钥（SECRET_ENCRYPTION_KEY 一旦换掉，库里所有已存的第三方凭据全部
# 解不开，没有任何办法找回，见 packages/env/src/server.ts 的注释）。所以判定
# 只有一条：文件在 = 跳过，不备份、不追加、不改一个字节；文件不在才生成。
# 重复跑必须完全幂等——这是「新人一键上手」和「老机器别被搞坏」的唯一交集。
#
# 生成的 DATABASE_URL 跟着后端走：brew 走 localhost:5432 且用当前系统用户
# （Homebrew 的 initdb 用的是 OS 用户名，不是 postgres），docker 走
# 127.0.0.1:5433 且用 postgres + 根 .env 里那个口令。
setup: ## 首次配置：装依赖 + 生成缺失的 .env（已存在的一律跳过）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	backend='$(DB_BACKEND_RESOLVED)'; \
	$(MAKE_CMD) --no-print-directory _backend-guard BACKEND="$${backend}"; \
	echo "▶ Postgres 后端: $${backend}"; \
	if [ "$${backend}" = docker ]; then \
	  pghost=127.0.0.1; pgport=$(DOCKER_PG_PORT); pguser=postgres; \
	else \
	  pghost=localhost; pgport=$(BREW_PG_PORT); pguser="$$(id -un)"; \
	fi; \
	if command -v openssl >/dev/null 2>&1; then \
	  sess="$$(openssl rand -base64 32)"; enc="$$(openssl rand -base64 32)"; \
	else \
	  sess="$$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"; \
	  enc="$$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"; \
	fi; \
	echo "▶ 检查 .env"; \
	if [ "$${backend}" = docker ]; then \
	  if [ -f "$(ENV_ROOT)" ]; then echo "  已存在，跳过: .env"; \
	  else \
	    pw="$$(openssl rand -base64 24 2>/dev/null | tr -dc 'A-Za-z0-9' | cut -c1-24)"; \
	    printf '%s\n' \
	      '# 仅供 docker compose 展开 docker-compose.yml 里的变量占位符，' \
	      '# 不是任何 app 的运行时配置（那两份在 apps/server/.env 与 apps/web/.env）。' \
	      '# 由 make setup 生成。改口令要连带重建 postgres 卷，否则容器里那份旧口令不会变。' \
	      "POSTGRES_PASSWORD=$${pw}" > "$(ENV_ROOT)"; \
	    echo "  已生成: .env"; \
	  fi; \
	  dbpw="$$( set -a; . "$(ENV_ROOT)" >/dev/null 2>&1; printf '%s' "$${POSTGRES_PASSWORD:-}" )"; \
	  if [ -z "$${dbpw}" ]; then echo "  ⚠️  根 .env 里 POSTGRES_PASSWORD 是空的，DATABASE_URL 需要你手工补上口令"; fi; \
	  dburl="postgresql://$${pguser}:$${dbpw}@$${pghost}:$${pgport}/$(PG_DB)"; \
	else \
	  echo "  跳过: .env（只有 docker compose 需要它，当前后端是 brew）"; \
	  dburl="postgresql://$${pguser}@$${pghost}:$${pgport}/$(PG_DB)"; \
	fi; \
	if [ -f "$(ENV_SERVER)" ]; then echo "  已存在，跳过: apps/server/.env"; \
	else \
	  printf '%s\n' \
	    "# apps/server 的本地开发配置，由 make setup 生成（Postgres 后端: $${backend}）。" \
	    '# 完整变量清单见 apps/server/.env.example，权威 schema 是 packages/env/src/server.ts。' \
	    '# 端口说明：Homebrew 的 Postgres 是 5432，docker compose 那个映射到 5433。' \
	    '' \
	    "DATABASE_URL=$${dburl}" \
	    'CORS_ORIGIN=http://localhost:3001' \
	    "SESSION_SECRET=$${sess}" \
	    '' \
	    '# base64 编码的 32 字节 AES-256 主密钥。⚠️ 换掉它 = 库里所有已存的第三方' \
	    '# 凭据（jira_configs.api_token_cipher）全部解不开，且无法找回。' \
	    "SECRET_ENCRYPTION_KEY=$${enc}" > "$(ENV_SERVER)"; \
	  echo "  已生成: apps/server/.env"; \
	fi; \
	if [ -f "$(ENV_WEB)" ]; then echo "  已存在，跳过: apps/web/.env"; \
	else \
	  printf '%s\n' \
	    '# apps/web 的本地开发配置，由 make setup 生成。' \
	    '# ⚠️ VITE_SERVER_URL 是构建期变量，Vite 会把它内联进产物；换地址要重新 build。' \
	    'VITE_SERVER_URL=http://localhost:3000' > "$(ENV_WEB)"; \
	  echo "  已生成: apps/web/.env"; \
	fi; \
	if [ -d "$(ROOT_DIR)/node_modules" ]; then echo "▶ node_modules 已存在，跳过 install（要重装跑 make install）"; \
	else $(MAKE_CMD) --no-print-directory install; fi; \
	echo "✅ setup 完成。下一步: make up（后台）或 make dev（前台）"

##@ 起停

# 前台跑 turbo dev。日常开发用这个：热重载、日志直接在眼前、Ctrl-C 收工。
# 和 `make up` 的分工是「要不要看日志」，不是「哪个更正式」。
dev: ## 前台跑 pnpm dev（turbo，热重载）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm dev

# 后台起全套。四步是有序的，中间任何一步失败都不往下走：
#   Postgres 起来 → 真的 ready（轮询 pg_isready，不是 sleep 5）→ 迁移 → dev 服务
#
# 为什么按包起而不是 `pnpm dev`（turbo）：turbo.json 里 ui 是 "tui"，把它塞进
# 后台重定向到文件会得到一坨终端控制序列；而且 turbo 只有一个 PID，停的时候
# 分不出是谁没退。按包起换来每个 app 一份独立日志和一个独立 PID。
#
# 每个进程用 perl 的 setsid 拉到**自己的进程组**里再 exec，记下来的 PID 同时
# 就是 PGID。这样 `make down` 能 `kill -TERM -PID` 端掉整棵进程树（pnpm →
# tsx/vite → esbuild 至少三层），而不是杀掉 pnpm 留下一堆还占着端口的孤儿。
# 没有 perl 的机器退化成直接起 + 停的时候多走一遍 pkill -P，见 down。
up: ## 后台起全套：Postgres → 迁移 → dev 服务（日志在 .dev-logs/）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	if [ ! -f "$(ENV_SERVER)" ] || [ ! -f "$(ENV_WEB)" ]; then \
	  echo "❌ 缺少 .env（apps/server/.env 或 apps/web/.env），先跑: make setup"; exit 1; \
	fi; \
	$(MAKE_CMD) --no-print-directory db-up; \
	$(MAKE_CMD) --no-print-directory db-migrate; \
	mkdir -p "$(LOG_DIR)"; \
	echo "▶ 拉起 dev 服务: $(DEV_APPS)"; \
	for app in $(DEV_APPS); do \
	  pidfile="$(LOG_DIR)/$${app}.pid"; \
	  logfile="$(LOG_DIR)/$${app}.log"; \
	  if [ -f "$${pidfile}" ] && kill -0 "$$(cat "$${pidfile}")" 2>/dev/null; then \
	    echo "  已在运行，跳过: $${app} (pid $$(cat "$${pidfile}"))"; continue; \
	  fi; \
	  if command -v perl >/dev/null 2>&1; then \
	    nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV or die "exec failed: $$!\n";' -- \
	      pnpm --filter "./apps/$${app}" dev >>"$${logfile}" 2>&1 & \
	  else \
	    nohup pnpm --filter "./apps/$${app}" dev >>"$${logfile}" 2>&1 & \
	  fi; \
	  echo "$$!" > "$${pidfile}"; \
	  echo "  已启动: $${app} (pid $$!) → .dev-logs/$${app}.log"; \
	done; \
	echo "✅ 起完了。日志: make logs   状态: make status   停止: make down"

# 停 up 起的一切，幂等：进程早就死了、PID 文件残留、压根没起过，都不报错。
#
# 只端掉自己记下来的进程组，**不**按端口去杀占着 3000/3001 的进程：那台机器上
# 完全可能有另一个 checkout / 另一个人的会话正跑着同一个端口，误杀的代价远大于
# 「留一行提示让人自己看一眼」。端口没释放时下面会把还占着它的 PID 打出来。
down: ## 停 dev 服务与 Postgres（幂等；KEEP_DB=1 时不动 Postgres）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	stopped=0; \
	for pidfile in "$(LOG_DIR)"/*.pid; do \
	  [ -f "$${pidfile}" ] || continue; \
	  app="$$(basename "$${pidfile}" .pid)"; \
	  pid="$$(cat "$${pidfile}" 2>/dev/null || true)"; \
	  if [ -n "$${pid}" ] && kill -0 "$${pid}" 2>/dev/null; then \
	    kill -TERM -"$${pid}" 2>/dev/null || kill -TERM "$${pid}" 2>/dev/null || true; \
	    pkill -TERM -P "$${pid}" 2>/dev/null || true; \
	    n=0; \
	    while kill -0 "$${pid}" 2>/dev/null && [ $${n} -lt 20 ]; do sleep 0.5; n=$$((n + 1)); done; \
	    if kill -0 "$${pid}" 2>/dev/null; then \
	      kill -KILL -"$${pid}" 2>/dev/null || kill -KILL "$${pid}" 2>/dev/null || true; \
	      echo "  强杀: $${app} (pid $${pid})"; \
	    else \
	      echo "  已停止: $${app} (pid $${pid})"; \
	    fi; \
	    stopped=$$((stopped + 1)); \
	  else \
	    echo "  未在运行: $${app}（清理残留的 PID 文件）"; \
	  fi; \
	  rm -f "$${pidfile}"; \
	done; \
	if [ "$${stopped}" = 0 ]; then echo "  没有由 make up 起的 dev 服务在跑"; fi; \
	if command -v lsof >/dev/null 2>&1; then \
	  for port in $(DEV_PORTS); do \
	    holder="$$(lsof -ti "tcp:$${port}" -sTCP:LISTEN 2>/dev/null || true)"; \
	    if [ -n "$${holder}" ]; then \
	      echo "  ⚠️  端口 $${port} 仍被占用（pid: $$(echo $${holder} | tr '\n' ' ')），不是 make up 起的，没动它"; \
	    fi; \
	  done; \
	fi; \
	if [ -n "$(KEEP_DB)" ]; then echo "  KEEP_DB 已设置，Postgres 保持运行"; \
	else $(MAKE_CMD) --no-print-directory db-down; fi; \
	echo "✅ 停完了"

restart: ## 等价于 make down && make up
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	$(MAKE_CMD) --no-print-directory down KEEP_DB=1; \
	$(MAKE_CMD) --no-print-directory up

logs: ## 跟踪 .dev-logs 下的日志（make logs APP=server 只看一个）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	if [ -n "$(APP)" ]; then files="$(LOG_DIR)/$(APP).log"; else files="$$(ls "$(LOG_DIR)"/*.log 2>/dev/null || true)"; fi; \
	if [ -z "$${files}" ]; then echo "没有日志（先跑 make up）"; exit 0; fi; \
	tail -n 60 -f $${files}

ps: ## 看 make up 起的 dev 进程与端口占用
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	printf '%-12s %-8s %-8s %s\n' APP PID 状态 端口; \
	found=0; \
	for entry in $(APP_PORT_MAP); do \
	  app="$${entry%%=*}"; port="$${entry#*=}"; \
	  if [ -n "$(APP)" ] && [ "$(APP)" != "$${app}" ]; then continue; fi; \
	  found=1; \
	  pidfile="$(LOG_DIR)/$${app}.pid"; \
	  pid="$$( [ -f "$${pidfile}" ] && cat "$${pidfile}" || echo - )"; \
	  if [ "$${pid}" != - ] && kill -0 "$${pid}" 2>/dev/null; then state=运行中; else state=已停止; fi; \
	  if [ -z "$${port}" ]; then port=-; \
	  elif command -v lsof >/dev/null 2>&1 && lsof -ti "tcp:$${port}" -sTCP:LISTEN >/dev/null 2>&1; then port="$${port} (已监听)"; fi; \
	  printf '%-12s %-8s %-8s %s\n' "$${app}" "$${pid}" "$${state}" "$${port}"; \
	done; \
	if [ "$${found}" = 0 ]; then echo "（没有匹配的 app）"; fi

status: ## 一屏总览：后端 / 数据库 / dev 进程 / 访问地址
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	backend='$(DB_BACKEND_RESOLVED)'; \
	echo "Postgres 后端: $${backend}（DB_BACKEND=$(DB_BACKEND)）"; \
	if [ "$${backend}" = docker ]; then host=127.0.0.1; port=$(DOCKER_PG_PORT); else host=localhost; port=$(BREW_PG_PORT); fi; \
	if command -v pg_isready >/dev/null 2>&1 && pg_isready -q -h "$${host}" -p "$${port}" 2>/dev/null; then \
	  echo "Postgres $${host}:$${port}: 可连接"; \
	else \
	  echo "Postgres $${host}:$${port}: 连不上（make db-up）"; \
	fi; \
	echo; \
	$(MAKE_CMD) --no-print-directory ps; \
	echo; \
	echo "web    http://localhost:3001"; \
	echo "server http://localhost:3000"

##@ 数据库

# 起库并等它真的能接连接。`brew services start` / `docker compose up -d` 返回
# 得比 Postgres 接受连接早得多，紧接着跑迁移会撞上 ECONNREFUSED，所以中间那道
# db-wait 不能省，也不能拿 `sleep 5` 顶——慢机器上 5 秒不够，快机器上纯浪费。
db-up: ## 起 Postgres 并等到 ready
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	backend='$(DB_BACKEND_RESOLVED)'; \
	$(MAKE_CMD) --no-print-directory _backend-guard BACKEND="$${backend}"; \
	case "$${backend}" in \
	  docker) \
	    echo "▶ docker compose up -d postgres"; \
	    docker compose up -d postgres ;; \
	  brew) \
	    if ! command -v brew >/dev/null 2>&1; then \
	      echo "❌ DB_BACKEND=brew 但这台机器上没有 brew（Linux 上通常是 systemd 或 docker）。"; \
	      echo "   改用容器: make db-up DB_BACKEND=docker"; exit 1; \
	    fi; \
	    formula="$$(brew services list | awk '/^postgresql/ {print $$1; exit}')"; \
	    if [ -z "$${formula}" ]; then \
	      echo "❌ brew 里没装 postgresql。装一个: brew install postgresql@18"; exit 1; \
	    fi; \
	    echo "▶ brew services start $${formula}"; \
	    brew services start "$${formula}" >/dev/null ;; \
	esac; \
	$(MAKE_CMD) --no-print-directory db-wait

db-wait: ## 轮询 pg_isready 直到库可连接（超时见 PG_WAIT_TIMEOUT）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	backend='$(DB_BACKEND_RESOLVED)'; \
	if [ "$${backend}" = docker ]; then host=127.0.0.1; port=$(DOCKER_PG_PORT); user=postgres; \
	else host=localhost; port=$(BREW_PG_PORT); user="$$(id -un)"; fi; \
	printf '⏳ 等 Postgres (%s:%s) ready ' "$${host}" "$${port}"; \
	n=0; \
	while [ $${n} -lt $(PG_WAIT_TIMEOUT) ]; do \
	  if command -v pg_isready >/dev/null 2>&1; then \
	    if pg_isready -q -h "$${host}" -p "$${port}" -U "$${user}" 2>/dev/null; then printf ' ✅\n'; exit 0; fi; \
	  elif [ "$${backend}" = docker ]; then \
	    if docker compose exec -T postgres pg_isready -q -U postgres >/dev/null 2>&1; then printf ' ✅\n'; exit 0; fi; \
	  else \
	    printf '\n❌ 找不到 pg_isready（Homebrew 后端需要 postgresql 的客户端）。\n'; exit 1; \
	  fi; \
	  printf '.'; sleep 1; n=$$((n + 1)); \
	done; \
	printf '\n❌ 等了 $(PG_WAIT_TIMEOUT)s 仍连不上 %s:%s。\n' "$${host}" "$${port}"; \
	echo "   排查: make doctor / 后端是 $${backend}，端口对不对？（brew=5432 docker=5433）"; \
	exit 1

db-down: ## 停 Postgres（幂等）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	backend='$(DB_BACKEND_RESOLVED)'; \
	case "$${backend}" in \
	  docker) echo "▶ docker compose stop postgres"; docker compose stop postgres >/dev/null 2>&1 || true ;; \
	  brew) \
	    formula="$$(brew services list 2>/dev/null | awk '/^postgresql/ {print $$1; exit}')"; \
	    if [ -z "$${formula}" ]; then echo "  没有 brew 装的 postgresql，跳过"; \
	    else echo "▶ brew services stop $${formula}"; brew services stop "$${formula}" >/dev/null 2>&1 || true; fi ;; \
	  *) echo "  探测不到 Postgres 后端，没什么可停的" ;; \
	esac

# ⚠️ 必须绕开 turbo 直接调 drizzle-kit。
#
# turbo.json 把 @automationstack/db 的 db:migrate 标成了 `interactive: true`，
# 于是 `pnpm db:migrate` 在任何非 TTY 环境（CI、make 的后台 recipe、被重定向的
# 终端）里会直接失败：`Cannot run interactive task ... without Terminal UI`。
#
# `< /dev/null` 也是必需的：drizzle-kit 碰到需要人确认的改动会停下来等输入，
# 在 make up 这种「起完就走」的流程里那等于永久挂起。喂空输入让它当场失败，
# 失败是能看见的，挂起不是。
db-migrate: ## 应用迁移（直调 drizzle-kit，绕开 turbo 的 interactive 限制）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	echo "▶ 应用数据库迁移"; \
	pnpm --filter @automationstack/db exec drizzle-kit migrate < /dev/null

# 和 db-migrate 相反，这个**故意**保留 TTY：改了表名之类的时候 drizzle-kit
# 会问「这是重命名还是删了又建」，那个问题只能由人回答。同样绕开 turbo。
db-generate: ## 按 schema 变更生成迁移文件（会交互提问，需要终端）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm --filter @automationstack/db exec drizzle-kit generate

db-seed: ## 灌基础种子数据
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm db:seed

db-seed-admin: ## 灌管理员账号
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm db:seed-admin

db-seed-demo: ## 灌自动化演示数据
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm db:seed-automation-demo

db-studio: ## 打开 drizzle studio（前台，Ctrl-C 退出）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm --filter @automationstack/db exec drizzle-kit studio

# ⚠️ 破坏性：DROP DATABASE，库里的东西一个都不剩。
#
# 二次确认要求把**库名原样打出来**，而不是回一个 y。y 是肌肉记忆，抄一遍库名
# 至少保证你看清了要删的是哪个库——本地常年同时开着 Homebrew 那个和容器那个。
# 非交互场景（脚本里）走 CONFIRM=automationstack，显式到没法手滑。
db-reset: ## ⚠️ 删库重建并重跑迁移（需要二次确认）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	backend='$(DB_BACKEND_RESOLVED)'; \
	$(MAKE_CMD) --no-print-directory _backend-guard BACKEND="$${backend}"; \
	if [ "$${backend}" = docker ]; then host=127.0.0.1; port=$(DOCKER_PG_PORT); user=postgres; \
	else host=localhost; port=$(BREW_PG_PORT); user="$$(id -un)"; fi; \
	echo "⚠️  即将 DROP DATABASE $(PG_DB)（后端 $${backend}，$${host}:$${port}）"; \
	echo "   这会删掉所有本地数据，包括账号、项目、脑图、pg-boss 的任务队列。"; \
	confirm='$(CONFIRM)'; \
	if [ -z "$${confirm}" ]; then \
	  if [ -t 0 ]; then read -r -p "   要继续请原样输入库名（$(PG_DB)）: " confirm; \
	  else echo "❌ 非交互环境无法确认。要在脚本里跑: make db-reset CONFIRM=$(PG_DB)"; exit 1; fi; \
	fi; \
	if [ "$${confirm}" != "$(PG_DB)" ]; then echo "已取消（输入不匹配）"; exit 1; fi; \
	if [ "$${backend}" = docker ]; then \
	  docker compose exec -T postgres dropdb -U postgres --if-exists "$(PG_DB)"; \
	  docker compose exec -T postgres createdb -U postgres "$(PG_DB)"; \
	else \
	  dropdb -h "$${host}" -p "$${port}" -U "$${user}" --if-exists "$(PG_DB)"; \
	  createdb -h "$${host}" -p "$${port}" -U "$${user}" "$(PG_DB)"; \
	fi; \
	$(MAKE_CMD) --no-print-directory db-migrate; \
	echo "✅ 库已重建。要灌数据: make db-seed"

##@ 质量与排查

# 和 .github/workflows/ci.yml 的 check job 逐条对齐，包括那两条「列表非空」的
# 断言：三个门禁脚本都只认命令行传进来的文件，传空时 check-tailwind 与
# check-file-rules 会打印「没有文件需要检查」然后 exit 0——那是空跑不是通过，
# 而输出和真的全过一字不差。所以宁可在 glob 写错时响亮地红一次。
#
# $${files} 故意不加引号：这里要的就是按空白拆成多个参数（仓库内没有带空格的
# 路径）。zsh 下 $(...) 不做词分割，所以这一段必须在 bash 里跑——SHELL 已经
# 钉死成 /bin/bash 了。
check: ## 全量门禁：类型 / 单测 / 规约 / eslint / 三条仓库自有规则
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	echo "▶ 类型检查"; pnpm check-types; \
	echo "▶ 单元测试"; pnpm test; \
	echo "▶ 代码规约（Biome / Ultracite）"; pnpm check; \
	echo "▶ eslint（行数 / 复杂度）"; NODE_OPTIONS=--max-old-space-size=4096 pnpm eslint --no-cache .; \
	echo "▶ 仓库自有规则"; \
	files="$$(git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.cjs' '*.mjs' '*.cts' '*.mts')"; \
	pkg_files="$$(git ls-files '**/package.json' 'package.json')"; \
	if [ -z "$${files}" ]; then echo "❌ 源码文件列表为空，两个门禁会空跑成假绿"; exit 1; fi; \
	if [ -z "$${pkg_files}" ]; then echo "❌ package.json 列表为空，依赖版本白名单等于没跑"; exit 1; fi; \
	node scripts/check-tailwind.js $${files}; \
	node scripts/check-file-rules.js $${files}; \
	node scripts/check-package-json.js $${pkg_files}; \
	echo "▶ 门禁脚本自己的单测"; \
	node --test scripts/*.test.mjs eslint-rules/*.test.mjs

# 只读体检。**不打印任何 .env 的内容**，只报告文件在不在——那些文件里装着
# 数据库口令、会话密钥和凭据主密钥，体检报告是最容易被顺手贴进 issue 的东西。
doctor: ## 体检：工具版本 / 端口 / .env / 数据库连通性 / 迁移进度
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	echo "── 工具 ─────────────────────────────"; \
	for c in node pnpm docker brew psql pg_isready perl lsof openssl; do \
	  if command -v "$${c}" >/dev/null 2>&1; then \
	    v="$$($${c} --version 2>/dev/null | grep -m1 . || true)"; \
	    if [ -z "$${v}" ]; then v='已安装（不认 --version）'; fi; \
	    printf '  %-11s ✅ %s\n' "$${c}" "$${v}"; \
	  else \
	    printf '  %-11s —  未安装\n' "$${c}"; \
	  fi; \
	done; \
	printf '  %-11s ✅ %s\n' make "$$(make --version | head -1)"; \
	echo; \
	echo "── Postgres 后端 ────────────────────"; \
	backend='$(DB_BACKEND_RESOLVED)'; \
	echo "  DB_BACKEND=$(DB_BACKEND) → 解析为: $${backend}"; \
	if [ "$${backend}" = none ]; then \
	  echo "  ❌ 既没有可用的 docker daemon，也没有 brew 装的 postgresql"; \
	  echo "     装一个: brew install postgresql@18   或者装 Docker Desktop"; \
	fi; \
	if [ "$${backend}" = docker ]; then host=127.0.0.1; port=$(DOCKER_PG_PORT); else host=localhost; port=$(BREW_PG_PORT); fi; \
	echo; \
	echo "── 端口 ─────────────────────────────"; \
	for p in 3000 3001 $(DEV_PORTS) $(BREW_PG_PORT) $(DOCKER_PG_PORT); do \
	  if command -v lsof >/dev/null 2>&1; then \
	    holder="$$(lsof -ti "tcp:$${p}" -sTCP:LISTEN 2>/dev/null | head -1 || true)"; \
	    if [ -n "$${holder}" ]; then printf '  %-6s 占用中 (pid %s: %s)\n' "$${p}" "$${holder}" "$$(ps -o comm= -p "$${holder}" 2>/dev/null || echo '?')"; \
	    else printf '  %-6s 空闲\n' "$${p}"; fi; \
	  else printf '  %-6s ?（没有 lsof）\n' "$${p}"; fi; \
	done | sort -u; \
	echo; \
	echo "── 环境变量文件（只看在不在，不看内容）──"; \
	for f in .env apps/server/.env apps/web/.env; do \
	  if [ -f "$(ROOT_DIR)/$${f}" ]; then printf '  %-20s ✅ 存在\n' "$${f}"; else printf '  %-20s —  缺失\n' "$${f}"; fi; \
	done; \
	if [ ! -f "$(ENV_SERVER)" ] || [ ! -f "$(ENV_WEB)" ]; then echo "  → 补齐: make setup"; fi; \
	echo; \
	echo "── 数据库 ───────────────────────────"; \
	if command -v pg_isready >/dev/null 2>&1 && pg_isready -q -h "$${host}" -p "$${port}" 2>/dev/null; then \
	  echo "  $${host}:$${port} ✅ 接受连接"; \
	  total="$$(ls "$(ROOT_DIR)"/packages/db/src/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')"; \
	  applied="$$(psql -X -A -t -h "$${host}" -p "$${port}" -d "$(PG_DB)" -c 'select count(*) from drizzle."__drizzle_migrations"' 2>/dev/null | tr -d ' ' || true)"; \
	  if [ -z "$${applied}" ]; then \
	    echo "  迁移: 读不到 drizzle.__drizzle_migrations（库不存在、连不上、或一次都没迁过）"; \
	    echo "        → make db-migrate"; \
	  elif [ "$${applied}" = "$${total}" ]; then \
	    echo "  迁移: ✅ $${applied}/$${total} 已应用"; \
	  elif [ "$${applied}" -gt "$${total}" ]; then \
	    echo "  迁移: ⚠️  库里已应用 $${applied} 条，仓库里只有 $${total} 条——库比当前分支新"; \
	    echo "        （多半是别的分支在同一个库上迁过。别跑 db-migrate，先确认你在哪个分支）"; \
	  else \
	    echo "  迁移: ⚠️  已应用 $${applied}，仓库里有 $${total} → make db-migrate"; \
	  fi; \
	else \
	  echo "  $${host}:$${port} —  连不上（make db-up）"; \
	fi; \
	echo; \
	echo "── dev 服务 ─────────────────────────"; \
	$(MAKE_CMD) --no-print-directory ps

# 只清可再生的东西。**不碰 node_modules**（重装一次几分钟，而这个目标常被当成
# 「随手清一下」用），更不碰任何 .env。要重装依赖是 rm -rf node_modules + make install。
clean: ## 清构建产物、缓存与 .dev-logs（不动 node_modules 和 .env）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	for pidfile in "$(LOG_DIR)"/*.pid; do \
	  [ -f "$${pidfile}" ] || continue; \
	  pid="$$(cat "$${pidfile}" 2>/dev/null || true)"; \
	  if [ -n "$${pid}" ] && kill -0 "$${pid}" 2>/dev/null; then \
	    echo "❌ 还有 dev 服务在跑（pid $${pid}）。先 make down，否则清掉 PID 文件就再也停不掉它了。"; exit 1; \
	  fi; \
	done; \
	rm -rf "$(LOG_DIR)" "$(ROOT_DIR)/.turbo" "$(ROOT_DIR)/.eslintcache" "$(ROOT_DIR)/coverage"; \
	find "$(ROOT_DIR)/apps" "$(ROOT_DIR)/packages" -maxdepth 2 \( -name dist -o -name .turbo -o -name '*.tsbuildinfo' \) -exec rm -rf {} + 2>/dev/null || true; \
	echo "✅ 清完了（node_modules 和 .env 没动）"

# ── 内部目标（不出现在 help 里）─────────────────────────────────────────────

# 后端探测失败时统一的报错出口。放成一个目标而不是复制三遍，是因为这段话
# 需要在 setup / db-up / db-reset 三处一字不差。
_backend-guard:
	@set -euo pipefail; \
	case "$(BACKEND)" in \
	  brew|docker) : ;; \
	  unknown) \
	    echo "❌ DB_BACKEND=$(DB_BACKEND) 不认识，只能是 brew / docker / auto"; exit 1 ;; \
	  *) \
	    echo "❌ 探测不到可用的 Postgres 后端。"; \
	    echo "   探测顺序: 1) docker 命令存在且 docker info 能通"; \
	    echo "             2) brew services list 里有 postgresql"; \
	    echo "   两条都不满足。装一个再来:"; \
	    echo "     brew install postgresql@18   （宿主机，端口 5432）"; \
	    echo "     或装 Docker Desktop           （容器，宿主机端口 5433）"; \
	    echo "   已经装了但探测不到，就显式指定: make <target> DB_BACKEND=brew"; \
	    exit 1 ;; \
	esac
