// Read only visible site state. A loaded HTML document or static-art button alone
// does not demonstrate that the interactive model has been created.
function inspectModel() {
  const canvas = document.querySelector('canvas.pixi-source-canvas');
  const loading = document.querySelector('.model-loading-status');
  const alert = document.querySelector('.model-status[role="alert"], .model-error[role="alert"]');
  const progress = loading?.querySelector('[role="progressbar"]');
  return {
    url: location.href,
    title: document.title,
    visibility: document.visibilityState,
    documentReady: document.readyState,
    mounted: Boolean(document.querySelector('.app-shell')),
    modelLoaded: Boolean(document.querySelector('.sidebar.model-loaded')),
    canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    loading: loading?.textContent?.trim().slice(0, 180) || '',
    progress: progress?.getAttribute('aria-valuenow') || null,
    error: alert?.textContent?.trim().slice(0, 300) || '',
    settingsOpen: Boolean(document.querySelector('button[aria-label="关闭设置"]')),
    controlsOpen: Boolean(document.querySelector('.model-panel')),
    staticButtonEnabled: Boolean(document.querySelector('button[aria-label="查看静态立绘"]:not(:disabled)'))
  };
}
const { allowedModelUrl } = require('./samples.cjs');
function modelIsReady(ui, sample) {
  return Boolean(
    ui &&
    allowedModelUrl(ui.url, sample) &&
    ui.title.includes(sample.character) &&
    ui.modelLoaded &&
    ui.canvas?.width > 100 &&
    ui.canvas?.height > 100 &&
    !ui.loading &&
    !ui.error
  );
}
module.exports = { inspectModel, modelIsReady, inspectScript: `(${inspectModel.toString()})()` };
