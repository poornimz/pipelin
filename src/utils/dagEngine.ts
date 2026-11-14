import { DagEdge, TaskNode, TaskState, TriggerRule } from '../types/airflow';

/**
 * Checks if adding an edge source -> target would create a cycle in the DAG.
 */
export function wouldCreateCycle(
  tasks: TaskNode[],
  edges: DagEdge[],
  source: string,
  target: string
): boolean {
  if (source === target) return true;
  // Check if target can already reach source
  const adj = new Map<string, string[]>();
  tasks.forEach((t) => adj.set(t.id, []));
  edges.forEach((e) => {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
  });

  const visited = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (curr === source) return true;
    if (!visited.has(curr)) {
      visited.add(curr);
      const next = adj.get(curr) || [];
      next.forEach((n) => stack.push(n));
    }
  }
  return false;
}

/**
 * Computes clean topological layers (depth) for auto-layout.
 */
export function computeTopologicalLayout(
  tasks: TaskNode[],
  edges: DagEdge[]
): Record<string, { x: number; y: number }> {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const depth = new Map<string, number>();

  tasks.forEach((t) => {
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
    depth.set(t.id, 0);
  });

  edges.forEach((e) => {
    if (inDegree.has(e.target) && adj.has(e.source)) {
      adj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  while (queue.length > 0) {
    const u = queue.shift()!;
    const uDepth = depth.get(u) || 0;
    for (const v of adj.get(u) || []) {
      depth.set(v, Math.max(depth.get(v) || 0, uDepth + 1));
      inDegree.set(v, (inDegree.get(v) || 1) - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  const layers = new Map<number, TaskNode[]>();
  tasks.forEach((t) => {
    const d = depth.get(t.id) || 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(t);
  });

  const positions: Record<string, { x: number; y: number }> = {};
  const colWidth = 255;
  const rowHeight = 132;
  const baseX = 40;
  const centerY = 175;

  layers.forEach((layerTasks, layerIdx) => {
    const totalHeight = (layerTasks.length - 1) * rowHeight;
    const startY = Math.max(28, centerY - totalHeight / 2);
    layerTasks.forEach((t, idx) => {
      positions[t.id] = {
        x: baseX + layerIdx * colWidth,
        y: Math.round(startY + idx * rowHeight),
      };
    });
  });

  return positions;
}

/**
 * Evaluates Airflow trigger rule given upstream task states.
 * Returns 'ready' | 'wait' | 'upstream_failed' | 'skipped'.
 */
export function evaluateTriggerRule(
  task: TaskNode,
  upstreamIds: string[],
  states: Record<string, TaskState>,
  skippedByBranch: Set<string>
): 'ready' | 'wait' | 'upstream_failed' | 'skipped' {
  if (skippedByBranch.has(task.id)) {
    return 'skipped';
  }
  if (upstreamIds.length === 0) {
    return 'ready';
  }

  const upStates = upstreamIds.map((id) => states[id] || 'none');
  const terminal = new Set<TaskState>(['success', 'failed', 'upstream_failed', 'skipped']);
  const allTerminal = upStates.every((s) => terminal.has(s));

  const countSuccess = upStates.filter((s) => s === 'success').length;
  const countFailed = upStates.filter((s) => s === 'failed' || s === 'upstream_failed').length;
  const countSkipped = upStates.filter((s) => s === 'skipped').length;

  const rule: TriggerRule = task.triggerRule;

  switch (rule) {
    case 'all_success':
      if (countFailed > 0) return 'upstream_failed';
      if (countSkipped > 0 && allTerminal) return 'skipped';
      if (countSuccess === upstreamIds.length) return 'ready';
      return 'wait';

    case 'all_done':
      return allTerminal ? 'ready' : 'wait';

    case 'one_success':
      if (countSuccess >= 1) return 'ready';
      if (allTerminal) return 'upstream_failed';
      return 'wait';

    case 'all_failed':
      if (!allTerminal) return 'wait';
      return countFailed === upstreamIds.length ? 'ready' : 'skipped';

    case 'none_failed_min_one_success':
      if (countFailed > 0) return 'upstream_failed';
      if (!allTerminal) return 'wait';
      return countSuccess >= 1 ? 'ready' : 'skipped';

    default:
      return allTerminal ? 'ready' : 'wait';
  }
}

export function buildTaskLogLines(
  task: TaskNode,
  dagId: string,
  attempt: number,
  outcome: 'running' | 'retry' | 'failed' | 'success' | 'skipped',
  ds = '2026-11-14'
): string[] {
  const ts = new Date().toISOString();
  const base = [
    `[${ts}] {taskinstance.py:1245} INFO - Dependencies all met for <TaskInstance: ${dagId}.${task.id} manual__${ds} [queued]>`,
    `[${ts}] {taskinstance.py:1418} INFO - Starting attempt ${attempt} of ${task.retries + 1} (pool=${task.pool})`,
    `[${ts}] {taskinstance.py:1442} INFO - Executing <Task(${task.operator}): ${task.id}>`,
  ];

  if (outcome === 'running') {
    return base;
  }
  if (outcome === 'retry') {
    return [
      ...base,
      `[${ts}] {taskinstance.py:1932} ERROR - Task failed with simulated transient error (ConnectionTimeoutError)`,
      `[${ts}] {taskinstance.py:1968} INFO - Marking task as UP_FOR_RETRY. Retry delay: ${task.retryDelaySec}s`,
    ];
  }
  if (outcome === 'failed') {
    return [
      ...base,
      `[${ts}] {taskinstance.py:1932} ERROR - Task failed after ${attempt} attempt(s). No retries remaining.`,
      `[${ts}] {taskinstance.py:1985} INFO - Marking task as FAILED. Downstream tasks with trigger_rule="all_success" will be marked upstream_failed.`,
    ];
  }
  if (outcome === 'skipped') {
    return [
      `[${ts}] {taskinstance.py:1504} INFO - Task skipped due to upstream BranchPythonOperator or trigger_rule="${task.triggerRule}".`,
    ];
  }

  return [
    ...base,
    `[${ts}] {logging_mixin.py:188} INFO - Completed payload: ${task.payload.split('\n')[0]}`,
    ...(task.xcomOutput
      ? [`[${ts}] {xcom.py:294} INFO - Pushing XCom return_value=${task.xcomOutput}`]
      : []),
    `[${ts}] {taskinstance.py:1488} INFO - Marking task as SUCCESS. Duration: ${(task.durationMs / 1000).toFixed(2)}s`,
  ];
}
