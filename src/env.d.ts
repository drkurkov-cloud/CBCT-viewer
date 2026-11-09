export {};

declare global {
  interface StudySummary {
    id: string;
    patientName: string;
    patientId: string;
    studyDate: string;
    displayDate: string;
    seriesDescription: string;
    modality: string;
    sliceCount: number;
    detectedSeriesCount: number;
    folderName: string;
    importedAt: string;
  }

  interface OpenStudyResult extends StudySummary { files: string[]; }

  interface Window {
    cbct: {
      listStudies(): Promise<StudySummary[]>;
      importSource(kind: string, url?: string): Promise<{ canceled?: boolean; study?: StudySummary; error?: string }>;
      openStudy(id: string): Promise<OpenStudyResult>;
      readFile(path: string): Promise<Uint8Array>;
      revealData(): Promise<void>;
      rendererReady(): void;
    };
  }
}
