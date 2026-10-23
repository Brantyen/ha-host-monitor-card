/* HA Host Monitor Card 1.0.0 | MIT */
(() => {
  const METRICS = [
    { key: 'cpu', label: 'CPU 使用率', unit: '%', yellow: 70, red: 90 },
    { key: 'ram', label: 'RAM 使用率', unit: '%', yellow: 75, red: 90 },
    { key: 'temperature', label: 'CPU 溫度', unit: '°C', yellow: 70, red: 85 },
    { key: 'disk', label: '磁碟使用率', unit: '%', yellow: 75, red: 90 },
    { key: 'voltage', label: '電壓', unit: 'V' },
    { key: 'power', label: '功率', unit: 'W' },
    { key: 'fan', label: '風扇轉速', unit: 'rpm' },
  ];
  const style = `
    :host{display:block}ha-card{padding:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color)}
    ha-card.borderless{border:0;box-shadow:none}h2{font-size:20px;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    button{font:inherit;text-align:left;cursor:pointer;background:var(--secondary-background-color);color:inherit;border:0;border-radius:14px;padding:16px;min-width:0}
    button:focus-visible{outline:2px solid var(--primary-color)}.label{color:var(--secondary-text-color);font-size:13px}.value{font-size:28px;line-height:1.6;font-weight:600;overflow-wrap:anywhere}
    .unit{font-size:14px;font-weight:400;margin-left:5px}.status{font-size:12px;min-height:18px;color:var(--secondary-text-color)}.bar{height:5px;border-radius:6px;background:var(--divider-color);overflow:hidden;margin-top:10px}.fill{height:100%;width:0;background:var(--primary-color);transition:width .3s}
    .note{font-size:12px;color:var(--secondary-text-color);margin:14px 0 0}.graphs{margin-top:16px;display:grid;gap:12px}.empty{line-height:1.8;color:var(--secondary-text-color)}
    @media(max-width:340px){.grid{grid-template-columns:1fr}.value{font-size:24px}}
  `;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function normalize(config) {
    if (!config || typeof config !== 'object') throw new Error('需要卡片設定');
    const c = { title: 'HA 主機監控', borderless: true, show_history: true, hours_to_show: 24, ...config };
    if (!Number.isFinite(Number(c.hours_to_show)) || Number(c.hours_to_show) < 1 || Number(c.hours_to_show) > 168) throw new Error('歷史時間需為 1–168 小時');
    for (const m of METRICS) {
      const id = c[m.key + '_entity'];
      if (id != null && id !== '' && (typeof id !== 'string' || !/^sensor\.[a-z0-9_]+$/.test(id))) throw new Error(m.label + '需選擇 sensor 實體');
    }
    return c;
  }
  function reading(state, metric) {
    if (!state) return { value: '—', status: '找不到實體' };
    if (state.state === 'unavailable' || state.state === 'unknown' || !String(state.state).trim() || !Number.isFinite(Number(state.state))) return { value: '—', status: '資料不可用' };
    const n = Number(state.state), unit = state.attributes?.unit_of_measurement || '';
    let comparable = n;
    if (metric.key === 'temperature') {
      if (unit === '°F') comparable = (n - 32) * 5 / 9;
      else if (unit === 'K') comparable = n - 273.15;
      else if (unit !== '°C') return { value: String(n), unit, status: '溫度單位不符，未套用警戒色' };
    }
    if (metric.unit === '%' && unit !== '%') return { value: String(n), unit, status: '請選擇百分比感測器' };
    const level = metric.red != null && comparable >= metric.red ? 'error' : metric.yellow != null && comparable >= metric.yellow ? 'warning' : null;
    const status = metric.red == null ? '即時讀值' : level === 'error' ? '超過示範警戒值' : level === 'warning' ? '偏高' : '低於示範警戒值';
    return { value: n.toLocaleString(undefined, { maximumFractionDigits: 2 }), unit, status, level, percent: metric.unit === '%' ? Math.min(100, Math.max(0, n)) : undefined };
  }
  class HostMonitorCard extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); this._generation = 0; this._graphs = []; }
    static getConfigElement() { return document.createElement('ha-host-monitor-card-editor'); }
    static getStubConfig() { return { title: 'HA 主機監控', borderless: true, show_history: true }; }
    setConfig(config) { this._config = normalize(config); this._build(); if (this._hass) this.hass = this._hass; }
    getCardSize() { return this._config?.show_history ? 12 : 5; }
    getGridOptions() { return { columns: 12, min_columns: 6, min_rows: 4 }; }
    set hass(hass) {
      this._hass = hass;
      if (!this._config) return;
      for (const { metric, nodes } of this._tiles || []) {
        const data = reading(hass.states[this._config[metric.key + '_entity']], metric);
        nodes.value.textContent = data.value;
        nodes.unit.textContent = data.unit || '';
        nodes.status.textContent = data.status;
        const color = data.level ? `var(--${data.level}-color)` : 'var(--primary-color)';
        nodes.value.style.color = color;
        nodes.fill.style.background = color;
        nodes.fill.style.width = (data.percent ?? 0) + '%';
      }
      for (const graph of this._graphs) graph.hass = hass;
    }
    _build() {
      const generation = ++this._generation;
      this.shadowRoot.replaceChildren(); this._graphs = []; this._tiles = [];
      const css = el('style', style), card = el('ha-card');
      if (this._config.borderless) card.classList.add('borderless');
      card.append(el('h2', String(this._config.title)), el('div', undefined, 'grid'));
      const grid = card.lastChild;
      for (const metric of METRICS) {
        const id = this._config[metric.key + '_entity']; if (!id) continue;
        const button = el('button'); button.type = 'button'; button.setAttribute('aria-label', metric.label + '，查看詳細資訊');
        const number = el('div', undefined, 'value'), value = el('span', '—'), unit = el('span', '', 'unit'); number.append(value, unit);
        const status = el('div', '等待資料', 'status'), bar = el('div', undefined, 'bar'), fill = el('div', undefined, 'fill');
        bar.append(fill); bar.hidden = metric.unit !== '%';
        button.append(el('div', metric.label, 'label'), number, status, bar);
        button.addEventListener('click', () => this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true })));
        grid.append(button); this._tiles.push({ metric, nodes: { value, unit, status, fill } });
      }
      if (!this._tiles.length) card.append(el('div', '請編輯卡片，選擇 System monitor 的 CPU、RAM、溫度、磁碟實體。電壓、功率與風扇可選。', 'empty'));
      card.append(el('p', this._config.voltage_entity ? '電壓依所選實體顯示；請確認其量測來源。警戒色僅供參考，不會發送通知。' : '尚未設定電壓來源。警戒色僅供參考，不會發送通知。', 'note'));
      const graphHost = el('div', undefined, 'graphs'); card.append(graphHost);
      this.shadowRoot.append(css, card);
      if (this._config.show_history && this._tiles.length) this._buildGraphs(graphHost, generation);
    }
    async _buildGraphs(host, generation) {
      try {
        const helpers = await window.loadCardHelpers();
        if (generation !== this._generation) return;
        const groups = new Map();
        for (const { metric } of this._tiles) {
          const group = metric.unit === '%' ? '使用率' : metric.label;
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push({ entity: this._config[metric.key + '_entity'], name: metric.label });
        }
        for (const [title, entities] of groups) {
          const graph = helpers.createCardElement({ type: 'history-graph', title, hours_to_show: Number(this._config.hours_to_show), entities });
          if (this._hass) graph.hass = this._hass;
          host.append(graph); this._graphs.push(graph);
        }
      } catch (error) {
        if (generation === this._generation) host.append(el('div', '歷史圖載入失敗；目前讀值仍可使用。請確認 HA Recorder 與前端資源。', 'note'));
      }
    }
  }
  class HostMonitorEditor extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    setConfig(config) { this._config = normalize(config); this._render(); }
    set hass(hass) { this._hass = hass; this._options(); }
    _change(key, value) {
      this._config = { ...this._config, [key]: value };
      if (value === '') delete this._config[key];
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { ...this._config } }, bubbles: true, composed: true }));
    }
    _options() {
      const list = this.shadowRoot.querySelector('datalist');
      if (!list || !this._hass || this._states === this._hass.states) return;
      this._states = this._hass.states; list.replaceChildren();
      for (const [id, state] of Object.entries(this._hass.states)) {
        if (!id.startsWith('sensor.')) continue;
        const option = el('option'); option.value = id; option.label = (state.attributes?.friendly_name || id) + ' · ' + (state.attributes?.unit_of_measurement || ''); list.append(option);
      }
    }
    _render() {
      this.shadowRoot.replaceChildren(el('style', ':host{display:block}label{display:block;margin:12px 0;font-size:14px}input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;padding:10px;margin-top:5px;background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:6px}p{font-size:13px;color:var(--secondary-text-color)}'));
      this.shadowRoot.append(el('p', '請選擇既有感測器。CPU、RAM、磁碟請選百分比實體；未使用的項目留白。輸入框可搜尋實體 ID。'));
      const fields = [{ key: 'title', label: '標題' }, ...METRICS.map(m => ({ key: m.key + '_entity', label: m.label + '實體' })), { key: 'hours_to_show', label: '歷史小時數（1–168）', number: true }];
      for (const field of fields) {
        const label = el('label', field.label), input = el('input'); input.type = field.number ? 'number' : 'text'; input.value = this._config[field.key] ?? '';
        if (field.number) { input.min = '1'; input.max = '168'; }
        if (field.key.endsWith('_entity')) input.setAttribute('list', 'host-monitor-entities');
        input.addEventListener('change', () => { if (input.checkValidity()) this._change(field.key, field.number ? Number(input.value) : input.value.trim()); });
        label.append(input); this.shadowRoot.append(label);
      }
      for (const [key, text] of [['borderless', '移除外框與陰影'], ['show_history', '顯示歷史曲線']]) {
        const label = el('label'), input = el('input'); input.type = 'checkbox'; input.checked = this._config[key]; input.addEventListener('change', () => this._change(key, input.checked)); label.append(input, document.createTextNode(' ' + text)); this.shadowRoot.append(label);
      }
      const list = el('datalist'); list.id = 'host-monitor-entities'; this.shadowRoot.append(list); this._states = null; this._options();
    }
  }
  if (!customElements.get('ha-host-monitor-card')) customElements.define('ha-host-monitor-card', HostMonitorCard);
  if (!customElements.get('ha-host-monitor-card-editor')) customElements.define('ha-host-monitor-card-editor', HostMonitorEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === 'ha-host-monitor-card')) window.customCards.push({ type: 'ha-host-monitor-card', name: 'HA 主機監控', description: 'CPU、RAM、溫度、磁碟、電壓、功率與風扇監控', preview: true });
})();
