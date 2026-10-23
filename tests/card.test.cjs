const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../dist/ha-host-monitor-card.js'), 'utf8');
class Element {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.style = {}; this.attributes = {}; this.events = {}; this._text = ''; this.classList = { add: name => this.className = ((this.className || '') + ' ' + name).trim() }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  get lastChild() { return this.children.at(-1); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, fn) { this.events[name] = fn; }
  dispatchEvent(event) { this.lastEvent = event; this.events[event.type]?.(event); return true; }
  attachShadow() { this.shadowRoot = new Element(); return this.shadowRoot; }
  querySelector(tag) { for (const node of this.children) { if (node.tagName === tag) return node; const found = node.querySelector?.(tag); if (found) return found; } return null; }
}
function setup(helpers) {
  const registry = new Map();
  const context = vm.createContext({ HTMLElement: Element, document: { createElement: tag => { const C = registry.get(tag); return C ? new C() : new Element(tag); }, createTextNode: text => new Element('text') }, customElements: { get: name => registry.get(name), define: (name, C) => registry.set(name, C) }, window: { loadCardHelpers: helpers || (() => Promise.resolve({ createCardElement: config => Object.assign(new Element('history'), { config }) })) }, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } } });
  vm.runInContext(source, context);
  return { Card: registry.get('ha-host-monitor-card'), Editor: registry.get('ha-host-monitor-card-editor'), context };
}
const state = (value, unit) => ({ state: value, attributes: { unit_of_measurement: unit } });
const flush = () => new Promise(resolve => setImmediate(resolve));
test('empty configuration explains setup and registers only once', () => {
  const { Card, context } = setup(); const c = new Card(); c.setConfig({});
  assert.match(c.shadowRoot.textContent, /請編輯卡片/);
  vm.runInContext(source, context); assert.equal(context.window.customCards.length, 1);
});
test('zero is valid; missing, unavailable and empty values are never shown as zero', () => {
  const { Card } = setup(); const c = new Card(); c.setConfig({ cpu_entity: 'sensor.cpu', show_history: false });
  for (const [value, expected] of [[state('0', '%'), '0'], [undefined, '—'], [state('unavailable', '%'), '—'], [state('', '%'), '—'], [state('unknown', '%'), '—'], [state('NaN', '%'), '—']]) {
    c.hass = { states: value ? { 'sensor.cpu': value } : {} }; assert.equal(c._tiles[0].nodes.value.textContent, expected);
  }
});
test('percentage and temperature units determine warning behavior', () => {
  const { Card } = setup(); const c = new Card(); c.setConfig({ ram_entity: 'sensor.ram', temperature_entity: 'sensor.temp', show_history: false });
  c.hass = { states: { 'sensor.ram': state('1600', 'MiB'), 'sensor.temp': state('194', '°F') } };
  assert.match(c._tiles[0].nodes.status.textContent, /百分比/);
  assert.equal(c._tiles[1].nodes.value.style.color, 'var(--error-color)');
  assert.equal(c._tiles[1].nodes.unit.textContent, '°F');
});
test('voltage is not assigned a universal severity threshold', () => {
  const { Card } = setup(); const c = new Card(); c.setConfig({ voltage_entity: 'sensor.voltage', show_history: false });
  c.hass = { states: { 'sensor.voltage': state('230', 'V') } };
  assert.equal(c._tiles[0].nodes.status.textContent, '即時讀值');
  c.shadowRoot.querySelector('button').events.click();
  assert.equal(c.lastEvent.detail.entityId, 'sensor.voltage');
});
test('history cards persist across live state updates and receive latest hass', async () => {
  const { Card } = setup(); const c = new Card(); c.setConfig({ cpu_entity: 'sensor.cpu', ram_entity: 'sensor.ram', voltage_entity: 'sensor.voltage' });
  await flush(); assert.equal(c._graphs.length, 2);
  const graph = c._graphs[0], hass = { states: { 'sensor.cpu': state('42', '%') } };
  c.hass = hass; c.hass = hass; assert.equal(c._graphs[0], graph); assert.equal(graph.hass, hass);
});
test('late asynchronous history initialization cannot overwrite new configuration', async () => {
  let resolve; const { Card } = setup(() => new Promise(r => resolve = r)); const c = new Card();
  c.setConfig({ cpu_entity: 'sensor.cpu' }); c.setConfig({ show_history: false });
  resolve({ createCardElement: () => { throw new Error('stale build must not run'); } });
  await flush(); assert.equal(c._graphs.length, 0);
});
test('history failure leaves live values usable', async () => {
  const { Card } = setup(() => Promise.reject(new Error('offline'))); const c = new Card(); c.setConfig({ cpu_entity: 'sensor.cpu' }); await flush();
  c.hass = { states: { 'sensor.cpu': state('12', '%') } };
  assert.equal(c._tiles[0].nodes.value.textContent, '12'); assert.match(c.shadowRoot.textContent, /歷史圖載入失敗/);
});
test('configuration rejects invalid entity IDs and history ranges; false flags survive', () => {
  const { Card } = setup(); const c = new Card();
  assert.throws(() => c.setConfig({ cpu_entity: 'light.test' })); assert.throws(() => c.setConfig({ hours_to_show: 0 })); assert.throws(() => c.setConfig({ hours_to_show: 999 }));
  c.setConfig({ borderless: false, show_history: false }); assert.equal(c._config.borderless, false); assert.equal(c._config.show_history, false);
});
test('visual editor emits selections without dropping unrelated config', () => {
  const { Editor } = setup(); const editor = new Editor(); editor.setConfig({ type: 'custom:ha-host-monitor-card', borderless: false });
  editor._change('cpu_entity', 'sensor.cpu'); assert.equal(editor.lastEvent.type, 'config-changed'); assert.equal(editor.lastEvent.detail.config.cpu_entity, 'sensor.cpu'); assert.equal(editor.lastEvent.detail.config.borderless, false);
  editor._change('cpu_entity', ''); assert.equal(editor.lastEvent.detail.config.cpu_entity, undefined);
});
test('title is plain text, not HTML', () => {
  const { Card } = setup(); const c = new Card(); c.setConfig({ title: '<img src=x onerror=alert(1)>' });
  assert.equal(c.shadowRoot.querySelector('h2').textContent, '<img src=x onerror=alert(1)>'); assert.equal(c.shadowRoot.querySelector('img'), null);
});
