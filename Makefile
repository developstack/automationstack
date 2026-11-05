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
#   make up      后台起全套（自动补齐 .env → Postgres → 迁移 → dev 服务），日志落到 .dev-logs/
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
# make up:prod 使用的生产 env 文件。默认在仓库根目录，不进 git。
# 用其他路径：make up:prod PROD_ENV=/etc/automationstack/prod.env
PROD_ENV ?= $(ROOT_DIR)/.env.prod

PG_DB := automationstack
# Homebrew 的 Postgres 监听 5432；compose 那个刻意映射到 5433，就是为了不和
# 前者撞车（docker-compose.yml 的 postgres.ports 有完整解释）。两个端口对应
# 两套连接参数，`make setup` 生成 DATABASE_URL 时必须跟着后端走。
BREW_PG_PORT := 5432
DOCKER_PG_PORT := 5433
# 等库 ready 的秒数上限。冷启动的容器要跑 initdb，比宿主机上那个慢得多。
PG_WAIT_TIMEOUT := 60

LOG_DIR := $(ROOT_DIR)/.dev-logs
# 相对路径按 make 的工作目录解析。compose 的 env_file 按 compose 文件的目录解析，
# 两者可能不同，所以传给 compose 的一律是绝对路径。
PROD_ENV_FILE := $(abspath $(PROD_ENV))
PROD_ENV_TEMPLATE := $(ROOT_DIR)/.env.prod.example
# --env-file 展开 docker-compose.prod.yml 中的 ${...}；PROD_ENV_FILE 给 server 和 migrate 的 env_file。
# 给了 --env-file 时，compose 不读取根目录的 .env（那是本地开发的文件）。
PROD_COMPOSE = PROD_ENV_FILE="$(PROD_ENV_FILE)" docker compose --project-directory "$(ROOT_DIR)" -f "$(ROOT_DIR)/docker-compose.prod.yml" --env-file "$(PROD_ENV_FILE)"
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
	db-up db-down db-wait db-migrate db-generate db-seed db-seed-admin db-reset-password db-auth-set-local \
	db-seed-demo db-studio db-reset casdoor-up casdoor-down casdoor-bootstrap \
	check doctor clean _backend-guard _env _prod-force

.DEFAULT_GOAL := help

##@ 上手

# 自文档化：说明直接从目标后面的 `## ` 注释里抓，加目标就等于加文档，
# 不存在「加了目标忘了更新 help」这种漂移。
# awk 的 FS 用 `:.*## ` 而不是常见的 `:.*?## `：非贪婪 `?` 是 PCRE 的写法，
# macOS 自带的 awk（one true awk）只认 POSIX ERE，那里的 `*?` 行为未定义。
# 目标名中转义的冒号（`up\:prod`）先换成 \001，截掉第一个冒号后的内容，再换回 `:`。
help: ## 显示本说明（默认目标）
	@printf '\n\033[1mautomationstack 本地开发\033[0m\n'
	@printf '用法: make <target> [VAR=value]\n'
	@awk 'BEGIN {FS = ":.*## "} /^##@ / {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)} /^[a-zA-Z0-9_-]+(\\:[a-zA-Z0-9_-]+)*:.*## / {name = $$0; gsub(/\\:/, "\001", name); sub(/:.*/, "", name); gsub(/\001/, ":", name); printf "  \033[36m%-14s\033[0m %s\n", name, $$2}' $(MAKEFILE_LIST)
	@printf '\n\033[1m可覆盖的变量\033[0m\n'
	@printf '  \033[36m%-14s\033[0m %s\n' 'DB_BACKEND' 'brew | docker | auto（当前: $(DB_BACKEND)）'
	@printf '  \033[36m%-14s\033[0m %s\n' 'KEEP_DB' '非空时 make down 不停 Postgres'
	@printf '  \033[36m%-14s\033[0m %s\n' 'APP' 'make logs / ps 只看某个 app'
	@printf '  \033[36m%-14s\033[0m %s\n' 'CONFIRM' 'make db-reset 的非交互确认'
	@printf '  \033[36m%-14s\033[0m %s\n' 'PROD_ENV' 'make up:prod 的生产 env 文件（默认 .env.prod）'
	@printf '\n检测到的 dev 服务: $(DEV_APPS)\n\n'

