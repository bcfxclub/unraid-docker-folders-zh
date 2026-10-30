# Unraid Docker Folders · Unraid Docker 文件夹

> **English** | **中文**

An Unraid plugin that adds folder organization to the Docker tab with real-time
updates and a clean Vue 3 interface. This edition (**`-zh`**) is a Chinese-localized
fork: the plugin UI is fully translated to Simplified Chinese, while this README is
provided in both English and 中文.

一款为 Unraid「Docker」标签页增加**文件夹分组**功能的插件，具备实时更新能力与清爽的
Vue 3 界面。本分支（**`-zh`**）为中文汉化版：插件界面已完整翻译为简体中文，同时本说明文档
提供**英文 + 中文**双语对照。

---

## Introduction · 简介

**English**
Organize your Unraid Docker containers into folders — just like bookmark folders in
a browser. Group related containers, drag them between folders, get live CPU/memory
stats, manage images and Compose stacks, all from a single tab. Built with Vue 3 and
a PHP backend, it plugs straight into Unraid's webGUI with real-time WebSocket updates.

**中文**
像浏览器书签夹一样，把 Unraid 上的 Docker 容器整理进文件夹。将相关容器归类、在文件夹之间
拖拽排序、实时查看 CPU/内存占用、管理镜像与 Compose 项目，全部在一个标签页内完成。插件基于
Vue 3 与 PHP 后端开发，直接接入 Unraid 的 webGUI，并通过 WebSocket 实现实时刷新。

---

## Features · 功能特性

### Organization · 分组整理
- **Folders** — Group Docker containers into customizable folders with icons and colors.
- **Drag & Drop** — Organize containers by dragging them between folders (SortableJS).
- **Compose Stack Grouping** — Auto-group containers belonging to the same Docker Compose project.
- **Grid and List Views** — Switch between layout modes.
- **Container Search** — Filter by name or image in real-time; folders auto-expand to show matches.
- **Import / Export** — Back up and share folder configurations as JSON.

- **文件夹** — 用图标和颜色把容器归类到自定义文件夹中。
- **拖拽排序** — 在文件夹之间拖动容器来整理排序（基于 SortableJS）。
- **Compose 项目自动分组** — 自动将同一 Docker Compose 项目下的容器归为一组。
- **网格 / 列表视图** — 自由切换布局模式。
- **容器搜索** — 按名称或镜像实时过滤，匹配的文件夹会自动展开。
- **导入 / 导出** — 以 JSON 形式备份和分享文件夹配置。

### Container Management · 容器管理
- **Container Actions** — Start, stop, restart, and remove containers directly from the folder view.
- **Image Updates** — Check for available image updates, review release notes, and pull one or many at once.
- **Compose Management** — Edit and apply Docker Compose files from the UI, with version history.
- **Schedules** — Run container actions on a cron schedule.
- **Backups** — Automatic backups of folder and plugin configuration.

- **容器操作** — 在文件夹视图中直接启动、停止、重启、删除容器。
- **镜像更新** — 检查可用镜像更新、查看更新说明，并可一次性拉取单个或多个容器。
- **Compose 管理** — 在界面内编辑并应用 Docker Compose 文件，自带版本历史。
- **计划任务** — 通过 cron 表达式按计划自动执行容器操作。
- **自动备份** — 自动备份文件夹与插件配置。

### Live Data · 实时数据
- **Live Resource Stats** — CPU, memory, I/O, network, PIDs, restart count, uptime, image/log size for running containers.
- **Container Logs** — Stream logs from an expanded container card.
- **Real-Time Updates** — WebSocket integration via Unraid's nchan server — all open tabs update instantly.
- **Polling Fallback** — 30-second polling catches external changes (CLI, Portainer, etc.).
- **CSRF Integration** — Properly authenticated against Unraid's webGUI security.

- **实时资源监控** — 运行中容器的 CPU、内存、I/O、网络、进程数、重启次数、运行时长、镜像/日志大小。
- **容器日志** — 在展开的容器卡片中实时流式查看日志。
- **实时更新** — 通过 Unraid 的 nchan 服务实现 WebSocket 推送，所有打开的标签页同步刷新。
- **轮询兜底** — 30 秒轮询捕捉外部变更（命令行、Portainer 等）。
- **CSRF 校验** — 符合 Unraid webGUI 安全机制的身份认证。

---

## Technology Stack · 技术栈

- **Frontend** — Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS 4
- **Backend** — PHP 8.0+ with SQLite3
- **Real-time** — nchan WebSocket pub/sub
- **Drag & Drop** — SortableJS

---

## Installation · 安装方法

### Option 1 — Community Applications · 通过应用市场
**English**
Search for **Docker Folders** in the **Apps** tab of the Unraid webGUI and install it.

**中文**
在 Unraid webGUI 的 **Apps（应用）** 标签页搜索 **Docker Folders** 并安装。

### Option 2 — Install by URL · 通过 URL 安装
**English**
1. Go to **Plugins** → **Install Plugin** in Unraid.
2. Paste the URL below and click **Install**:
   ```
   https://raw.githubusercontent.com/bcfxclub/unraid-docker-folders-zh/main/unraid-docker-folders-modern.plg
   ```
3. A **Folders** tab appears under **Docker** in the Unraid menu.

