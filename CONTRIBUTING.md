# 贡献说明

感谢你愿意帮忙改进这个图鉴。

## 反馈

- 皮肤缺漏、信息错误、试玩对应不上：使用 [“皮肤缺漏或信息错误”模板](https://github.com/gouluanjiang/azurlane-l2d-gallery/issues/new/choose)。
- 程序问题：使用“程序问题”模板，并附上状态栏提示或“更新过程”里的内容。

## 提交代码

1. 从 `main` 新建分支，改动尽量集中在一件事上。
2. 提交前在本地运行：
   ```powershell
   npm test
   npm run validate
   ```
   改动桌面端或试玩台时，请再用 `npm run desktop:build` 打包，并实际打开 `碧蓝航线图鉴.exe` 检查。
3. 发起 Pull Request，写清改了什么、为什么改、怎么验证的。CI 会在 Windows 和 Linux 上运行同样的检查。

## 需要遵守的约定

- **不提交游戏图片。** 原图、图解、模型都不进仓库，`assets/` 已被忽略；目录里只记录来源地址和校验值。
- **不手改皮肤目录。** `data/catalog.json` 与 `data/skins-data.js` 由云端检查脚本维护，必须保持一致并通过 `npm run validate`。新增皮肤应能由官方公告和 WIKI 证明，不能凭猜测收录。
- **试玩映射只收唯一对应。** 补充映射写入 `desktop/tryout/online-mapping-supplement.json`，并在 `reason` 里说明核对方法；同名多模型、名称写法差异等情况保持待核对，或注明人工核对的依据。
- **不绕过第三方网站的限制。** l2d.su 的目录文件已加密，项目只使用其公开页面与站内搜索；不要提交解密、抓取加密数据或绕过访问控制的代码。
- **已冻结的分批入口不再修改。** 第一至四批的试玩代码路径只为历史保留，新功能请做在正式图鉴（第 5 版“全部皮肤”）上。

开发背景、历次验收和已知问题见 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)。
