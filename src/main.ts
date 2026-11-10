import './style.css';
import * as cornerstone from '@cornerstonejs/core';
import * as dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import * as tools from '@cornerstonejs/tools';
import { createDentalCurve } from './domain';

const appElement = document.querySelector<HTMLDivElement>('#app')!;
appElement.innerHTML = `
  <header class="titlebar">
    <div class="brand"><span class="brand-mark">C</span><span>CBCT Viewer</span><small>PORTABLE</small></div>
    <nav class="mode-tabs"><button class="mode active" data-mode="mpr">MPR</button><button class="mode" data-mode="dental">Dental</button></nav>
    <div class="title-actions"><button id="data-folder" class="icon-button">Data</button></div>
  </header>
  <main class="shell">
    <aside class="sidebar">
      <div class="side-heading"><div><span class="eyebrow">LIBRARY</span><h1>Studies</h1></div><button id="show-import" class="primary square">＋</button></div>
      <div id="study-list" class="study-list"><div class="empty-list">No imported studies</div></div>
      <div class="sidebar-footer"><span id="library-count">0 studies</span><span>Local USB storage</span></div>
    </aside>
    <section class="workspace">
      <div class="patient-strip">
        <div><span class="eyebrow">PATIENT</span><strong id="patient-name">No study selected</strong></div>
        <div><span class="eyebrow">STUDY DATE</span><strong id="study-date">—</strong></div>
        <div><span class="eyebrow">SERIES</span><strong id="series-name">—</strong></div>
        <div><span class="eyebrow">IMAGES</span><strong id="image-count">—</strong></div>
        <div id="busy" class="busy hidden"><i></i><span>Loading</span></div>
      </div>
      <div class="toolbar" id="mpr-toolbar">
        <button class="tool active" data-tool="Crosshairs">⌖ <span>Crosshair</span></button>
        <button class="tool" data-tool="WindowLevel">◐ <span>WL / WW</span></button>
        <button class="tool" data-tool="Pan">✥ <span>Pan</span></button>
        <button class="tool" data-tool="Zoom">⌕ <span>Zoom</span></button>
        <button class="tool" data-tool="Length">╱ <span>Ruler</span></button>
        <span class="toolbar-spacer"></span><button id="reset-view" class="tool">↺ <span>Reset</span></button>
      </div>
      <div id="welcome" class="welcome">
        <div class="welcome-orbit"><span></span></div><h2>Import a CBCT study</h2>
        <p>DICOM files stay unchanged. The largest compatible CBCT series is selected automatically.</p>
        <button id="welcome-import" class="primary">Open Import Hub</button>
      </div>
      <div id="mpr-view" class="viewport-grid hidden">
        <div class="viewport-cell"><div class="viewport-label axial">AXIAL</div><div id="viewport-axial" class="viewport"></div></div>
        <div class="viewport-cell"><div class="viewport-label coronal">CORONAL</div><div id="viewport-coronal" class="viewport"></div></div>
        <div class="viewport-cell"><div class="viewport-label sagittal">SAGITTAL</div><div id="viewport-sagittal" class="viewport"></div></div>
      </div>
      <div id="dental-view" class="dental-grid hidden">
        <div class="dental-panel"><div class="viewport-label axial">DENTAL CURVE · AXIAL</div><canvas id="dental-axial"></canvas></div>
        <div class="dental-panel"><div class="viewport-label pano">PANORAMIC RECONSTRUCTION</div><canvas id="dental-pano"></canvas></div>
        <div class="dental-panel"><div class="viewport-label cross">CROSS-SECTION</div><canvas id="dental-cross"></canvas><input id="cross-position" type="range" min="0" max="95" value="48" /></div>
        <div class="dental-note"><strong>Automatic curve</strong><span>Initial U-curve generated from the CBCT matrix. Move the section slider to inspect the arch.</span></div>
      </div>
      <footer class="statusbar"><span id="status">Ready</span><span>Geometry uses DICOM pixel spacing</span></footer>
    </section>
  </main>
  <dialog id="import-dialog">
    <div class="dialog-head"><div><span class="eyebrow">IMPORT HUB</span><h2>Add study</h2></div><button id="close-import" class="icon-button">×</button></div>
    <p class="dialog-subtitle">Choose a source. DICOM files are copied byte-for-byte into the portable data folder.</p>
    <div class="source-grid">
      <button class="source" data-source="cloud"><b>↗</b><span>Cloud link</span><small>Download URL</small></button>
      <button class="source" data-source="email"><b>＠</b><span>Link from email</span><small>Paste URL</small></button>
      <button class="source" data-source="disc"><b>◉</b><span>CD / DVD</span><small>Disc folder</small></button>
      <button class="source" data-source="usb"><b>⌁</b><span>USB drive</span><small>Removable media</small></button>
      <button class="source" data-source="folder"><b>▰</b><span>Local folder</span><small>Computer storage</small></button>
      <button class="source" data-source="network"><b>⌘</b><span>Network folder</span><small>Shared storage</small></button>
      <button class="source" data-source="archive"><b>⬡</b><span>ZIP / 7z archive</span><small>Compressed study</small></button>
    </div>
    <div id="link-entry" class="link-entry hidden"><input id="source-url" type="url" placeholder="https://…" /><button id="import-link" class="primary">Download & import</button></div>
    <div id="import-message" class="import-message"></div>
  </dialog>`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const studyList = byId<HTMLDivElement>('study-list');
