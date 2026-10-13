# 資料建置管線（scripts/pipeline）

這個資料夾是網站「取得方式／代幣兌換／月球製作」資料的建置流程，由 `.github/workflows/update-obtain-data.yml` 每週自動執行。

```
node run-all.mjs            # 下載來源並建置，中間輸出放 out/（不提交）
node build-site-data.mjs    # 整理成 data/obtain.json、data/exchange.json、data/lunar.json，並做「有原因的變動檢查」
```

- 最終檔案（提交到 repo，網站載入）：`data/obtain.json`、`data/exchange.json`、`data/lunar.json`。
- `.cache/`（下載快取）與 `out/`（中間輸出）已加入 `.gitignore`。
- 變動檢查：與 `data/` 內上一版逐筆比對，消失的資料都要能用已知機制解釋；無法解釋的超過門檻（max(20, 0.1%)）
  就以結束代碼 3 停止、不寫入，工作流程失敗、上一版保持不變。確認差異正常時加 `--force`。
- 來源：Teamcraft（staging 分支）與台服（繁中服）遊戲資料表 CSV（thewakingsands/ffxiv-datamining-tc）。

以下是各步驟的細節說明。

---

# 資料建置管線（與網站設計無關的部分）

需求：Node 18+，**不需要安裝任何套件**。輸出為 JSON。

```
node run-all.mjs [--offline]    # 依正確順序執行全部（失敗即停止）

# 或逐支（順序固定）：
node build-obtainable.mjs      # 兌換 + NPC 商店 → out/obtainable.json
node build-lunar.mjs           # 月球配方       → out/lunar.json
node reconcile-tw-trades.mjs   # 以台服兌換店資料表為準整合兌換、加狀態標籤（更新 out/obtainable.json）
node build-exchange-graph.mjs  # 兌換關係圖（需先跑上面兩支）→ out/exchange-graph.json
node build-sources.mjs         # 其他取得方式   → out/sources.json（製作、副本、寶箱、掉落、採集、危命任務、任務…）
```

共用參數：`--offline`（只用 `.cache/`）、`--pretty`（易讀 JSON）。
環境變數：`TEAMCRAFT_DIR`（本機已有 Teamcraft 的 `libs/data/src/lib` 時使用）、`PIPELINE_OUT`、`PIPELINE_CACHE`。
來源網址可用 `TEAMCRAFT_RAW` / `TW_CSV_RAW` / `GLOBAL_CSV_RAW` 覆寫。

## obtainable.json 結構

```
meta        統計、被丟掉的原因、各類型檢查結果
items[id]   { trades:[{shopIds, shopType, amount, costs:[{id,amount,hq?}], npcIds, unverifiedNpcIds?, verified}],
              vendors:[{npcId, price, verified, festival?}] }
npcs[id]    { name(繁中), locations:[{zoneId, mapId, x, y}] }   // x,y 保留原始小數，顯示時才四捨五入
places[id]  繁中地名
maps[id]    { image, sizeFactor, offsetX, offsetY, placeNameId, placeNameSubId }  // 只含被引用到的地圖
```
物品名稱不重複存放，請用你現有的 `tw-items.json` 以 id 查詢。

### verified 的意義
- `trades[].verified = true`：台服 SpecialShop 確實賣這個物品，且台服 NPC 資料確實連到這家店（含選單轉接）。
- `unverifiedNpcIds`：NPC 有繁中名稱、店在台服存在，但無法證明該 NPC 連到這家店（或店的類型無法用 ENpcBase 驗證，如公會商店）。**資料保留**，前端可自行決定顯示、降權或隱藏。
- `vendors[].verified = false`：NPC 沒有直接連到金幣商店（常見於選單轉接），無法確認物品是否在售。

## 台服可用性判斷（取代「名稱存在就留下」）
1. 物品、貨幣物品必須在 `tw-items.json`。
2. SpecialShop 必須在台服 `SpecialShop.csv` 且實際賣該物品。
3. NPC 必須有繁中名稱。
4. NPC → 商店：以台服 `ENpcBase` 為起點，追蹤 `TopicSelect / PreHandler / CustomTalk / InclusionShop` 轉接（`lib/shopGraph.mjs`）。
5. 金幣商店：台服 `GilShopItem` 必須含該物品。

## 月球（build-lunar.mjs）
- 以「區塊內成品在台服的比例 ≥ 90%」自動判斷台服是否已開放，不寫死任務編號。
- 公式：`難度/品質/耐久 = RecipeLevelTable 基礎值 × Recipe 係數 ÷ 100`（向下取整）。
- `maxCollectable = floor(quality / 10)`。
- 收藏價值門檻 20/40/70% 為**暫定固定比例**（`meta.collectableTiers`），資料表中未找到來源。
- 內建已知樣本檢查（月球車用的貨物包裝用品：1500 / 23200 / 75），不符時 `meta.warnings` 會列出。

