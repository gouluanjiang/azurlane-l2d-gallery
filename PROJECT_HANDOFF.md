# PROJECT HANDOFF — 碧蓝航线 L2D 玩法合集

> 本次接续：2026-09-12。主工作目录：`C:\Users\choumodujiang\Documents\Codex\碧蓝航线L2D玩法图片检索`。  
> **当前状态：本地与云端执行均已验收，目录为 102/68/0/34。用户已授权仓库公开；Windows/Linux 测试、真实云端公告检查、自动发布与本机同步通过。周三/周六北京时间 10:17 的排期已启用，同一流程已手动触发成功。**
> 用户已选择继续自动更新路线，旧 27 款缺图解继续搁置。先看本文与实际证据，不重做已验收页面或现有 68 张图解。

> **桌面版已接入（1.1.0）**：日常入口为根目录 `碧蓝航线图鉴.exe`，随附运行时在 `.desktop`；独立窗口包含同步、立即检查、进度与回退操作，不依赖外部 Node 或 gh。仍使用本项目的同一份 data/assets。桌面代码在 `desktop/`，构建方式见 README。41 项测试通过，真实 exe 与免登录同步验收见 `verification/desktop-acceptance.json`。

## 1. 目标与正式交互

制作可在 Windows 本地直接打开、持续增长的 L2D 皮肤原图与玩法图解合集：从信浓「白沙幽梦」起收录 L2D、L2D+ 和双形态换装，展示角色、正式皮肤名、类型和实装日期，保留高清本地图片。它是图鉴与玩法入口，不是 L2D 动画播放器或模拟器。

已验收并批量采用的入口规则：

- 有 `guidePath`：点击卡片图片查看玩法图解。
- 没有本地图解：点击卡片图片打开 Bilibili 玩法搜索。
- 所有卡片：绿色“查看原图”按钮打开该记录的本地高清原图。
- 有图解时，原图查看器提供“查看玩法图解”；两种模式共用缩放、拖动、适应窗口、100%、关闭和键盘操作。
- 保留搜索、清空搜索、年份/状态筛选、排序、缺图清单与复制功能，以及移动端布局。

## 2. 当前数据与验收边界

| 项目 | 状态与证据 |
| --- | --- |
| 历史图鉴基线 | 95 款，日期 2023-09-21 至 2026-07-23；95 张原图、68 张图解、0 款已确认待接入、27 款缺图解。 |
| schema 2 迁移 | 已实现并完成真实浏览器回归。该次基线版本为 `2026-09-05-01-schema2`。 |
| 最终前端验收 | `verification/recent-update-ui.json` 为 `passed`：102 个卡片/原图按钮、68 个图解入口、34 个搜索入口/缺图条目、0 待接入；7 款新原图与对应搜索正确。历史迁移回归另见 `verification/frontend-report.json`。 |
| 云端实际运行 | 无新增场景已通过；随后用户授权移除 9 月 8 日四款并完成真正增量重放。更新 `34685703962` 从 98 款恢复到 102 款，新增 4、返场排除 6、待核对 0；CI `34685704641` 通过。 |
| 实际增量同步 | 隔离工作区运行同一 `check-updates.mjs` 新增 7 款：2026-08-13 的 3 款、2026-09-08 的 4 款；6 款返场排除。发布后主目录真实 PowerShell 入口新增/下载各 7，见 `verification/first-sync.json`；重复同步为 `unchanged`，见 `verification/repeat-sync.json`。 |
| 当前目录与文件 | **102 款、102 张原图、68 款有图解、0 款待接入、34 款缺图解**，更新至 2026-09-08。170 个图片引用、文件大小/SHA-256、JSON/JS 镜像均通过；原有 95 张原图与 68 张图解全部保留。35 项单元测试通过。 |
| 本机直接检查 | `本机检查更新.cmd` 对应的 PowerShell 入口已联网通过：新增 0、总数 102、待核对 0；不依赖 GitHub Actions 额度或 GitHub 登录。该次已验收版本为 `20260912T085228244Z-b101b7589b33`，检查时间 `2026-09-12T08:52:28.244Z`；证据保留在 `verification/completion-report.json` 的 `directLocalCheck`。 |

当前已同步的云端版本为 `20260912T092314483Z-b101b7589b33`，`checkedAt=2026-09-12T09:23:14.483Z`，提交 `be8aad51318970f36111cbfd799c91f0ba52833c`。真正增量实测先移除四款与活动目录中的四张原图；云端重新发现并校验四款，本机同步返回新增 4、下载 4，再次同步 `unchanged`。170 个文件及 JSON/JS 镜像校验通过，102 条完整记录与移除前逐条完全一致。详见 [云端增量实测](./云端增量实测-2026-09-08.md) 和 `verification/september-replay-acceptance.json`。

## 3. 已实现的数据与更新工程

### 数据契约

