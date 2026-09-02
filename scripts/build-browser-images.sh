#!/usr/bin/env bash
# 构建 farm 用的浏览器镜像（plan §6）。v1 手动跑，不进 CI：
# 构建需要 docker daemon 与几百 MB 的 apt 下载，那个成本先不背。
#
# ⚠️ 镜像必须存在于 **farm 所连的那台 daemon** 上（FARM_DOCKER_HOST 指向谁就是谁）。
# farm 起的浏览器容器是 compose 之外的 sibling 裸容器，由宿主 daemon 创建，
# 不走 compose 的镜像视图——所以这个脚本是宿主侧的部署步骤，不是 compose 的一部分。
#
# 用法：
#   scripts/build-browser-images.sh            # 构建并打 :latest + :<chromium 主版本>
#   BROWSER_IMAGE_NAME=my/chromium scripts/build-browser-images.sh
set -euo pipefail

IMAGE_NAME="${BROWSER_IMAGE_NAME:-automationstack-browser-chromium}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTEXT="$REPO_ROOT/docker/browsers/chromium"

if ! command -v docker >/dev/null 2>&1; then
	echo "找不到 docker 命令：这个脚本要在能访问目标 daemon 的机器上跑" >&2
	exit 1
fi

echo "==> 构建 $IMAGE_NAME:latest（上下文 $CONTEXT）"
docker build --tag "$IMAGE_NAME:latest" "$CONTEXT"

# 主版本号从**镜像里实际装上的** chromium 问出来，而不是从任何配置里读：
# 版本由 apt 决定（见 Dockerfile 的注释），任何写死在仓库里的版本号都会过期，
# 而过期的 tag 比没有 tag 更坏——farm_browsers.image 会指向一个名不副实的镜像。
FULL_VERSION="$(docker run --rm --entrypoint chromium "$IMAGE_NAME:latest" --version | awk '{print $2}')"
MAJOR_VERSION="${FULL_VERSION%%.*}"

if [ -z "$MAJOR_VERSION" ]; then
	echo "没能从镜像里问出 chromium 版本，不打版本 tag（:latest 已经构建好了）" >&2
	exit 1
fi

echo "==> chromium $FULL_VERSION，附加 tag $IMAGE_NAME:$MAJOR_VERSION"
docker tag "$IMAGE_NAME:latest" "$IMAGE_NAME:$MAJOR_VERSION"

# chromedriver 的版本单独打一行出来：它与 chromium 对不上是这套东西最典型的
# 故障（表现为 create-session 直接失败），构建完当场确认一次最省事。
DRIVER_VERSION="$(docker run --rm --entrypoint chromedriver "$IMAGE_NAME:latest" --version | awk '{print $2}')"

echo
echo "构建完成："
echo "  镜像        $IMAGE_NAME:latest, $IMAGE_NAME:$MAJOR_VERSION"
echo "  chromium    $FULL_VERSION"
echo "  chromedriver $DRIVER_VERSION"
echo
echo "冒烟（可选）："
echo "  docker run --rm -d -e MODE=webdriver -P --shm-size=2g $IMAGE_NAME:latest  # 然后 curl <host:port>/status"
echo "  docker run --rm -d -e MODE=cdp -P --shm-size=2g $IMAGE_NAME:latest        # 然后 curl <host:port>/json/version"