## 尚未解決／需注意
- 收藏價值門檻來源（見上）。
- CustomTalk 轉接用「該列所有 ≥65536 的數字」判斷，屬通用掃描；已用 SpecialShop 通過率（98.3%）驗證，但仍建議每次更新看報告。
- `maps[].image` 指向 `v2.xivapi.com`；本管線不下載圖片。
- 部分 NPC 沒有座標（92 個）或有多個座標（43 個），前端需處理。

## 過期（無法再取得）的判斷：dead 標記
Teamcraft 的 `json/deprecated-items.json`（與 extracts 中 `type:-1` 完全相同，共 4,149 個物品）列出遊戲已不再產出的物品。
我檢查過它涵蓋舊貨幣（巧手紅票）、過期活動票據（紅蓮祭票據2021、新生祭票據2019…），現役貨幣（亞拉戈詩學神典石、巧手紫票/橙票、金碟幣、Gil、軍票…）均未被標記。
（找不到 Teamcraft 對此清單的官方定義，以上為依資料行為的推斷。）

規則：**取得方式若依賴已無法取得的物品，保留但標記 `dead: true`**，不刪除，由前端決定如何呈現（建議預設收合並註明原因）。
- 兌換：成本貨幣已過期 → `deadReason: 'currency-deprecated'`
- 製作：素材已過期 → `deadReason: 'ingredient-deprecated'`
- 需求物：已過期 → `deadReason: 'requirement-deprecated'`
- 結果物品本身已過期 → 整個物品略過（`droppedReasons` 計數）
不再需要人工清單。

## sources.json 結構
```
items[itemId] = { craft:[...], reduction:[[ids]], desynth:[[ids]], instances:[[ids]], gathering:[...], gardening:[...],
                  voyages:[keys], drops:[...], alarms:[...], masterbooks:[[ids]], treasures:[[ids]], fates:[...],
                  ventures:[...], quests:[[ids]], achievements:[[ids]], requirements:[...], mogstation:[...], islandPasture, islandCrop }
entities = { instances, fates, quests, achievements, mobs, ventures, voyages, places, maps, contentTypes, gatheringTypes }
```
- 只存編號與必要數值，名稱與細節放在 `entities`（繁中）。物品名稱請用 `tw-items.json`。
- 副本實體含：繁中名稱、等級、iLvl、同步等級、內容類型、地圖。
- 寶箱/容器、分解、精選：存的是「物品編號」。
- 台服驗證：物品、被引用的副本/危命任務/任務/成就/怪物/探險/海域須在對應 `tw-*.json`；製作配方另用台服 `Recipe.csv` 驗證。
- `unverified: true`（商城、無人島）：無法用台服資料驗證，已保留。
- 採集節點的 `items`（同節點其他物品）未存入，可由其他物品的同一 `nodeId` 反查。

## 已用真實資料驗證（信力魔晶石陸型 18011）
兌換 5 筆（含已標 dead 的巧手紅票）、副本「國境防線基姆利特暗區 Lv.70 iLvl 360」、寶箱/容器 4 個、分解 4 個，與 beherw 網站的畫面對得上。

## 尚未處理 / 需注意
- 收藏價值門檻（月球）為暫定 20/40/70%。
- 副本、危命任務等「是否真的在台服可用」只能確認名稱存在於台服，無法驗證遊戲內是否可達。
- `limited` 活動物品（event-items.json）尚未使用。
- 部分 NPC 沒有座標（約 92 個）或有多個座標（43 個）。

## 兌換解鎖條件（obtainable.json 的 trades[].unlock）
來源：台服 `SpecialShop.csv` 每個兌換槽的 `Quest{Item}[槽]`（需先完成的任務）與 `AchievementUnlock[槽]`（需要的成就）。
`unlock = { quests:[id], achievements:[id], ambiguous? }`，名稱查 `tw-quests.json` / `tw-achievements.json`。
同一家店同一成品有多個兌換槽且條件不同時，無法精確配對，標記 `ambiguous: true`（不猜）。公會商店另有 `requiredGCRank`（未處理）。
有條件的兌換會與無條件的分開成不同的 trade（合併鍵包含 unlock）。

## 兌換關係圖（exchange-graph.json）— 給「貨幣換什麼最划算」
```
edges[]  { ref:{item,idx}, costs:[{id,amount,hq?}], result:{id,amount}, resultTradable, shopIds, npcIds, verified, unlock?, gcRank? }
paths[起點物品] = [{ target, ratio, hops, via:[edges 索引…], extras?:[{id, perStart}], locked? }]
```
- 排除 `dead`、`seasonal`、貨幣未解的兌換；同貨幣不同數量的變體保留。`ref` 可回查 obtainable.json；`npcIds`/`shopIds` 可直接顯示每一步在哪裡換。
- 路徑每一步可以用「成本中含目前持有物品」的兌換，不限單一成本。邊上其他成本是 `extras`（需另外購買），
  只有 extras 全部可交易時路徑才成立；價值 = 目標市價 × ratio − Σ(extras 市價 × perStart)。