const importDialog = byId<HTMLDialogElement>('import-dialog');
const busy = byId<HTMLDivElement>('busy');
const status = byId<HTMLSpanElement>('status');
let studies: StudySummary[] = [];
let selectedStudyId = '';
let renderingEngine: cornerstone.RenderingEngine | undefined;
let activeToolGroup: ReturnType<typeof tools.ToolGroupManager.createToolGroup>;
let activeVolume: any;
let initialized = false;
let pendingLinkKind = 'cloud';

const viewportDefinitions = [
  { viewportId: 'AXIAL', element: byId<HTMLDivElement>('viewport-axial'), orientation: cornerstone.Enums.OrientationAxis.AXIAL },
  { viewportId: 'CORONAL', element: byId<HTMLDivElement>('viewport-coronal'), orientation: cornerstone.Enums.OrientationAxis.CORONAL },
  { viewportId: 'SAGITTAL', element: byId<HTMLDivElement>('viewport-sagittal'), orientation: cornerstone.Enums.OrientationAxis.SAGITTAL }
];

async function initializeImaging() {
  if (initialized) return;
  await cornerstone.init();
  await dicomImageLoader.init({ maxWebWorkers: Math.max(1, Math.min(6, navigator.hardwareConcurrency || 2)) });
  await tools.init();
  [tools.CrosshairsTool, tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.LengthTool, tools.StackScrollTool].forEach((tool) => tools.addTool(tool));
  initialized = true;
}

function setBusy(value: boolean, label = 'Loading') {
  busy.classList.toggle('hidden', !value); busy.querySelector('span')!.textContent = label;
}
function setStatus(message: string) { status.textContent = message; }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!); }

function renderStudyList() {
  byId('library-count').textContent = `${studies.length} ${studies.length === 1 ? 'study' : 'studies'}`;
  if (!studies.length) { studyList.innerHTML = '<div class="empty-list">No imported studies</div>'; return; }
  studyList.innerHTML = studies.map((study) => `<button class="study-card ${study.id === selectedStudyId ? 'selected' : ''}" data-study="${study.id}">
    <span class="study-icon">${study.patientName.slice(0, 1).toUpperCase()}</span><span class="study-copy"><strong>${escapeHtml(study.patientName)}</strong><span>${escapeHtml(study.displayDate)}</span><small>${study.sliceCount} images · ${escapeHtml(study.modality)}</small></span></button>`).join('');
  studyList.querySelectorAll<HTMLElement>('[data-study]').forEach((card) => card.addEventListener('click', () => openStudy(card.dataset.study!)));
}
async function refreshStudies() { studies = await window.cbct.listStudies(); renderStudyList(); }

