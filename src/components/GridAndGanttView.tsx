import React from 'react';
import { TASK_STATE_META } from '../data/blueprints';
import {
  HistoricalDagRun,
  TaskNode,
  TaskRunSnapshot,
  TaskState,
} from '../types/airflow';

interface GridAndGanttViewProps {
  tasks: TaskNode[];
  historicalRuns: HistoricalDagRun[];
  runSnapshots: Record<string, TaskRunSnapshot>;
  runStartedAtMs: number | null;
}

const STATE_COLOR_SWATCH: Record<TaskState, string> = {
  none: 'bg-slate-200',
  scheduled: 'bg-sky-300',
  queued: 'bg-slate-400',
  running: 'bg-teal-500',
  up_for_retry: 'bg-amber-500',
  success: 'bg-emerald-600',
  failed: 'bg-red-600',
  upstream_failed: 'bg-orange-500',
  skipped: 'bg-fuchsia-500',
};

export const GridAndGanttView: React.FC<GridAndGanttViewProps> = ({
  tasks,
  historicalRuns,
  runSnapshots,
  runStartedAtMs,
}) => {
  const hasLiveRun = Object.keys(runSnapshots).length > 0;
  const maxEndMs = Math.max(
    1000,
    ...Object.values(runSnapshots).map((s) =>
      s.endedAtMs && runStartedAtMs
        ? s.endedAtMs - runStartedAtMs
        : s.startedAtMs && runStartedAtMs
        ? Date.now() - runStartedAtMs
        : 0
    )
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Task Run Grid Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              DAG Run Grid
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Task instance states across recent scheduled runs and your active run
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {historicalRuns.length + (hasLiveRun ? 1 : 0)} runs
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Task ID</th>
                {historicalRuns.map((run) => (
                  <th
                    key={run.runId}
                    className="px-2 py-2 text-center font-mono text-[11px] font-normal tabular-nums"
                    title={run.logicalDate}
                  >
                    {run.logicalDate.slice(5, 10)}
                  </th>
                ))}
                {hasLiveRun && (
                  <th className="px-2 py-2 text-center font-mono text-[11px] font-semibold text-teal-700">
                    Active
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => {
                const liveState: TaskState = runSnapshots[task.id]?.state || 'none';
                return (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-800 max-w-[180px] truncate">
                      {task.id}
                    </td>
                    {historicalRuns.map((run) => {
                      const entry = run.taskStates[task.id] || {
                        state: 'none' as TaskState,
                        durationSec: 0,
                      };
                      const meta = TASK_STATE_META[entry.state];
                      return (
                        <td key={run.runId} className="px-2 py-2 text-center">
                          <div
                            title={`${task.id} · ${meta.label} · ${entry.durationSec}s`}
                            className={`mx-auto h-5 w-5 rounded ${STATE_COLOR_SWATCH[entry.state]}`}
                          />
                        </td>
                      );
                    })}
                    {hasLiveRun && (
                      <td className="px-2 py-2 text-center">
                        <div
                          title={`${task.id} · ${TASK_STATE_META[liveState].label}`}
                          className={`mx-auto h-5 w-5 rounded ring-1 ring-slate-300 ${STATE_COLOR_SWATCH[liveState]}`}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
          {(['success', 'running', 'up_for_retry', 'failed', 'upstream_failed', 'skipped'] as TaskState[]).map(
            (st) => (
              <span key={st} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${STATE_COLOR_SWATCH[st]}`} />
                <span>{TASK_STATE_META[st].label}</span>
              </span>
            )
          )}
        </div>
      </div>

      {/* Gantt Execution Timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Active Run Gantt Timeline
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Parallel concurrency and critical-path duration per task
            </p>
          </div>
          <span className="font-mono text-xs text-slate-600 tabular-nums">
            {hasLiveRun ? `${(maxEndMs / 1000).toFixed(2)}s elapsed` : 'Ready'}
          </span>
        </div>

        {!hasLiveRun ? (
          <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
            <div>
              <p className="text-xs font-medium text-slate-700">
                No active simulation run recorded
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Click Run DAG to populate real-time Gantt task intervals and durations.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => {
              const snap = runSnapshots[task.id];
              const state: TaskState = snap?.state || 'none';
              const startOffset =
                snap?.startedAtMs && runStartedAtMs
                  ? Math.max(0, snap.startedAtMs - runStartedAtMs)
                  : 0;
              const endOffset =
                snap?.endedAtMs && runStartedAtMs
                  ? Math.max(startOffset + 100, snap.endedAtMs - runStartedAtMs)
                  : snap?.startedAtMs && runStartedAtMs
                  ? Math.max(startOffset + 150, maxEndMs)
                  : startOffset;

              const leftPct = Math.min(92, (startOffset / maxEndMs) * 100);
              const widthPct =
                snap?.startedAtMs
                  ? Math.max(4, ((endOffset - startOffset) / maxEndMs) * 100)
                  : 0;

              return (
                <div key={task.id} className="grid grid-cols-12 items-center gap-3 text-xs">
                  <div className="col-span-4 truncate font-mono text-[11px] text-slate-700">
                    {task.id}
                  </div>
                  <div className="col-span-6 relative h-5 rounded bg-slate-100 overflow-hidden">
                    {widthPct > 0 && (
                      <div
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        className={`absolute top-0.5 bottom-0.5 rounded ${STATE_COLOR_SWATCH[state]} transition-all duration-150`}
                      />
                    )}
                  </div>
                  <div className="col-span-2 text-right font-mono text-[11px] text-slate-600 tabular-nums">
                    {snap?.endedAtMs && snap?.startedAtMs
                      ? `${((snap.endedAtMs - snap.startedAtMs) / 1000).toFixed(1)}s`
                      : TASK_STATE_META[state].label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
