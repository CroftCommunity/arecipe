export type SnapFile = {
  file: string; route: string; viewport: string; width: number; height: number;
  baseline: string; population: string; url?: string;
};
export type SnapsManifest = { capturedAt: string; files: SnapFile[] };
export function mergeManifest(existing: SnapsManifest | null, run: SnapsManifest): SnapsManifest;