async function openStudy(id: string) {
  setBusy(true, 'Reading DICOM'); setStatus('Reading and validating the main CBCT series…');
  try {
    await initializeImaging();
    const study = await window.cbct.openStudy(id); selectedStudyId = id; renderStudyList();
    byId('patient-name').textContent = study.patientName; byId('study-date').textContent = study.displayDate;
    byId('series-name').textContent = study.seriesDescription; byId('image-count').textContent = String(study.sliceCount);
    byId('welcome').classList.add('hidden'); byId('mpr-view').classList.remove('hidden');
    dicomImageLoader.wadouri.fileManager.purge();
    const imageIds: string[] = [];
    for (let index = 0; index < study.files.length; index += 1) {
      setStatus(`Loading DICOM ${index + 1} of ${study.files.length}…`);
      const bytes = await window.cbct.readFile(study.files[index]);
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      imageIds.push(dicomImageLoader.wadouri.fileManager.add(new Blob([arrayBuffer], { type: 'application/dicom' })));
    }
    renderingEngine?.destroy();
    if (activeToolGroup) tools.ToolGroupManager.destroyToolGroup(activeToolGroup.id);
    const engineId = `engine-${Date.now()}`; const toolGroupId = `tools-${Date.now()}`;
    renderingEngine = new cornerstone.RenderingEngine(engineId);
    const viewportInputs: cornerstone.Types.PublicViewportInput[] = viewportDefinitions.map((item) => ({
      viewportId: item.viewportId,
      element: item.element,
      type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
      defaultOptions: { orientation: item.orientation, background: [0.025, 0.035, 0.05] }
    }));
    renderingEngine.setViewports(viewportInputs);
    const volumeId = `cornerstoneStreamingImageVolume:cbct-${Date.now()}`;
    const volume = await cornerstone.volumeLoader.createAndCacheVolume(volumeId, { imageIds }); activeVolume = volume; volume.load();
    await cornerstone.setVolumesForViewports(renderingEngine, [{ volumeId }], viewportDefinitions.map((item) => item.viewportId));
    activeToolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId)!;
    ['Crosshairs', 'WindowLevel', 'Pan', 'Zoom', 'Length', 'StackScroll'].forEach((name) => activeToolGroup!.addTool(name));
    viewportDefinitions.forEach((item) => activeToolGroup!.addViewport(item.viewportId, engineId));
    activeToolGroup.setToolActive('Crosshairs', { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
    activeToolGroup.setToolActive('StackScroll', { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] });
    renderingEngine.renderViewports(viewportDefinitions.map((item) => item.viewportId)); renderDental(volume);
    setStatus(`${study.patientName} · ${study.displayDate} · ${study.sliceCount} images`);
  } catch (error) { setStatus('Could not open study'); alert(error instanceof Error ? error.message : String(error)); }
  finally { setBusy(false); }
}

function scalarArray(volume: any): ArrayLike<number> | undefined { return volume?.voxelManager?.getCompleteScalarDataArray?.() || volume?.getScalarData?.(); }
function voi(value: number, width = 2600, level = 450) { return Math.max(0, Math.min(255, Math.round(((value - (level - width / 2)) / width) * 255))); }
function putGray(canvas: HTMLCanvasElement, width: number, height: number, pixelAt: (x: number, y: number) => number) {
  canvas.width = width; canvas.height = height; const context = canvas.getContext('2d')!; const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const gray = voi(pixelAt(x, y)); const offset = (y * width + x) * 4;
    image.data[offset] = gray; image.data[offset + 1] = gray; image.data[offset + 2] = gray; image.data[offset + 3] = 255; }
  context.putImageData(image, 0, 0);
}
function renderDental(volume: any) {
  const dimensions = volume?.dimensions as number[] | undefined; const voxels = scalarArray(volume); if (!dimensions || !voxels) return;
  const [dx, dy, dz] = dimensions; const curve = createDentalCurve(dx, dy, 96);
  const at = (x: number, y: number, z: number) => Number(voxels[(Math.max(0, Math.min(dz - 1, z)) * dy + Math.max(0, Math.min(dy - 1, y))) * dx + Math.max(0, Math.min(dx - 1, x))] ?? -1000);
  const axial = byId<HTMLCanvasElement>('dental-axial'); putGray(axial, dx, dy, (x, y) => at(x, y, Math.floor(dz / 2)));
  const context = axial.getContext('2d')!; context.strokeStyle = '#35d6c1'; context.lineWidth = Math.max(1.5, dx / 250); context.beginPath();
  curve.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
  putGray(byId<HTMLCanvasElement>('dental-pano'), curve.length, dz, (x, y) => { const point = curve[x]; const previous = curve[Math.max(0, x - 1)]; const next = curve[Math.min(curve.length - 1, x + 1)];
    const length = Math.hypot(next.x - previous.x, next.y - previous.y) || 1; const nx = -(next.y - previous.y) / length; const ny = (next.x - previous.x) / length; let maximum = -32768;
    for (let thickness = -3; thickness <= 3; thickness += 1) maximum = Math.max(maximum, at(Math.round(point.x + nx * thickness), Math.round(point.y + ny * thickness), dz - 1 - y)); return maximum; });
  renderCrossSection(volume, curve, Number(byId<HTMLInputElement>('cross-position').value));
}
function renderCrossSection(volume: any, curve: ReturnType<typeof createDentalCurve>, position: number) {
  const dimensions = volume?.dimensions as number[]; const voxels = scalarArray(volume); if (!dimensions || !voxels) return;
  const [dx, dy, dz] = dimensions; const index = Math.max(1, Math.min(curve.length - 2, position)); const point = curve[index]; const previous = curve[index - 1]; const next = curve[index + 1];
  const length = Math.hypot(next.x - previous.x, next.y - previous.y) || 1; const nx = -(next.y - previous.y) / length; const ny = (next.x - previous.x) / length; const width = 96;
  const at = (x: number, y: number, z: number) => Number(voxels[(Math.max(0, Math.min(dz - 1, z)) * dy + Math.max(0, Math.min(dy - 1, y))) * dx + Math.max(0, Math.min(dx - 1, x))] ?? -1000);
  putGray(byId<HTMLCanvasElement>('dental-cross'), width, dz, (x, y) => at(Math.round(point.x + nx * (x - width / 2)), Math.round(point.y + ny * (x - width / 2)), dz - 1 - y));
}