`data/catalog.json` 是 schema 2 目录；`data/skins-data.js` 是经典脚本镜像，提供 `window.L2D_SKINS_DATA`，兼容直接打开本地 HTML。顶层包含 `schemaVersion`、`version`、`updatedTo`、`checkedAt`、`skins`。记录包含稳定 `id`、`character`、`name`、`variant`、`type`、`releaseDate`、`artworkPath`、可为空的 `guidePath`、图片来源及 SHA-256/字节数等字段。

原有编号图片继续保留，但 HTML 已不再通过数组位置推算路径，也不再保存独立 `localGuides` 名单。卡片与查看器按记录 ID、`artworkPath`、`guidePath` 工作；重排或新增记录不应错配图片。年份、更新至日期、范围与统计动态生成；公告或记录文字通过安全 DOM 文本写入，不作为 HTML 执行。

### 云端检查

- 配置目标：公开仓库 [gouluanjiang/azurlane-l2d-gallery](https://github.com/gouluanjiang/azurlane-l2d-gallery)，`main` 分支；2026-09-12 用户明确授权公开后已执行。
- 工作流：`.github/workflows/update.yml`，名称 `Check game updates`；每周三、周六北京时间 10:17，支持手动触发。
- 读取官方维护公告**正文**，并结合碧蓝航线 WIKI 核对角色、换装及原图；识别 L2D、L2D+、双形态与返场，使用稳定身份去重。
- 无法证明的候选进入 `data/review.json`；来源、公告与检查结果记录在 `data/update-report.json`。失败尝试使用 `data/update-attempt.json`，工作流保留失败证据。
- 新原图通过格式与内容校验后才发布目录；云端提交只维护元数据与程序，`assets` 不进入 Git。
- **云端验证通过**：[CI](https://github.com/gouluanjiang/azurlane-l2d-gallery/actions/runs/34684875936)、[更新任务](https://github.com/gouluanjiang/azurlane-l2d-gallery/actions/runs/34684877551)均为 success，更新任务自动发布了提交 `2502900`。本次是手动触发相同工作流，未把未来定时自然触发写成已观测结果。

历史失败证据：[CI 34684108330](https://github.com/gouluanjiang/azurlane-l2d-gallery/actions/runs/34684108330)、[更新 34684126812](https://github.com/gouluanjiang/azurlane-l2d-gallery/actions/runs/34684126812)。它们发生在私有仓库阶段，被账号计费限制阻止。用户随后授权公开仓库，标准公共 runner 已正常执行；账号付款与预算设置未改变。

已在隔离 worktree 运行同一检查脚本，成功新增 7 款并将验证元数据发布至私有仓库 `main`，提交 [77aa4b6aaf0aeb02cd193397cceee23bc40aaa10](https://github.com/gouluanjiang/azurlane-l2d-gallery/commit/77aa4b6aaf0aeb02cd193397cceee23bc40aaa10)。随后主目录经真实同步入口接入新增记录与原图；该过程在本机执行，不是 Actions 成功记录。

### 本地同步与回退

- `一键更新.cmd` → `scripts/sync.ps1` → `scripts/sync.mjs`：读取远端确定提交的目录，暂存缺少的图片，核对格式/大小/SHA-256 后更新 JSON 与 JS 镜像。
- `本机检查更新.cmd` → `scripts/sync.ps1 -CheckSources` → `scripts/check-updates.mjs --apply-local`：直接读取公开公告与 WIKI、核对新原图，再通过同一事务同步引擎应用到本地。需要立即查新、不等待云端排期时使用，无需 GitHub 登录。
- `回退上次更新.cmd`：恢复最近一次成功同步前的数据；已下载图片保留，不删除原图。
- 更新使用锁、事务记录与备份，校验失败或检测到已有记录/本地修改冲突时停止；不会静默覆盖手工修改。中断恢复和回退信息保存在 `.l2d-update`。
- `data/sync-status.json` 记录仓库同步结果；本机直接检查结果在 `data/update-report.json`，失败尝试在 `data/update-attempt.json`。页面版本与 `checkedAt` 来自当前目录；页面本身不联网检查更新。
- 本地同步处理数据和图片，不自动升级 HTML 或程序文件。
- Windows PowerShell 5 的 Node 版本检查参数引号问题已修复，主目录真实 PowerShell 同步、重复同步与本机检查入口均已验证。

## 4. 本机使用和环境

1. 日常双击 `碧蓝航线图鉴.exe`，在软件窗口使用同步、检查与设置。旧 `打开图鉴.cmd` 和 `index-信浓泳装起.html` 仍可兼容使用；以下环境配置仅适用于旧命令行入口。
2. 本机检查、同步和回退需要 Node.js 22+。仓库同步入口目前仍使用本机已登录的 GitHub CLI；`local-config.json` 已保存 CLI 路径，不保存令牌，也不提交 Git。
3. 换电脑或 CLI 路径变化时，从项目目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\配置更新.ps1`；不在 PATH 的 CLI 可使用 `-GhPath` 指定完整路径。脚本检查 `gh auth status`，已有登录直接使用。
4. 日常使用 `一键更新.cmd` 同步云端已发布版本；需要立即查新时使用 `本机检查更新.cmd`。完成后刷新/重新打开图鉴；失败先看窗口及对应报告，修复网络或配置后重试。
5. 需要恢复最近一次成功同步前的数据时双击 `回退上次更新.cmd`。保持 `.l2d-update` 备份，回退不会清除新增原图。

开发常用命令：`npm test`、`npm run validate`（元数据）、`npm run validate:local`（含本地图片）、`npm run preview`。预览仅绑定 `127.0.0.1`；真实浏览器验收可用 localhost，不能以脚本语法/静态检查冒充浏览器结果。

## 5. 不变的图片与内容约束

- 原图保存在 `assets/skins`；玩法图解保存在 `assets/guides`。页面不得从云端直接展示这些图片，不生成压缩缩略图、不降低清晰度。
- “同版式玩法图解”须是带红圈、箭头、点位和操作步骤的单张攻略图；立绘、视频封面或仅文字攻略不计入。
- 页面不展示图解作者名或来源；数据内保留来源供核对。不要在原图上叠加“点击查看图解”文字。
- 瑟堡「布偶熊里面的是……？」原图是 `assets/skins/060.jpg`（1000×1500），卡片保留 2:3 完整画面；图解是 `assets/guides/瑟堡-布偶熊里面的是-玩法图.png`。
- U-2501「水幕后的珍宝」原图是 `assets/skins/053.jpg`，图解为 `assets/guides/U-2501-水幕后的珍宝-玩法图.png`（5206×3060）。
- 角色名称为“天城”，不要恢复成“天城CV”。不要把信浓兔女郎图解误当成信浓泳装图解。
- 用户已验收瑟堡样例并授权批量应用；此次迁移保留已验收行为。后续另改卡片交互时仍应先做样例，不重做现有 68 图。

已使用并人工核对过的图解来源：

- [I🐔N 240815–251225](https://075fac25.pinme.dev)
- [I🐔N 260122–260723](https://417ce07b.pinme.dev)
- [用户补充目录，含 U-2501](https://ed6b1227.pinme.dev)

前两个目录主要覆盖 2024-08-15 之后的皮肤，不能据此断言更早皮肤没有图解。`download-guide-images.ps1` 保留精确来源文件名映射与人工别名；不得改成模糊猜测。旧下载脚本默认跳过已有图片，重新运行前先检查目标，避免覆盖。

## 6. 历史完成阶段

- 2026-08-13：95 款卡片原图入口、瑟堡样例和批量交互通过；随后完成两个目录的 67 张图解及用户补充 U-2501，形成 95/68/27 基线。网页搜索、筛选、排序、查看器、移动端与缺图入口均已有实际验收。
- 2026-09-05：六字段数组从 HTML 拆到 `data/skins-data.js`；当时仍使用数组位置和 HTML 图解映射。该旧契约现已由 schema 2 替代。
- 2026-09-08：只读审计确认整项工程仍未完成，用户选择继续自动更新路线，旧 27 款补图搁置。
- 2026-09-12：完成 schema 2、前端改造、本地同步/回退与本机公告检查；实际新增 7 款至 102 款。95 款迁移回归和最终 102 款浏览器验收分别记录在 `verification/frontend-report.json`、`verification/recent-update-ui.json`。

2026-09-12 用户要求清理本地废弃工程。优化前 HTML、早期试作/备份目录、失效的旧原图下载脚本、未引用图片及隔离云端测试工作区已删除；唯一主页面为 `index-信浓泳装起.html`。更新运行状态、回退备份和验收记录仍保留，清理清单见 `verification/cleanup-report.json`。本项目未使用 ARIS，没有 `run_id`。

## 7. 暂停补齐的 27 款旧图解

旧 27 款补图继续暂停，不重新检索或下载；本次新增 7 款也暂未提供图解，全部保留 Bilibili 玩法搜索入口。当前缺图清单以页面与 `data/catalog.json` 中 `guidePath=null` 的记录为准，不另维护重复名单。

## 8. 验证结果与剩余续接点

- 35 项自动测试通过，包含返场去重、更新失败保护、下载中本地修改保护、回退中断恢复、路径检查和重复同步；Windows PowerShell 5 的 Node 版本检查引号问题已修复并用实际入口验证。
- 170 个本地图像引用全部通过文件/大小/SHA-256 校验；与旧基线比较，95 张原图和 68 张图解路径与内容不变。
- 102 款浏览器验收通过：7 张新原图均为 1000×1500；唯一 ID、精确搜索与卡片路径对应；68 个图解入口保留，U-2501/瑟堡图解实际打开，390×844 手机布局无横向溢出，控制台无错误。未逐张打开全部 68 图解，文件校验覆盖全部。
- **云端无新增与有新增场景均已通过验收**，分别见 `verification/cloud-acceptance.json`、`verification/september-replay-acceptance.json`。9 月 8 日四款重放补齐了真实云端原图下载、自动收录、发布、本机下载与浏览器恢复证据。定时计划保持启用，后续自然触发属于运行观察。
- 原来 27 款补图继续暂停，本次新增 7 款暂用搜索。未来无法确认的候选先查看 `data/review.json` 和公告正文，不能猜测收录。
