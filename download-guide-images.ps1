param(
  [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'
$guideDir = Join-Path $PSScriptRoot 'assets\guides'
New-Item -ItemType Directory -Path $guideDir -Force | Out-Null

$catalogs = @(
  @{
    Base = 'https://075fac25.pinme.dev/ipfs/bafybeic6coixldbkhlw7ypf6eyqqrknojy2aysmyfqkws2gmdo2wuuvhyq'
    Items = @(
      @('z13.png', 'Z13-战略性约会进行时-玩法图.png'),
      @('七省.png', '七省-相依偎的温度-玩法图.png'),
      @('云仙.png', '云仙-万船集怀-玩法图.png'),
      @('企业.png', '企业-雨霁于心晴之时-玩法图.png'),
      @('伴儿维.png', '伴尔维-清凉的甜蜜滋味-玩法图.png'),
      @('信浓.png', '信浓-幻梦奇术-玩法图.png'),
      @('俾斯麦（圣诞）.png', '俾斯麦-未完成的圣诞惊喜-玩法图.png'),
      @('关岛.png', '关岛-女忍者的危险综艺秀-玩法图.png'),
      @('列克星敦II.png', '列克星敦II-轻飘飘的拂拭时光-玩法图.png'),
      @('匹兹堡.png', '匹兹堡-斟酒女郎的赌局-玩法图.png'),
      @('可畏.png', '可畏-纪念印记-玩法图.png'),
      @('君主.png', '君主-海滩享受计划-玩法图.png'),
      @('吾妻.png', '吾妻-心向何方的指导课-玩法图.png'),
      @('四万十.png', '四万十-优哉游哉的龙神大人-玩法图.png'),
      @('埃吉尔.png', '埃吉尔-私密闲暇时-玩法图.png'),
      @('大帝.png', '腓特烈大帝-相会于盛夏之夜-玩法图.png'),
      @('天城.png', '天城-落于王座之花-玩法图.png'),
      @('天狼星.png', '天狼星-至高乐园的白兔-玩法图.png'),
      @('安妮女王复仇号.png', '安妮女王复仇号-隐秘之拥的呼唤-玩法图.png'),
      @('安宝睡衣.png', '安克雷奇-香甜牛奶味之夜-玩法图.png'),
      @('尾张Owari.png', '尾张-愿望为“爱”-玩法图.png'),
      @('布雷斯特.png', '布雷斯特-良夜春景-玩法图.png'),
      @('建武.png', '建武-妆点，只为今夜-玩法图.png'),
      @('弗利茨鲁梅.png', '弗里茨·鲁梅-Schwarzes Kaninchen-玩法图.png'),
      @('拉斐尔.png', '拉斐尔-爱与美的秘密珍藏-玩法图.png'),
      @('新泽西（赛车）.png', '新泽西-漆黑的超极速前奏-玩法图.png'),
      @('梅宝.png', '梅克伦堡-作茧自缚-玩法图.png'),
      @('欧根.png', '欧根亲王-微醺与试探的距离-玩法图.png'),
      @('武藏.png', '武藏-堇色兔的狙击游戏-玩法图.png'),
      @('泽特.png', '曾克海军上将-心动审讯练习中-玩法图.png'),
      @('浅间.png', '浅间-绽放于至深之夜-玩法图.png'),
      @('济安.png', '济安-异域绮梦-玩法图.png'),
      @('渡良濑.png', '渡良濑-不会消失的换装魔法-玩法图.png'),
      @('特拉法尔加.png', '特拉法尔加-海风与夜语-玩法图.png'),
      @('狮.png', '狮-沙滩的慵懒主宰-玩法图.png'),
      @('珍珠号.png', '珍珠号-魔堡中的堕天使-玩法图.png'),
      @('科本斯.png', '科本斯-心动营养灌输中-玩法图.png'),
      @('约克城II.png', '约克城II-交错的温柔时光-玩法图.png'),
      @('纳西莫夫.png', '纳希莫夫海军上将-聚光灯下的初体验-玩法图.png'),
      @('美因茨.png', '美因茨-静雅之所的安逸-玩法图.png'),
      @('腓特烈卡尔.png', '腓特烈·卡尔-夏日防晒计划-玩法图.png'),
      @('苏萌.png', '苏维埃同盟-缠丝审讯-玩法图.png'),
      @('莫加多尔（护士）.png', '莫加多尔-嗅诊的护理天使-玩法图.png'),
      @('让巴尔.png', '让·巴尔-灯映星展-玩法图.png'),
      @('贝劳森林.png', '贝劳森林-水色疗愈-玩法图.png'),
      @('近江.png', '近江-逃脱失败……？-玩法图.png'),
      @('那不勒斯.png', '那不勒斯-Dreamy Night-玩法图.png'),
      @('金狮.png', '金狮-朦胧的宠溺时刻-玩法图.png'),
      @('阿尔萨斯.png', '阿尔萨斯-圣宵之鬼的微醺-玩法图.png'),
      @('马赛那.png', '马塞纳-醉甜之泉-玩法图.png')
    )
  },
  @{
    Base = 'https://417ce07b.pinme.dev/ipfs/bafybeihugjpsjvvoplgtyhd3b2rtmzddfjtotp52dbovvjujftrxhrkfly'
    Items = @(
      @('伯利欣根.png', '葛兹·冯·伯利欣根-赤红之月的幻想-玩法图.png'),
      @('信浓（东煌风）.png', '信浓-相融一梦-玩法图.png'),
      @('兴登堡.png', '兴登堡-深阁舞戏-玩法图.png'),
      @('冈依沙瓦.png', '冈依沙瓦号-真我的显影-玩法图.png'),
      @('名寄.png', '名寄-Electric Affection-玩法图.png'),
      @('天城II(人鱼).png', '天城-碧波绮尾-玩法图.png'),
      @('奥古斯特帕塞瓦尔.png', '奥古斯特·冯·帕塞瓦尔-与“魔女”的星夜之约-玩法图.png'),
      @('彰武.png', '彰武-一枝春欲放-玩法图.png'),
      @('怨仇.png', '怨仇-杯盏盈芳华-玩法图.png'),
      @('普利茅斯.png', '普利茅斯-纯白天使的全身检查-玩法图.png'),
      @('瑟堡.png', '瑟堡-布偶熊里面的是-玩法图.png'),
      @('百眼巨人.png', '百眼巨人-特训中的威严之人-玩法图.png'),
      @('腓特烈大帝（东煌风）.png', '腓特烈大帝-红封之礼-玩法图.png'),
      @('莫加多尔（天降）.png', '莫加多尔-共坠的渴慕-玩法图.png'),
      @('路易九世.png', '路易九世-微醺的静谧时光-玩法图.png'),
      @('雅努斯（泳装）.png', '雅努斯-云端的水光-玩法图.png'),
      @('高雄.png', '高雄-武者的“内在”修养-玩法图.png')
    )
  },
  @{
    Base = 'https://ed6b1227.pinme.dev/ipfs/bafybeihbu4ui2qr5dsbb7bjr6utdckvczugqwrvlv6flror24lgsz5i3ru'
    Items = @(
      @('u2501.png', 'U-2501-水幕后的珍宝-玩法图.png')
    )
  }
)

$downloaded = 0
$skipped = 0
$failed = @()

foreach ($catalog in $catalogs) {
  foreach ($item in $catalog.Items) {
    $sourceName = $item[0]
    $targetName = $item[1]
    $targetPath = Join-Path $guideDir $targetName
    if (-not $Overwrite -and (Test-Path -LiteralPath $targetPath) -and (Get-Item -LiteralPath $targetPath).Length -gt 0) {
      $skipped++
      continue
    }

    $url = $catalog.Base + '/' + [uri]::EscapeDataString($sourceName)
    $success = $false
    for ($attempt = 1; $attempt -le 3 -and -not $success; $attempt++) {
      try {
        Invoke-WebRequest -Uri $url -OutFile $targetPath -UseBasicParsing -ErrorAction Stop
        if ((Get-Item -LiteralPath $targetPath).Length -le 0) { throw 'Downloaded file is empty.' }
        $success = $true
        $downloaded++
        Write-Output "DOWNLOADED`t$targetName"
      } catch {
        if ($attempt -eq 3) {
          $failed += "$targetName <- $url : $($_.Exception.Message)"
        }
      }
    }
  }
}

Write-Output "SUMMARY`tdownloaded=$downloaded`tskipped=$skipped`tfailed=$($failed.Count)"
if ($failed.Count) {
  $failed | ForEach-Object { Write-Error $_ }
  exit 1
}