Past versions are available on the [Releases](https://github.com/bcfxclub/unraid-docker-folders-zh/releases) page.

**中文**
1. 在 Unraid 中进入 **Plugins（插件）** → **Install Plugin（安装插件）**。
2. 粘贴下面的 URL 并点击 **Install（安装）**：
   ```
   https://raw.githubusercontent.com/bcfxclub/unraid-docker-folders-zh/main/unraid-docker-folders-modern.plg
   ```
3. 安装完成后，Unraid 菜单 **Docker** 下会出现一个 **Folders（文件夹）** 标签页。

历史版本可在 [Releases](https://github.com/bcfxclub/unraid-docker-folders-zh/releases) 页面获取。

### Option 3 — Build from Source · 从源码构建
```bash
# Frontend build / 前端构建
cd src/frontend && yarn install --frozen-lockfile && yarn build

# Package the plugin (development build) / 打包插件（开发版）
./build/build.sh

# Output: archive/unraid-docker-folders-modern-<version>.txz
```

Releases are cut automatically by GitHub Actions on push to `main` (stable) or
`dev` (prerelease).

**中文**：推送至 `main` 分支（稳定版）或 `dev` 分支（预发布版）时，GitHub Actions 会自动
执行 `./build/build.sh --release`，完成前端构建、打包 `.txz`、更新 `.plg`、打标签并发布
GitHub Release。

> **Note · 提示**：After installing or updating, do a **hard refresh** (Ctrl/Cmd + Shift + R)
> of the Unraid webGUI to clear cached assets.
> **安装或更新后，请对 Unraid webGUI 做一次强制刷新（Ctrl/Cmd + Shift + R）**，以清除缓存的旧资源。

---

## Usage · 使用方法

**English**
1. Open the **Docker** tab in Unraid, then click the **Folders** subtab.
2. **Create a folder** — click *Add Folder*, give it a name, and pick an icon and color.
3. **Add containers** — drag a container card into a folder; or drop it back to "Ungrouped" to remove it.
4. **Auto-group Compose stacks** — containers from the same `docker-compose` project are grouped automatically; rename the group as needed.
5. **Search** — type in the search box to filter by container name or image; matching folders expand automatically.
6. **Switch layout** — toggle between **Grid** and **List** views from the header.
7. **Manage a container** — expand a card to Start / Stop / Restart / Remove, view live stats and logs, or open its WebUI.
8. **Update images** — use *Check for Updates* to see available image updates, read release notes, and pull updates (one or many at once).
9. **Edit Compose** — open a stack's Compose editor to modify and apply the file, with version history.
10. **Schedules** — set a cron schedule to auto-run container actions (e.g. nightly restart).
11. **Back up** — use *Import / Export* to save your folder layout as JSON and restore it later.

**中文**
1. 打开 Unraid 的 **Docker** 标签页，点击其中的 **Folders（文件夹）** 子标签。
2. **新建文件夹** — 点击 *Add Folder（添加文件夹）*，填写名称并选择图标和颜色。
3. **归入容器** — 将容器卡片拖入某个文件夹；拖回「Ungrouped（未分组）」即可移出。
4. **Compose 自动分组** — 同一 `docker-compose` 项目下的容器会自动归为一组，可自由重命名。
5. **搜索** — 在搜索框输入关键字，按容器名或镜像过滤，匹配的文件夹会自动展开。
6. **切换布局** — 在顶部栏切换 **Grid（网格）** 与 **List（列表）** 视图。
7. **管理容器** — 展开卡片可执行 启动 / 停止 / 重启 / 删除，查看实时资源与日志，或打开 WebUI。
8. **更新镜像** — 使用 *Check for Updates（检查更新）* 查看可用镜像更新、阅读更新说明并拉取
   （支持单个或多个一次性更新）。
9. **编辑 Compose** — 打开项目的 Compose 编辑器修改并应用配置，自带版本历史。
10. **计划任务** — 设置 cron 计划，自动执行容器操作（例如每晚自动重启）。
11. **备份配置** — 使用 *Import / Export（导入 / 导出）* 将文件夹布局保存为 JSON，便于日后恢复。

---

## Localization · 汉化说明

This `-zh` fork translates the entire plugin UI into Simplified Chinese and keeps the
README bilingual. If you spot any untranslated strings, please open an issue.

本 `-zh` 分支已将插件界面完整翻译为简体中文，并保留双语说明文档。如发现仍有未翻译的
文字，欢迎提交 Issue。

---

## Support · 支持

- **Issues & bug reports · 问题反馈**：[GitHub Issues](https://github.com/bcfxclub/unraid-docker-folders-zh/issues)
- **Upstream project · 上游项目**：[rizowski/unraid-docker-folders](https://github.com/rizowski/unraid-docker-folders)

---

## License · 许可证

MIT License — see [LICENSE](https://github.com/bcfxclub/unraid-docker-folders-zh/blob/main/LICENSE) for details.

This project bundles [CodeMirror 5](https://codemirror.net/5/) (MIT), used for
Compose file editing.

本插件基于 MIT 许可证开源，详见 [LICENSE](https://github.com/bcfxclub/unraid-docker-folders-zh/blob/main/LICENSE)。
项目内集成了 [CodeMirror 5](https://codemirror.net/5/)（MIT 协议），用于 Compose 文件编辑。

---

## Credits · 致谢

- Original project developed by [rizowski](https://github.com/rizowski)
- Inspired by [folderview2](https://github.com/VladoPortos/folder.view2) by VladoPortos
- Chinese localization by the `-zh` fork maintainers

- 原项目由 [rizowski](https://github.com/rizowski) 开发
- 灵感来自 VladoPortos 的 [folderview2](https://github.com/VladoPortos/folder.view2)
- 中文汉化由 `-zh` 分支维护者完成
