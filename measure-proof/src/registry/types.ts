export const METRIC_TYPES = ['page', 'feature', 'timing', 'edge'] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export interface Metric {
  name: string;
  type: MetricType;
  description: string;
  /** YYYY-MM-DD. Honored at runtime by the generated client (E6). */
  expires: string;
  /** Plain-language line shown to the user in the disclosure panel. */
  disclosure: string;
  /** edge only. */
  from?: string;
  to?: string;
  /**
   * Open-world: any additional declared fields (page `info`, timing `unit`,
   * feature `label`, and anything unknown) are preserved verbatim, never
   * required. Matches the repo's open-world atproto-read posture.
   */
  extra: Record<string, string>;
}

export interface Registry {
  metrics: Metric[];
  byName: Map<string, Metric>;
}

/** What the disclosure panel renders — derived ONLY from the registry. */
export interface PanelEntry {
  name: string;
  type: MetricType;
  disclosure: string;
  expires: string;
}
