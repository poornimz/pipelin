export type OperatorType =
  | 'TaskFlow'
  | 'PythonOperator'
  | 'BashOperator'
  | 'SQLExecuteQueryOperator'
  | 'S3KeySensor'
  | 'BranchPythonOperator'
  | 'EmptyOperator'
  | 'TriggerDagRunOperator';

export type TaskState =
  | 'none'
  | 'scheduled'
  | 'queued'
  | 'running'
  | 'up_for_retry'
  | 'success'
  | 'failed'
  | 'upstream_failed'
  | 'skipped';

export type TriggerRule =
  | 'all_success'
  | 'all_failed'
  | 'all_done'
  | 'one_success'
  | 'none_failed_min_one_success';

export type CodeStyle = 'taskflow' | 'classic';

export interface TaskNode {
  id: string;
  label: string;
  operator: OperatorType;
  x: number;
  y: number;
  retries: number;
  retryDelaySec: number;
  triggerRule: TriggerRule;
  pool: string;
  durationMs: number;
  payload: string;
  simulateFail: boolean;
  branchTarget?: string;
  xcomOutput?: string;
}

export interface DagEdge {
  id: string;
  source: string;
  target: string;
}

export interface DagConfig {
  dagId: string;
  description: string;
  schedule: string;
  catchup: boolean;
  maxActiveRuns: number;
  tags: string[];
  owner: string;
}

export interface DagBlueprint {
  id: string;
  name: string;
  summary: string;
  config: DagConfig;
  tasks: TaskNode[];
  edges: DagEdge[];
}

export interface TaskRunSnapshot {
  taskId: string;
  state: TaskState;
  attempt: number;
  maxAttempts: number;
  startedAtMs?: number;
  endedAtMs?: number;
  xcomValue?: string;
  logs: string[];
}

export interface HistoricalDagRun {
  runId: string;
  logicalDate: string;
  state: 'success' | 'failed';
  durationSec: number;
  taskStates: Record<string, { state: TaskState; durationSec: number }>;
}

export type AppSection = 'studio' | 'architecture' | 'intervals' | 'patterns';
export type StudioSubView = 'graph' | 'grid' | 'code';
