import { describe, expect, it } from 'vitest';
import { createDentalCurve, displayStudyDate, sanitizePatientName, selectMainSeries, studyFolderName } from './domain';

describe('portable study naming', () => {
  it('creates a safe Patient Name_YYYY-MM-DD folder without touching source filenames', () => {
    expect(studyFolderName('Ivanov^Ivan^Ivanovich', '20261109')).toBe('Ivanov Ivan Ivanovich_2026-11-09');
    expect(sanitizePatientName('A/B:C*D')).toBe('A_B_C_D');
    expect(displayStudyDate('20261109')).toBe('09.11.2026');
  });
});

describe('main CBCT series selection', () => {
  it('prefers a CT volume and then its slice count', () => {
    const selected = selectMainSeries([
      { uid: 'localizer', rows: 1024, columns: 1024, modality: 'CR', files: ['a', 'b', 'c'] },
      { uid: 'cbct', rows: 512, columns: 512, modality: 'CT', files: Array.from({ length: 300 }, (_, i) => `${i}`) }
    ]);
    expect(selected?.uid).toBe('cbct');
  });
});

describe('dental reconstruction geometry', () => {
  it('creates a symmetric U-shaped dental curve inside the axial matrix', () => {
    const curve = createDentalCurve(400, 300, 21);
    expect(curve).toHaveLength(21);
    expect(curve[0].x).toBeCloseTo(48);
    expect(curve[20].x).toBeCloseTo(352);
    expect(curve[0].y).toBeCloseTo(curve[20].y);
    expect(curve[10].y).toBeLessThan(curve[0].y);
  });
});