function activateTool(name: string) {
  if (!activeToolGroup) return;
  ['Crosshairs', 'WindowLevel', 'Pan', 'Zoom', 'Length'].forEach((toolName) => activeToolGroup!.setToolPassive(toolName));
  activeToolGroup.setToolActive(name, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
  document.querySelectorAll('.tool[data-tool]').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.tool === name));
}
async function importSource(kind: string, url?: string) {
  setBusy(true, 'Importing'); byId('import-message').textContent = 'Scanning files and detecting DICOM series…';
  try { const result = await window.cbct.importSource(kind, url); if (result.canceled) { byId('import-message').textContent = ''; return; }
    if (result.error) throw new Error(result.error); await refreshStudies(); importDialog.close(); if (result.study) await openStudy(result.study.id); }
  catch (error) { byId('import-message').textContent = error instanceof Error ? error.message : String(error); } finally { setBusy(false); }
}
function showImport() { byId('link-entry').classList.add('hidden'); byId('import-message').textContent = ''; importDialog.showModal(); }
byId('show-import').addEventListener('click', showImport); byId('welcome-import').addEventListener('click', showImport); byId('close-import').addEventListener('click', () => importDialog.close());
byId('data-folder').addEventListener('click', () => window.cbct.revealData());
document.querySelectorAll<HTMLElement>('[data-source]').forEach((button) => button.addEventListener('click', () => { const kind = button.dataset.source!;
  if (kind === 'cloud' || kind === 'email') { pendingLinkKind = kind; byId('link-entry').classList.remove('hidden'); byId<HTMLInputElement>('source-url').focus(); } else importSource(kind); }));
byId('import-link').addEventListener('click', () => importSource(pendingLinkKind, byId<HTMLInputElement>('source-url').value));
document.querySelectorAll<HTMLElement>('.tool[data-tool]').forEach((button) => button.addEventListener('click', () => activateTool(button.dataset.tool!)));
byId('reset-view').addEventListener('click', () => { renderingEngine?.getViewports().forEach((viewport) => viewport.resetCamera()); renderingEngine?.render(); });
document.querySelectorAll<HTMLElement>('.mode').forEach((button) => button.addEventListener('click', () => { const dental = button.dataset.mode === 'dental';
  document.querySelectorAll('.mode').forEach((item) => item.classList.toggle('active', item === button)); byId('mpr-view').classList.toggle('hidden', dental || !selectedStudyId);
  byId('mpr-toolbar').classList.toggle('hidden', dental); byId('dental-view').classList.toggle('hidden', !dental || !selectedStudyId);
  if (!dental && renderingEngine) setTimeout(() => { renderingEngine!.resize(true, false); renderingEngine!.render(); }, 0); }));
byId<HTMLInputElement>('cross-position').addEventListener('input', () => { if (!activeVolume) return; const dims = activeVolume.dimensions as number[]; if (dims) renderCrossSection(activeVolume, createDentalCurve(dims[0], dims[1], 96), Number(byId<HTMLInputElement>('cross-position').value)); });
window.addEventListener('resize', () => { if (renderingEngine) renderingEngine.resize(true, false); });

await refreshStudies(); window.cbct.rendererReady();