install: ## 安装依赖（pnpm install）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	echo "▶ pnpm install"; \
	pnpm install

# setup 是「新人一键上手」的入口：补齐缺失的 .env（复用 _env，直接 cp 模板）+ 装依赖。
setup: ## 首次配置：补齐 .env + 装依赖（已存在的一律跳过）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	$(MAKE_CMD) --no-print-directory _env; \
	if [ -d "$(ROOT_DIR)/node_modules" ]; then echo "▶ node_modules 已存在，跳过 install（要重装跑 make install）"; \
	else $(MAKE_CMD) --no-print-directory install; fi; \
	echo "✅ setup 完成。下一步: make up（后台）或 make dev（前台）"

##@ 起停

# 前台跑 turbo dev。日常开发用这个：热重载、日志直接在眼前、Ctrl-C 收工。
# 和 `make up` 的分工是「要不要看日志」，不是「哪个更正式」。
dev: ## 前台跑 pnpm dev（turbo，热重载）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm dev

# 后台起全套。起库之前先跑一遍 _env 把缺失的 .env 自动补齐（幂等，已存在的不动），
# 之后四步有序、中间任何一步失败都不往下走：
#   .env 就绪 → Postgres 起来 → 真的 ready（轮询 pg_isready，不是 sleep 5）→ 迁移 → dev 服务
#
# 为什么按包起而不是 `pnpm dev`（turbo）：turbo.json 里 ui 是 "tui"，把它塞进
# 后台重定向到文件会得到一坨终端控制序列；而且 turbo 只有一个 PID，停的时候
# 分不出是谁没退。按包起换来每个 app 一份独立日志和一个独立 PID。
#
# 每个进程用 perl 的 setsid 拉到**自己的进程组**里再 exec，记下来的 PID 同时
# 就是 PGID。这样 `make down` 能 `kill -TERM -PID` 端掉整棵进程树（pnpm →
# tsx/vite → esbuild 至少三层），而不是杀掉 pnpm 留下一堆还占着端口的孤儿。
# 没有 perl 的机器退化成直接起 + 停的时候多走一遍 pkill -P，见 down。
up: ## 后台起全套：自动补齐 .env → Postgres → 迁移 → dev 服务（日志在 .dev-logs/）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	$(MAKE_CMD) --no-print-directory _env; \
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
	if command -v pg_isready >/dev/null 2>&1; then \
	  if pg_isready -q -h "$${host}" -p "$${port}" 2>/dev/null; then echo "Postgres $${host}:$${port}: 可连接"; \
	  else echo "Postgres $${host}:$${port}: 连不上（make db-up）"; fi; \
	elif [ "$${backend}" = docker ]; then \
	  if docker compose exec -T postgres pg_isready -q -U postgres >/dev/null 2>&1; then echo "Postgres $${host}:$${port}: 可连接"; \
	  else echo "Postgres $${host}:$${port}: 连不上（make db-up）"; fi; \
	else \
	  echo "Postgres $${host}:$${port}: 无法探测（宿主机缺 pg_isready；brew 后端请装 postgresql 客户端）"; \
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

# USER 必须写在命令行上，理由同 db-reset-password。
# 密码只经环境变量 NEW_PASSWORD 传给脚本，不进入命令参数（命令参数在进程列表中可见）。
# 命令行上的 PASS 由 make 导出到 recipe 的环境，这里用 $$PASS 读取，不展开成 $(PASS)。
# 只认命令行上的 PASS：shell 环境里碰巧有 PASS 时不使用它。
# 也可以不写 PASS，直接设置环境变量 NEW_PASSWORD；都不设置时随机生成。
db-seed-admin: ## 灌管理员账号（USER=用户名；密码用 PASS= 或环境变量 NEW_PASSWORD，省略则随机生成并只打印一次）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	if [ "$(origin USER)" != "command line" ]; then \
		echo "用法：make db-seed-admin USER=<用户名> [PASS=<密码>]（也可以用环境变量 NEW_PASSWORD 传密码，省略则随机生成）" >&2; \
		exit 1; \
	fi; \
	$(if $(filter command line,$(origin PASS)),export NEW_PASSWORD="$$PASS"; )\
	pnpm db:seed-admin "$(USER)"

