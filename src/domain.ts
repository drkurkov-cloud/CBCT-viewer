export interface SeriesCandidate {
  uid: string;
  rows: number;
  columns: number;
  modality: string;
  files: string[];
}

export function sanitizePatientName(value: string): string {
  const normalized = value.replace(/\^/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown Patient';
  return normalized.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 120);
}

export function normalizeStudyDate(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return 'Unknown-Date';
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function displayStudyDate(value: string): string {
  const normalized = normalizeStudyDate(value);
  if (normalized === 'Unknown-Date') return 'Date unknown';
  const [year, month, day] = normalized.split('-');
  return `${day}.${month}.${year}`;
}

export function studyFolderName(patientName: string, studyDate: string): string {
  return `${sanitizePatientName(patientName)}_${normalizeStudyDate(studyDate)}`;
}

export function selectMainSeries(series: SeriesCandidate[]): SeriesCandidate | undefined {
  return [...series]
    .filter((item) => item.rows > 0 && item.columns > 0 && item.files.length > 1)
    .sort((a, b) => {
      const modalityA = /^(CT|CBCT)$/i.test(a.modality) ? 1 : 0;
      const modalityB = /^(CT|CBCT)$/i.test(b.modality) ? 1 : 0;
      return modalityB - modalityA || b.files.length - a.files.length ||
        b.rows * b.columns - a.rows * a.columns || a.uid.localeCompare(b.uid);
    })[0];
}

export interface Point2D { x: number; y: number }

export function createDentalCurve(width: number, height: number, samples = 96): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = -1 + (2 * i) / Math.max(1, samples - 1);
    points.push({ x: width * (0.5 + 0.38 * t), y: height * (0.32 + 0.29 * t * t) });
  }
  return points;
}
