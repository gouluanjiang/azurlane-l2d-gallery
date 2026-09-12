# 碧蓝航线 L2D 玩法合集

可离线使用的皮肤原图与玩法图解图鉴，收录 L2D、L2D+ 和双形态换装。页面提供搜索、年份/状态筛选、排序、缺图清单、原图/图解查看和缩放；本项目展示图片与玩法入口，不播放或模拟 L2D 动画。

## 日常使用

- **打开图鉴**：双击 [打开图鉴.cmd](./打开图鉴.cmd)，或直接打开 [index-信浓泳装起.html](./index-信浓泳装起.html)。完整保留 `data`、`assets` 与 HTML 的相对位置，查看已有内容无需联网。
- **日常同步（推荐）**：双击 [一键更新.cmd](./一键更新.cmd)，同步云端已检查并发布的数据，将缺少的原图下载到本机。
- **立即检查最新资料**：联网后双击 [本机检查更新.cmd](./本机检查更新.cmd)。本机直接读取官方公告与 WIKI，不必等待云端排期，也不需要 GitHub 登录。
- **回退上次同步**：双击 [回退上次更新.cmd](./回退上次更新.cmd)，恢复上一次成功同步前的数据版本。已下载的原图会保留，回退不会清理图片。

更新完成后刷新或重新打开图鉴；打开 HTML 本身不会检查更新。有本地图解时，点击卡片图片打开图解；缺图解时，点击图片打开 Bilibili 玩法搜索。每张卡片均有绿色“查看原图”按钮，原图查看器可切换到已有图解。图片仅从本地 `assets` 读取，不生成压缩缩略图。

## 当前状态

| 阶段 | 数据与验收情况 |
| --- | --- |
| 当前图鉴 | **102 款、102 张本地原图、68 款有图解、0 款待接入、34 款缺图解**；日期范围 2023-09-21 至 2026-09-08。 |
| 已完成增量 | 隔离工作区实际检查新增 7 款（8 月 13 日 3 款、9 月 8 日 4 款），排除 6 款返场，发布至私有仓库后由本机入口下载并接入 7 张原图；重复同步为 `unchanged`。 |
| 本机验收 | 本机直接检查最新资料已联网通过：新增 0、仍为 102 款、待核对 0；170 个图片引用、SHA-256 和 JSON/JS 镜像校验通过，35 项测试通过，102 款浏览器验收通过。原有 95 张原图与 68 张图解全部保留。 |
| 云端验收 | 仓库已按用户授权公开；Windows 与 Linux 的 35 项测试分别通过，真实维护公告检查、元数据自动提交及本机同步均通过。检查结果为新增 0、待核对 0，已有 7 款未重复添加。 |

截至 2026-09-12，本机已同步云端版本 `20260912T090425699Z-b101b7589b33`。旧 27 款补图继续暂停；新增 7 款暂用玩法搜索入口，不把立绘、视频封面或普通文字攻略当作玩法图解。

## 更新环境

打开图鉴只需要浏览器。执行本机检查、同步或回退需要 **Node.js 22 或更新版本**。“一键更新”目前通过本机已配置并登录的 GitHub CLI（`gh`）读取仓库；[项目仓库](https://github.com/gouluanjiang/azurlane-l2d-gallery)现已公开，可直接浏览代码和元数据。

本机已配置 GitHub CLI 路径。若迁移目录或换电脑，在项目目录执行以下命令检查并保存 CLI 路径；已有登录可以继续使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\配置更新.ps1
```

若 `gh` 未在 PATH 中，可给该脚本传入 `-GhPath "GitHub CLI 的完整路径"`。脚本会执行 `gh auth status`；仅在未登录时需要先完成 `gh auth login`。`local-config.json` 只记录本机 CLI 路径，不提交到仓库。

## 自动检查与本地同步

GitHub Actions 已启用，计划在**每周三、周六北京时间 10:17**检查，也支持从 Actions 页面手动运行 `Check game updates`。[Windows/Linux CI](https://github.com/gouluanjiang/azurlane-l2d-gallery/actions/runs/34684875936)与[实际云端更新](https://github.com/gouluanjiang/azurlane-l2d-gallery/actions/runs/34684877551)均已成功。本次通过手动触发验证了与定时任务相同的流程；尚未观察到后续日历排期的自然触发。之前私有仓库的计费限制失败记录仅作为历史保留，未更改账号付款或预算设置。

检查读取碧蓝航线官方公告正文，并与碧蓝航线 WIKI 的角色、换装及原图信息核对，识别真正新增的 L2D/L2D+/双形态换装；普通维护公告和返场不会直接增加记录。无法证明对应关系的项目留在 `data/review.json`，检查报告保存在 `data/update-report.json`。

此前新增 7 款的本机实测保留在提交 [77aa4b6](https://github.com/gouluanjiang/azurlane-l2d-gallery/commit/77aa4b6aaf0aeb02cd193397cceee23bc40aaa10)。本次真正由 GitHub Actions 发布的提交为 [2502900](https://github.com/gouluanjiang/azurlane-l2d-gallery/commit/250290057cb9d6619ef8ed7cac17e0528322586f)，已通过“一键更新”同步到本机；102 款记录与 170 个图片引用保持正常。

两个更新入口都会校验图片格式、大小和 SHA-256 后切换本地数据，保留已有素材；网络、校验或本地修改冲突会停止应用。失败先看窗口：仓库同步结果见 `data/sync-status.json`，本机检查结果见 `data/update-report.json`，失败尝试见 `data/update-attempt.json`。本地更新只处理数据和图片，HTML 和程序升级另行维护。

页面的“数据版本”和“上次检查”来自已同步目录；“上次检查”表示目录检查脚本执行时记录的时间，不代表每次打开网页都进行了联网检查，也不能单凭该字段判断执行环境是 GitHub Actions。

## 文件与维护

- `data/catalog.json`：schema 2 主目录；每条记录包含稳定 `id`、角色/换装信息、实装日期、明确的 `artworkPath` / `guidePath`、来源及校验值。
- `data/skins-data.js`：供本地 HTML 使用的经典脚本镜像，与 JSON 目录保持一致。
- `assets/skins`、`assets/guides`：本地原图与玩法图解；不上传图片到 Git 仓库。
- `update-config.json`：更新仓库、分支与计划配置；`.l2d-update` 保存同步暂存和回退备份。
- [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md)：开发接续、历史约束、验收证据与未完成项。

开发校验命令（在项目目录执行）：

```powershell
npm test
npm run validate
npm run validate:local
npm run preview
```

`validate` 检查元数据，`validate:local` 还检查本地图片。预览服务只绑定 `127.0.0.1`；静态检查通过不代替浏览器验收。

本次验证：35 项自动测试通过；170 个本地图像引用的文件/哈希及 JSON/JS 镜像一致；95 张旧原图与 68 张旧图解的路径、内容未变。7 张新原图均经浏览器确认 1000×1500，搜索、旧图解及手机布局抽查通过。详见 [验收记录](./verification/completion-report.json) 与 [浏览器报告](./verification/recent-update-ui.json)（这两个报告仅保存在本机）。