# USER 必须写在命令行上：环境里本来就有 USER（当前系统用户名），
# 不检查来源的话，漏写 USER= 会去重置一个同名账号。
# 新密码用环境变量 NEW_PASSWORD 传入，不要写成 make 参数。
db-reset-password: ## 重置本地账号密码（USER=用户名；NEW_PASSWORD 省略则随机生成并只打印一次）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	if [ "$(origin USER)" != "command line" ]; then \
		echo "用法：make db-reset-password USER=<用户名>（新密码用环境变量 NEW_PASSWORD 传入，省略则随机生成）" >&2; \
		exit 1; \
	fi; \
	pnpm db:reset-password "$(USER)"

# Casdoor 配置错误、所有人都不能登录时使用。只修改认证方式，不修改用户和密码。
db-auth-set-local: ## 把认证方式改回 local（写修改记录和 [审计] 日志）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	pnpm db:auth-set-local

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

##@ Casdoor（可选，plan 021）

# 本地 Casdoor 只用于调试 Casdoor 认证模式。make up 不启动它（plan 021 D10）。
# 它只能用 docker 启动，并且使用 compose 中的 postgres 容器（宿主机端口 5433）。
# 宿主机端口 8100：8000 常被其他项目的 Casdoor 占用。
CASDOOR_PORT := 8100
# 第一次启动要创建全部表，比 Postgres 慢。
CASDOOR_WAIT_TIMEOUT := 120

# 先创建角色 casdoor 和库 casdoor，再启动 Casdoor。与生产相同，不使用 -createDatabase。
# 角色和库已经存在时跳过，不修改已有角色的口令，不碰 automationstack 库。
# 口令取环境变量 CASDOOR_DB_PASSWORD，默认值与 docker-compose.yml 相同，只用于本地。
# 口令通过标准输入传给 psql，不出现在进程参数中。口令中不能有单引号。
# make down 会停止 postgres。这时 Casdoor 连不上库并反复重启，先 make casdoor-down。
casdoor-up: ## 起本地 Casdoor（http://localhost:8100），按需创建 casdoor 库
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then \
	  echo "❌ 本地 Casdoor 只能用 docker 启动，这台机器上 docker 不可用"; exit 1; \
	fi; \
	pw="$${CASDOOR_DB_PASSWORD:-casdoor-dev-only}"; \
	case "$${pw}" in *"'"*) echo "❌ CASDOOR_DB_PASSWORD 中不能有单引号"; exit 1 ;; esac; \
	echo "▶ docker compose up -d postgres"; \
	docker compose up -d postgres; \
	$(MAKE_CMD) --no-print-directory db-wait DB_BACKEND=docker; \
	echo "▶ 创建角色 casdoor 和库 casdoor（已存在则跳过）"; \
	printf '%s\n' \
	  "\\set pw '$${pw}'" \
	  "SELECT format('CREATE ROLE casdoor LOGIN PASSWORD %L', :'pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'casdoor') \\gexec" \
	  "SELECT 'CREATE DATABASE casdoor OWNER casdoor' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'casdoor') \\gexec" \
	  | docker compose exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; \
	echo "▶ docker compose --profile casdoor up -d casdoor"; \
	docker compose --profile casdoor up -d casdoor; \
	printf '⏳ 等 Casdoor (127.0.0.1:$(CASDOOR_PORT)) ready '; \
	n=0; \
	while [ $${n} -lt $(CASDOOR_WAIT_TIMEOUT) ]; do \
	  if curl -fsS -o /dev/null "http://127.0.0.1:$(CASDOOR_PORT)/api/health" 2>/dev/null; then \
	    printf ' ✅\n'; \
	    echo "✅ Casdoor: http://localhost:$(CASDOOR_PORT)（内置管理员 admin / 123，只用于本地）"; \
	    echo "   配置组织、应用和角色: make casdoor-bootstrap"; \
	    exit 0; \
	  fi; \
	  printf '.'; sleep 1; n=$$((n + 1)); \
	done; \
	printf '\n❌ 等了 $(CASDOOR_WAIT_TIMEOUT)s 仍连不上 Casdoor。看日志: docker compose --profile casdoor logs casdoor\n'; \
	exit 1

