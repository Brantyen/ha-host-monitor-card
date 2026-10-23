# HA Host Monitor Card

Home Assistant 主機監控卡片：CPU、RAM、CPU 溫度、磁碟、電壓、功率、風扇。支援視覺化設定、歷史曲線、繁體中文、預設無外框與陰影。無外部 JavaScript 相依套件，也不會向第三方傳送感測器資料。

## 資料來源

先在「設定 → 裝置與服務」新增官方 **System monitor**，啟用所需實體。CPU、RAM、磁碟請選使用率 **%**，不是 MiB 或 GiB。溫度是否存在取決於主機、驅動及安裝環境；虛擬機或容器不一定能讀到實體主機所有資料。

電壓、功率與風扇是選用項目。System monitor 並不提供通用電壓讀值；需選擇 UPS / NUT、電力計或硬體驅動確實提供的感測器。CPU 核心電壓、主機直流輸入與市電不能混為同一項目。本卡不會建立硬體感測器，也不會憑空產生電壓值。

## HACS 安裝

1. HACS → 右上角選單 → **自訂儲存庫 / Custom repositories**。
2. 輸入此 GitHub 儲存庫的網址，類型選 **Dashboard**（舊版介面可能稱 Lovelace）。
3. 搜尋 **HA Host Monitor Card** 並下載，重新整理瀏覽器。
4. 儀表板 → 編輯 → 新增卡片 → **HA 主機監控**，選擇各項感測器。

如果沒有出現卡片，至「設定 → 儀表板 → 資源」確認載入：

```yaml
url: /hacsfiles/ha-host-monitor-card/ha-host-monitor-card.js
type: module
```

資源管理可能需要開啟個人資料中的進階模式；YAML 儀表板請依自己的 resources 設定加入。同一檔案只註冊一次。

## YAML 設定範例

```yaml
type: custom:ha-host-monitor-card
title: 主機監控
cpu_entity: sensor.ha_host_cpu
ram_entity: sensor.ha_host_ram
temperature_entity: sensor.ha_host_temperature
disk_entity: sensor.ha_host_disk
# 以下選用，必須換成你實際的感測器：
# voltage_entity: sensor.ups_input_voltage
# power_entity: sensor.host_power
# fan_entity: sensor.host_fan_speed
borderless: true
show_history: true
hours_to_show: 24
```

實體 ID 只是範例，不會自動建立；視覺化編輯器可直接選你的現有實體。沒有來源的項目留空即不顯示。找不到或不可用時顯示「—」，有效的 0 會正常顯示。點擊任何讀值可開啟 HA 的詳細資訊。

CPU 示範黃/紅門檻為 70/90%，RAM 與磁碟 75/90%，溫度 70/85°C。°F 與 K 會換算成 °C 判斷顏色，顯示仍使用來源單位。百分比若單位不符，會提示並停止套用警戒色。

色彩不是硬體安全判定，也不會建立通知；需要通知可另建 HA 自動化。歷史圖使用 HA 內建 history-graph 與 Recorder，實際保留時間、記錄排除設定與權限均由 HA 決定。卡片預設顯示過去 24 小時，最多可設 168 小時；沒有既有紀錄時不會產生假歷史資料。

## 手動安裝

將 `dist/ha-host-monitor-card.js` 複製到 HA 的 `/config/www/ha-host-monitor-card.js`，新增 `/local/ha-host-monitor-card.js` 為 JavaScript module 資源，重新整理後新增卡片。手動安裝與 HACS 安裝二選一。

## 發布與開發

儲存庫名稱應為 `ha-host-monitor-card`，讓 HACS 能對應 `dist/ha-host-monitor-card.js`。根目錄包含 `hacs.json`、README 與 MIT 授權；GitHub 儲存庫需公開、有 description，並建議加入 `home-assistant`、`hacs`、`lovelace-custom-card` topics。

沒有 release 時 HACS 可下載預設分支。推送 `v1.0.0` tag 後，附帶工作流程會先檢查再建立包含 JS 資產的 release。不要只發布沒有 JS 資產的空 release。

```sh
npm run check
npm test
```

不需要 npm install 或建置；dist 中的 JS 就是可交付檔案。測試使用 Node.js 內建 test runner 與模擬 DOM，涵蓋數值有效性、單位、設定更新、編輯器及非同步歷史圖；不等同實際 HA/HACS 端到端驗證。

此專案可作為 HACS 自訂儲存庫安裝；未宣稱已被 HACS 預設商店收錄。

## 官方文件

- https://www.home-assistant.io/integrations/systemmonitor/
- https://www.hacs.xyz/docs/publish/plugin/
- https://www.hacs.xyz/docs/publish/start/
- https://contributors.home-assistant.io/frontend/custom-ui/card/

MIT License
