import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { licenseStatus } from './license.js';

const require = createRequire(import.meta.url);
const dicomParser = require('dicom-parser');
const { path7za } = require('7zip-bin');
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const smokeMode = process.argv.includes('--smoke-test');

const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
const dataRoot = smokeMode ? path.join(app.getPath('temp'), 'CBCT-Viewer-Smoke') : path.join(portableRoot, 'Data');
const studiesRoot = path.join(dataRoot, 'Studies');
const indexPath = path.join(dataRoot, 'studies.json');
let mainWindow;

function cleanPatientName(value) {
  const normalized = String(value || '').replace(/\^/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown Patient';
  return normalized.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 120);
}

function normalizedDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : 'Unknown-Date';
}

function displayDate(value) {
  const date = normalizedDate(value);
  if (date === 'Unknown-Date') return 'Date unknown';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

async function ensureDataLayout() {
  await fs.mkdir(studiesRoot, { recursive: true });
  try { await fs.access(indexPath); } catch { await fs.writeFile(indexPath, '[]\n', 'utf8'); }
}

async function readIndex() {
  await ensureDataLayout();
  try {
    const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(studies) {
  await fs.writeFile(indexPath, `${JSON.stringify(studies, null, 2)}\n`, 'utf8');
}

async function walk(folder) {
  const files = [];
  const pending = [folder];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  return files;
}

function parseDicom(bytes, filePath) {
  try {
    const dataSet = dicomParser.parseDicom(new Uint8Array(bytes), { untilTag: 'x7fe00010' });
    const rows = dataSet.uint16('x00280010') || 0;
    const columns = dataSet.uint16('x00280011') || 0;
    const seriesUid = dataSet.string('x0020000e') || 'missing-series-uid';
    return {
      filePath,
      patientName: dataSet.string('x00100010') || 'Unknown Patient',
      patientId: dataSet.string('x00100020') || '',
      studyDate: dataSet.string('x00080020') || '',
      seriesUid,
      seriesDescription: dataSet.string('x0008103e') || 'CBCT series',
      modality: dataSet.string('x00080060') || 'CT',
      instanceNumber: Number.parseInt(dataSet.string('x00200013') || '0', 10) || 0,
      rows,
      columns
    };
  } catch {
    return null;
  }
}

async function scanDicom(folder) {
  const images = [];
  for (const filePath of await walk(folder)) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size < 132 || stats.size > 1024 * 1024 * 1024) continue;
      const image = parseDicom(await fs.readFile(filePath), filePath);
      if (image?.rows && image?.columns) images.push(image);
    } catch { /* unreadable files are ignored */ }
  }
  const grouped = new Map();
  for (const image of images) {
    const key = `${image.seriesUid}|${image.rows}x${image.columns}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(image);
  }
  const series = [...grouped.values()].filter((items) => items.length > 1);
  series.sort((a, b) => {
    const ctA = /^(CT|CBCT)$/i.test(a[0].modality) ? 1 : 0;
    const ctB = /^(CT|CBCT)$/i.test(b[0].modality) ? 1 : 0;
    return ctB - ctA || b.length - a.length ||
      b[0].rows * b[0].columns - a[0].rows * a[0].columns;
  });
  if (!series.length) throw new Error('No multi-slice DICOM/CBCT series was detected.');
  for (const items of series) items.sort((a, b) => a.instanceNumber - b.instanceNumber || a.filePath.localeCompare(b.filePath));
  return { selected: series[0], detectedSeriesCount: series.length, dicomFiles: images.map((image) => image.filePath) };
}

async function uniqueStudyFolder(baseName) {
  let candidate = baseName;
  let index = 2;
  while (true) {
    try { await fs.access(path.join(studiesRoot, candidate)); candidate = `${baseName}-${index++}`; }
    catch { return candidate; }
  }
}

async function copyDetectedDicom(scanRoot, files, destination) {
  for (const source of files) {
    let relative = path.relative(scanRoot, source);
    if (relative.startsWith('..') || path.isAbsolute(relative)) relative = path.basename(source);
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

async function importFolder(scanRoot) {
  const scan = await scanDicom(scanRoot);
  const first = scan.selected[0];
  const baseName = `${cleanPatientName(first.patientName)}_${normalizedDate(first.studyDate)}`;
  const folderName = await uniqueStudyFolder(baseName);
  const destination = path.join(studiesRoot, folderName);
  await fs.mkdir(destination, { recursive: false });
  try {
    await copyDetectedDicom(scanRoot, scan.dicomFiles, destination);
    const selectedRelative = scan.selected.map((item) => path.relative(scanRoot, item.filePath));
    const study = {
      id: crypto.randomUUID(),
      patientName: cleanPatientName(first.patientName),
      patientId: first.patientId,
      studyDate: normalizedDate(first.studyDate),
      displayDate: displayDate(first.studyDate),
      seriesDescription: first.seriesDescription,
      modality: first.modality,
      sliceCount: scan.selected.length,
      detectedSeriesCount: scan.detectedSeriesCount,
      folderName,
      importedAt: new Date().toISOString(),
      seriesFiles: selectedRelative
    };
    const studies = await readIndex();
    studies.unshift(study);
    await writeIndex(studies);
    const { seriesFiles: ignored, ...summary } = study;
    return summary;
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    throw error;
  }
}

async function extractArchive(archivePath) {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'cbct-import-'));
  const executable = app.isPackaged ? path7za.replace('app.asar', 'app.asar.unpacked') : path7za;
  await execFileAsync(executable, ['x', archivePath, `-o${output}`, '-y'], { windowsHide: true });
  return output;
}

async function downloadSource(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Enter a valid HTTPS link.'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS links are supported.');
  const response = await net.fetch(parsed.toString(), { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cbct-download-'));
  const name = decodeURIComponent(path.basename(parsed.pathname)) || 'download.dcm';
  const target = path.join(folder, name.replace(/[<>:"/\\|?*]/g, '_'));
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

async function chooseSource(kind, suppliedUrl) {
  const archiveKinds = new Set(['archive']);
  const linkKinds = new Set(['cloud', 'email']);
  if (linkKinds.has(kind)) {
    const downloaded = await downloadSource(suppliedUrl || '');
    if (/\.(zip|7z)$/i.test(downloaded)) return { folder: await extractArchive(downloaded), temporary: true };
    return { folder: path.dirname(downloaded), temporary: true };
  }
  if (archiveKinds.has(kind)) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select ZIP or 7z archive', properties: ['openFile'],
      filters: [{ name: 'DICOM archives', extensions: ['zip', '7z'] }]
    });
    if (result.canceled) return null;
    return { folder: await extractArchive(result.filePaths[0]), temporary: true };
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: kind === 'disc' ? 'Select CD/DVD study folder' : kind === 'usb' ? 'Select USB study folder' :
      kind === 'network' ? 'Select network study folder' : 'Select DICOM study folder',
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return { folder: result.filePaths[0], temporary: false };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 720, show: !smokeMode,
    backgroundColor: '#090c10', titleBarStyle: 'hidden', titleBarOverlay: { color: '#0c1117', symbolColor: '#dce7f2', height: 44 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  await mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
}

ipcMain.handle('studies:list', async () => (await readIndex()).map(({ seriesFiles, ...study }) => study));
ipcMain.handle('import:source', async (_event, { kind, url }) => {
  let source;
  try {
    source = await chooseSource(kind, url);
    if (!source) return { canceled: true };
    return { study: await importFolder(source.folder) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (source?.temporary) await fs.rm(source.folder, { recursive: true, force: true }).catch(() => {});
  }
});
ipcMain.handle('study:open', async (_event, id) => {
  const study = (await readIndex()).find((item) => item.id === id);
  if (!study) throw new Error('Study not found.');
  const files = study.seriesFiles.map((relative) => path.join(studiesRoot, study.folderName, relative));
  const { seriesFiles, ...summary } = study;
  return { ...summary, files };
});
ipcMain.handle('file:read', async (_event, filePath) => {
  const resolved = path.resolve(filePath);
  const allowed = `${path.resolve(studiesRoot)}${path.sep}`;
  if (!resolved.startsWith(allowed)) throw new Error('File is outside the portable study store.');
  return new Uint8Array(await fs.readFile(resolved));
});
ipcMain.handle('data:reveal', async () => shell.openPath(dataRoot));

ipcMain.on('renderer:ready', () => {
  if (smokeMode) setTimeout(() => app.exit(0), 250);
});

app.whenReady().then(async () => {
  licenseStatus();
  await ensureDataLayout();
  await createWindow();
  // The first packaged start on a clean Windows runner includes portable
  // extraction and parsing the Cornerstone imaging bundle.  Keep the smoke
  // watchdog long enough for that cold path while still failing a hung app.
  if (smokeMode) setTimeout(() => app.exit(2), 120000);
});
app.on('window-all-closed', () => app.quit());