# 只停止容器，不删除容器和 casdoor 库，下次 casdoor-up 时配置还在。
casdoor-down: ## 停本地 Casdoor（保留 casdoor 库中的配置）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	echo "▶ docker compose --profile casdoor stop casdoor"; \
	docker compose --profile casdoor stop casdoor; \
	echo "✅ Casdoor 已停止。postgres 没动"

# 在本地 Casdoor 中创建 automationstack 的组织、应用、角色和测试用户。可以重复运行。
# 详见 scripts/casdoor-dev-bootstrap.sh 开头的说明。
casdoor-bootstrap: ## 在本地 Casdoor 中创建 automationstack 组织、应用、角色和测试用户（幂等）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	CASDOOR_ORGANIZATION=automationstack CASDOOR_URL="http://localhost:$(CASDOOR_PORT)" scripts/casdoor-dev-bootstrap.sh

##@ 单机生产部署（数据库在外部机器上）

# 在一台服务器上用 docker compose 运行生产构建，配置见 docker-compose.prod.yml 与 .env.prod.example。
# nginx 是唯一的入口，前端和后端使用同一个域名，所以没有跨域请求。域名由阿里云的 DNS 指向本服务器。
# 集群上的正式生产环境不用这些目标，它由 developstack/k8s-gitops 管理。
#
# 每次执行同样的步骤，任何一步失败都不往下走：
#   1. 合并并检查 .env.prod。图片目录（FILES_HOST_DIR）不存在时，创建它。
#   2. 构建镜像。迁移在 server 镜像中执行，所以构建在迁移之前。
#      每次都构建：前端地址写在 web 镜像中，代码或域名改变后不构建就不生效。
#      docker 有构建缓存，没有改变的层不重新构建。
#   3. 预检外部库，然后执行迁移（SQL）。这一步在启动或替换任何服务之前。
#      它失败时，正在运行的旧服务不变。
#   4. 启动 server、web、nginx 和 certbot，等到 healthy。
#   5. 没有证书时，向 Let's Encrypt 申请。然后 nginx 选择站点配置并 reload：有证书时使用 HTTPS。
#
# 目标名中的冒号必须写成 `\:`。GNU Make 3.81 的 .PHONY 不认这种名字，
# 所以用 phony 目标 _prod-force 作为前置依赖：仓库中有同名文件时，目标也照样执行。
up\:prod: _prod-force ## 单机生产部署：合并 .env.prod → 构建 → 迁移外部库 → 启动 → HTTPS 证书
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then \
	  echo "❌ docker 不可用：没有安装，或 daemon 没有运行。"; exit 1; \
	fi; \
	bash scripts/prod-env.sh "$(PROD_ENV_TEMPLATE)" "$(PROD_ENV_FILE)"; \
	files_dir="$$(sed -n 's/^FILES_HOST_DIR=//p' "$(PROD_ENV_FILE)" | tail -n 1 | tr -d "\"' ")"; \
	files_dir="$${files_dir:-/data/automationstack/files}"; \
	if [ ! -d "$$files_dir" ]; then \
	  echo "▶ 创建图片目录 $$files_dir"; \
	  mkdir -p "$$files_dir" || { echo "❌ 不能创建 $$files_dir。执行 sudo mkdir -p $$files_dir，或在 .env.prod 中修改 FILES_HOST_DIR。"; exit 1; }; \
	fi; \
	echo "▶ 图片目录：$$files_dir"; \
	echo "▶ 构建镜像"; \
	$(PROD_COMPOSE) build; \
	echo "▶ 预检外部库并执行迁移（SQL）"; \
	$(PROD_COMPOSE) run --rm migrate; \
	echo "▶ 启动服务，等到 healthy"; \
	if ! $(PROD_COMPOSE) up -d --wait server web nginx certbot; then \
	  echo "❌ 服务没有全部变为 healthy。最近的日志："; \
	  $(PROD_COMPOSE) logs --tail 50 server web nginx || true; \
	  exit 1; \
	fi; \
	echo "▶ 检查 HTTPS 证书"; \
	$(PROD_COMPOSE) run --rm --no-deps --entrypoint sh certbot /opt/automationstack/ensure-cert.sh; \
	$(PROD_COMPOSE) exec -T nginx sh -c '/docker-entrypoint.d/40-automationstack-select-site.sh && nginx -s reload'; \
	$(PROD_COMPOSE) ps; \
	domain="$$(sed -n 's/^DOMAIN=//p' "$(PROD_ENV_FILE)" | tail -n 1 | tr -d "\"' ")"; \
	echo "✅ 已启动：https://$${domain}   日志: make logs:prod   停止: make down:prod"