- 可交易 = 台服 `Item.csv` 的 `ItemSearchCategory > 0`；中間物品可以不可交易（例：詩學神典石 150 → 神秘原石 1 → 3級薩納蘭土壤 1）。
- 最多 4 步；`locked` 路徑（有任務/成就解鎖）與不受限路徑分開保留。
- 未涵蓋：金幣商店（Gil → 物品）。公會軍階（`gcRank`）只記錄不篩選。

## 台服整合與狀態（reconcile-tw-trades.mjs）
**為什麼**：Teamcraft 的兌換來自國際服（版本較新），商店編號、貨幣、數量都可能與台服不同（例如神典石世代更替）。
**做法**：SpecialShop 類兌換改以台服 `SpecialShop.csv` 重建（賣什麼、要多少）；賣家 NPC 由台服 `ENpcBase`（含選單轉接）反查；
座標、活動編號、名稱仍用 Teamcraft。公會商店等非 SpecialShop 類型維持 Teamcraft 資料。
- 台服有、國際服沒有的店是版本落差，不代表過期，會保留並由下面的規則決定狀態。
- 沒有任何台服 NPC 連到的店視為不可達，不輸出（例如已退役的美學神典石店）。
- 兌換槽版本晚於台服目前版本者排除；`9999` 是哨兵值，視為未知；`0` 表示「資料表沒有記錄」（2.0～5.x 的槽都是 0），視為未知，不當成最舊或最新。

**貨幣解讀**（台服成本是原始編號，同一個編號在不同店意義不同）：依序嘗試
1. `teamcraft-slot`：台服與國際服都有的 (店, 成品) 且數量相同 → 沿用 Teamcraft 的貨幣（涵蓋 14,493 個成本）
2. `shop-name`：神典石店用店名中的神典石名稱（例：「亞拉戈天道神典石（其他）」→ 天道）
3. `learned`：由已匹配資料學到的「(貨幣類型, 原始編號) → 貨幣」唯一對應
4. `direct`：原始編號 ≥ 100 時等於成本物品編號（已驗證 2520/2520 組）
5. `learned-raw`：小編號（<100）在所有已知組合都指向同一貨幣時才採用
6. 其餘 → 成本編號為 `null`，保留 `raw`，標記 `unresolvedCurrency`（目前 0 筆）
⚠ `learned-raw` 的 `2 → 巧手紫票` 與神典石店的 `2 → 天道` 衝突，神典石店因店名規則優先處理；若日後出現其他以 `2` 表示不同貨幣的店，需檢查 `meta.reconcile.rawOnlyCurrencyMap`。

**狀態（trades[].status，供系統判斷；玩家端建議只顯示 active，seasonal 放獨立分類，dead 隱藏）**
| status | 條件 |
|---|---|
| `dead` | 成本含 Teamcraft 過期物品（`currency-deprecated`），或神典石輪替退役（`tomestone-rotated`）；`statusReasons`、`deadItems` 記錄原因 |
| `seasonal` | 所有賣家 NPC 都是限期活動賣家：Teamcraft 有活動編號（`festivalIds`），或完全沒有位置且頭銜帶「季節／祭」（舊活動的季節商店，實測 138 筆兌換的賣家頭銜 100% 是「季節商店」或「紅蓮祭銷售委員」） |
| `active` | 其餘 |
同貨幣、不同數量的有效兌換不隱藏，標示 `variants`（變體數量）。無法判斷時，前端可全部顯示並用這些標籤輔助。

**神典石輪替規則（自動，不寫死版本）**：家族 = 台服 `TomestonesItem` 有編號者；編號最小者為常駐（詩學）。
最高層級 = 第一次出現版本最新者（目前數理 7.2）；較低層級若其最新兌換槽版本早於最高層級首次出現版本 → 退役（目前美學 46）。
結果在 `meta.tomestoneRotation`。台服新增世代時會自動重算。

**台服版本偵測**：沒有明確版本檔。`meta.twPatch.fromItems` = 台服名稱表中（≥20 個物品）的最新版本代碼（目前 7.21）；
`fromShopSlots` 為兌換槽最大版本。7.25 若無新增物品，無法由資料偵測到。

## 無人島
Teamcraft 的 `island-*.json`（animals、buildings、crops、landmarks、supply、craftworks…）是無人島的玩法資料，不是兌換條件。
無人島的貨幣兌換若是一般 NPC 兌換店，已經包含在 trades 中；`islandPasture` / `islandCrop` 只標示來源。
