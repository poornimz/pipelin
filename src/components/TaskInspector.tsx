import React, { useState } from 'react';
import { Link2, Terminal, Trash2 } from 'lucide-react';
import { OPERATOR_META, TASK_STATE_META } from '../data/blueprints';
import {
  DagEdge,
  OperatorType,
  TaskNode,
  TaskRunSnapshot,
  TriggerRule,
} from '../types/airflow';

interface TaskInspectorProps {
  task: TaskNode | null;
  allTasks: TaskNode[];
  edges: DagEdge[];
  snapshot?: TaskRunSnapshot;
  isRunning: boolean;
  isConnecting: boolean;
  onUpdateTask: (updated: TaskNode) => void;
  onStartConnect: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const OPERATORS: OperatorType[] = [
  'TaskFlow',
  'PythonOperator',
  'BashOperator',
  'SQLExecuteQueryOperator',
  'S3KeySensor',
  'BranchPythonOperator',
  'EmptyOperator',
  'TriggerDagRunOperator',
];

const TRIGGER_RULES: TriggerRule[] = [
  'all_success',
  'none_failed_min_one_success',
  'all_done',
  'one_success',
  'all_failed',
];

export const TaskInspector: React.FC<TaskInspectorProps> = ({
  task,
  allTasks,
  edges,
  snapshot,
  isRunning,
  isConnecting,
  onUpdateTask,
  onStartConnect,
  onDeleteTask,
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');

  if (!task) {
    return (
      <div className="flex h-full flex-col justify-center rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="font-display text-sm font-semibold text-slate-900">
          Select a task node
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Click any task in the DAG graph to edit its operator, retries, trigger rule, or inspect execution logs and XComs.
        </p>
      </div>
    );
  }

  const downstreamIds = edges
    .filter((e) => e.source === task.id)
    .map((e) => e.target);
  const state = snapshot?.state || 'none';
  const stateMeta = TASK_STATE_META[state];

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono truncate">{task.id}</span>
            <span aria-hidden="true">·</span>
            <span className={`font-medium ${stateMeta.text}`}>{stateMeta.label}</span>
          </div>
          <h3 className="mt-0.5 font-display text-sm font-semibold text-slate-900 truncate">
            {task.label}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isRunning}
            onClick={() => onStartConnect(task.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
              isConnecting
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>{isConnecting ? 'Cancel Link' : 'Link Downstream'}</span>
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => onDeleteTask(task.id)}
            aria-label="Delete task"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50/70 px-4 py-2">
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'config'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Configuration
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === 'logs'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>Logs & XCom</span>
        </button>
      </div>

      {activeTab === 'config' ? (
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Task Label
            </label>
            <input
              type="text"
              value={task.label}
              disabled={isRunning}
              onChange={(e) => onUpdateTask({ ...task, label: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Operator
            </label>
            <select
              value={task.operator}
              disabled={isRunning}
              onChange={(e) => {
                const nextOp = e.target.value as OperatorType;
                onUpdateTask({
                  ...task,
                  operator: nextOp,
                  payload: OPERATOR_META[nextOp].defaultPayload,
                });
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              {OPERATOR_META[task.operator].description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Retries
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={task.retries}
                disabled={isRunning}
                onChange={(e) =>
                  onUpdateTask({
                    ...task,
                    retries: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono tabular-nums text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Retry Delay (sec)
              </label>
              <input
                type="number"
                min={1}
                max={300}
                value={task.retryDelaySec}
                disabled={isRunning}
                onChange={(e) =>
                  onUpdateTask({
                    ...task,
                    retryDelaySec: Math.max(1, Number(e.target.value) || 5),
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono tabular-nums text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Trigger Rule
              </label>
              <select
                value={task.triggerRule}
                disabled={isRunning}
                onChange={(e) =>
                  onUpdateTask({
                    ...task,
                    triggerRule: e.target.value as TriggerRule,
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {TRIGGER_RULES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Execution Pool
              </label>
              <input
                type="text"
                value={task.pool}
                disabled={isRunning}
                onChange={(e) => onUpdateTask({ ...task, pool: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {task.operator === 'BranchPythonOperator' && downstreamIds.length > 0 && (
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Simulated Branch Target
              </label>
              <select
                value={task.branchTarget || downstreamIds[0]}
                disabled={isRunning}
                onChange={(e) =>
                  onUpdateTask({ ...task, branchTarget: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {downstreamIds.map((id) => {
                  const found = allTasks.find((t) => t.id === id);
                  return (
                    <option key={id} value={id}>
                      {id} ({found?.label || id})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Task Payload / Command
            </label>
            <textarea
              rows={3}
              value={task.payload}
              disabled={isRunning}
              onChange={(e) => onUpdateTask({ ...task, payload: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800 focus:border-teal-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div>
              <p className="font-medium text-slate-900">Simulate Task Failure</p>
              <p className="text-[11px] text-slate-500">
                Test retries and downstream trigger_rule behavior
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={task.simulateFail}
              disabled={isRunning}
              onClick={() =>
                onUpdateTask({ ...task, simulateFail: !task.simulateFail })
              }
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${
                task.simulateFail ? 'bg-red-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  task.simulateFail ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span>
              Attempt:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {snapshot ? `${snapshot.attempt}/${snapshot.maxAttempts}` : `0/${task.retries + 1}`}
              </strong>
            </span>
            <span>
              Duration:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {snapshot?.startedAtMs && snapshot?.endedAtMs
                  ? `${((snapshot.endedAtMs - snapshot.startedAtMs) / 1000).toFixed(2)}s`
                  : '—'}
              </strong>
            </span>
          </div>

          {snapshot?.xcomValue && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="font-medium text-slate-700 mb-1">
                Pushed XCom (return_value)
              </div>
              <pre className="overflow-x-auto font-mono text-[11px] text-teal-800">
                {snapshot.xcomValue}
              </pre>
            </div>
          )}

          <div className="rounded-lg bg-slate-900 p-3 text-slate-100">
            <div className="mb-2 text-[11px] font-medium text-slate-400">
              Worker Execution Log
            </div>
            {snapshot && snapshot.logs.length > 0 ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-200">
                {snapshot.logs.join('\n')}
              </pre>
            ) : (
              <p className="font-mono text-[11px] text-slate-400">
                No execution logs yet. Click Run DAG to execute this task.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