# 一键更新：只快进地拉取当前分支，然后执行 make up:prod。
# 工作区有未提交的修改时停止：服务器上的代码必须与仓库相同。.env.prod 不进 git，不受影响。
deploy\:prod: _prod-force ## 一键更新并部署：git pull（只快进）→ make up:prod
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	if [ -n "$$(git status --porcelain --untracked-files=no)" ]; then \
	  echo "❌ 工作区有未提交的修改。先处理它们，再部署："; git status --short --untracked-files=no; exit 1; \
	fi; \
	echo "▶ 更新代码：$$(git rev-parse --abbrev-ref HEAD)"; \
	git pull --ff-only; \
	$(MAKE_CMD) --no-print-directory up:prod PROD_ENV="$(PROD_ENV)"

down\:prod: _prod-force ## 停止并删除单机生产部署的容器（不删除镜像、证书、图片和数据库）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	$(PROD_COMPOSE) down

logs\:prod: _prod-force ## 跟踪单机生产部署的日志（make logs:prod APP=server 只看一个）
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	$(PROD_COMPOSE) logs -f --tail 100 $(APP)

_prod-force:

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

# 后端探测失败时统一的报错出口。放成一个目标而不是复制两份，是因为这段话
# 需要在 db-up / db-reset 两处一字不差。
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

# 把缺失的 .env 从同名 .env.example 直接复制过来，**永远不会覆盖已有的文件**。
#
# apps/server/.env 和 apps/web/.env 里装的是会话密钥和数据库凭据主密钥
# （SECRET_ENCRYPTION_KEY 一旦换掉，库里所有已存的第三方凭据就解不开了，
# 见 packages/env/src/server.ts）。所以判定只有一条：文件在 = 跳过，不备份、
# 不追加、不改一个字节；文件不在才 cp。重复跑必须完全幂等——这是「新人一键
# 上手」和「老机器别被搞坏」的唯一交集。
#
# ⚠️ 正因如此，.env.example 里的值必须是**直接可用的本地开发默认值**，不能留空。
#
# setup 和 up 都调它：up 在起库之前先补一遍，于是「忘了先跑 make setup」
# 这种新人必经的坑直接消失——up 自己会补齐。
_env:
	@set -euo pipefail; cd "$(ROOT_DIR)"; \
	echo "▶ 检查 .env"; \
	for f in .env apps/server/.env apps/web/.env; do \
	  if [ -f "$$f" ]; then echo "  已存在，跳过: $$f"; \
	  else cp "$$f.example" "$$f"; echo "  已从 $$f.example 生成: $$f"; fi; \
	done
