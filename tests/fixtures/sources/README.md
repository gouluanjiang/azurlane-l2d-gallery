# Public source fixtures

Captured directly from public HTTPS APIs on 2026-09-12 (Asia/Shanghai). No account, cookie, secret, or generated content is included. JSON bodies preserve the original API responses for offline regression.

- Official site: https://game.bilibili.com/blhx/news/
- The site's actual public component script `vue_08d3cb9ec71d344656b710afd7f91c2d185dc2cc.js` uses `https://api.biligame.com/news/list?gameExtensionId=103&positionId=2&typeId=1&pageNum=1&pageSize=30`, then `https://api.biligame.com/news/{id}` for the full HTML body. List snippets are **not** valid announcement bodies.
- Latest maintenance: https://api.biligame.com/news/18328 — 2026-09-08. Four new target skins, six returning target skins. Repetitions in gift-box/rental sections are excluded.
- 2026-08-13: https://api.biligame.com/news/18247 — three new target skins, seven returning target skins, with dates attached to subsection headers and independent date lines.
- IDs 18192 / 18214 / 18315 have no new target skins. ID 18283 has one returning L2D skin and no new target skin. ID 18165 is the existing 2026-07-23 boundary.
- BWiki: `https://wiki.biligame.com/blhx/api.php?action=query&prop=revisions&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&formatversion=2&redirects=1&format=json&titles={title}`. `wiki-pages.json` records each requested title and its full response/revision ID.
- Image metadata: same API, `action=query&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Csha1&formatversion=2&titles={File:title}`. Original image URLs, dimensions, and MIME are stored in `wiki-images.json`.

## Latest-update evidence and source precedence

The overview `换装图鉴` does not yet include the September skins. The September maintenance mirror names `碧蓝海事局幽影迷城活动专题` in a `专题传送门` template. This event page's gallery binds the exact skin names to these canonical original files:

| Canonical character | Skin | File | Official type |
| --- | --- | --- | --- |
| 安土 | 午夜的瑰色电梯 | 安土换装.jpg | 双形态 |
| 腓特烈·卡尔 | 午夜频道 | 腓特烈·卡尔换装3.jpg | L2D+ |
| 狮 | 夜巷中的诱引者 | 狮换装2.jpg | L2D+ |
| 光辉 | 幽影徘徊之夜 | 光辉换装8.jpg | L2D+ |

`安土`'s character template explicitly declares `和谐名=鮟`. `武藏` explicitly declares `和谐名=鳄`. The API resolves `腓德雷卡·卡尔` to `腓特烈·卡尔`. These provide alias evidence; a unique skin name alone is not enough to accept a different character.

The event gallery currently labels 狮 and 光辉 as `Live2D`, while the full official new-sale section explicitly labels both `Live2D+` (and the event gift-box section also says `Live2D+`). The official announcement determines type and first-release date. This difference is included in `report.warnings`, not silently overwritten.

No original artwork bytes are stored in these fixtures. The update orchestrator downloads originals and computes its own SHA-256 before publishing.

## 2026-09-30 catalog format regression

`wiki-cloth-list-2026-09-30.json` preserves three full public API responses,
their requested URLs, and capture timestamps (2026-09-30, Asia/Shanghai):

| Page | Revision | Revision time (UTC) | Role |
| --- | --- | --- | --- |
| `换装图鉴` | 415755 | 2026-09-20 07:17:12 | Current overview; no `换装图鉴列表` records; loads `{{JS\|ClothListPage.js}}`. |
| `MediaWiki:ClothListPage.js` | 415751 | 2026-09-20 07:11:07 | Declares `jsonPage: 'Module:ClothList/json'`; reads revision content as JSON and builds images from `船名` + `换装` + `.jpg`. |
| `模块:ClothList/json` | 416119 | 2026-09-29 11:18:42 | JSON array of 1,453 records, including 204 L2D, 24 L2D+, and 8 dual-form records. |

The change is a migration from positional wikitext templates to named-field
JSON, not a renamed template or a shifted 14-column layout. The API reports
the module's content model as `wikitext`, but its revision body is JSON. The
five consumed keys are `船名`, `换装名称`, `换装`, `立绘类型`, and `实装时间`.
Ordinary art has an empty type; `动态` and `特殊动态` remain excluded.

The regression covers both historical templates and the current module,
including exact image slots for the September 17 skins. Unknown loaders,
missing/broken modules, missing or non-string keys, unknown types, empty
results, and legacy column shifts must fail closed even beside valid records.
Unprovable identity/date values remain review items; they are never accepted.
The CLI regression also checks exit status 1, failure evidence, and byte-for-byte
preservation of the catalog, JavaScript mirror, previous review, and report.
The old overview at `/旧版` is not a fallback for a failed current source.
