import test from 'node:test';
import assert from 'node:assert/strict';
import { translationEditor } from '../admin/translation-editor.mjs';

class Input extends EventTarget {
  constructor(value = '') { super(); this.value = value; this.classList = { toggle() {} }; }
  type(value) { this.value = value; this.dispatchEvent(new Event('input')); }
}
const fields = (original = 'Mi video', english = '') => [{ key: 'title', source: new Input(original), target: new Input(english), reset: new Input(), status: new Input() }];
const reply = text => ({ translations: [{ id: '0', text }] });
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('a delayed translation preserves a correction typed while the request was in flight', async t => {
  const f = fields(); let resolve;
  const controller = translationEditor(f, undefined, () => new Promise(done => { resolve = done; })); t.after(() => controller.dispose());
  const saved = controller.ensure();
  f[0].target.type('My personal title');
  resolve(reply('My video')); await saved;
  assert.equal(f[0].target.value, 'My personal title');
  assert.deepEqual(controller.metadata().title, { source: 'Mi video', automatic: 'My video', custom: true });
  f[0].reset.dispatchEvent(new Event('click')); await nextTurn();
  assert.equal(f[0].target.value, 'My video');
});
test('saving during translation waits for the newest source and ignores the older response', async t => {
  const f = fields(); const pending = [];
  const controller = translationEditor(f, undefined, texts => new Promise(resolve => pending.push({ texts, resolve }))); t.after(() => controller.dispose());
  const saved = controller.ensureForSave();
  f[0].source.type('Mi nuevo video');
  pending[0].resolve(reply('My video')); await nextTurn();
  assert.equal(f[0].target.value, '');
  assert.equal(pending[1].texts[0].text, 'Mi nuevo video');
  pending[1].resolve(reply('My new video')); await saved;
  assert.equal(f[0].target.value, 'My new video');
});
test('closing an editor prevents its pending response from touching reused fields', async () => {
  const f = fields(); let resolve;
  const controller = translationEditor(f, undefined, () => new Promise(done => { resolve = done; }));
  const pending = controller.ensure(); controller.dispose();
  f[0].target.value = 'Another project'; resolve(reply('My video')); await pending;
  assert.equal(f[0].target.value, 'Another project');
});
test('provider failure allows a manual translation but never silently saves missing automatic English', async t => {
  const fail = async () => { throw new Error('Service unavailable'); };
  const manual = fields('Video', 'My version');
  const manualController = translationEditor(manual, undefined, fail); t.after(() => manualController.dispose());
  manual[0].source.type(''); manual[0].source.type('Nuevo video');
  await manualController.ensureForSave(); assert.equal(manual[0].target.value, 'My version');
  const automatic = fields();
  const automaticController = translationEditor(automatic, undefined, fail); t.after(() => automaticController.dispose());
  await assert.rejects(automaticController.ensureForSave(), /Service unavailable/);
  assert.equal(automatic[0].source.value, 'Mi video'); assert.equal(automatic[0].target.value, '');
});
