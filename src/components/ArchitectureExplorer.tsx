import React, { useState } from 'react';
import { ArrowRight, Database, FileCode2, Globe, Layers, Play, Server, Zap } from 'lucide-react';
import { ARCHITECTURE_NODES, EXECUTOR_COMPARISONS } from '../data/concepts';

interface LifecycleStep {
  step: number;
  title: string;
  activeNodeId: string;
  summary: string;
}

const LIFECYCLE_STEPS: LifecycleStep[] = [
  {
    step: 1,
    title: 'Parse DAG Definitions',
    activeNodeId: 'dag_folder',
    summary:
      'The DAG Processor scans Python files in dags/ every parse interval, extracting task topology and schedules without running task payloads.',
  },
  {
    step: 2,
    title: 'Create DagRun & Schedule Tasks',
    activeNodeId: 'scheduler',
    summary:
      'Once a data interval ends, the Scheduler creates a DagRun record and evaluates upstream dependencies and trigger rules for each TaskInstance.',
  },
  {
    step: 3,
    title: 'Persist Queued State',
    activeNodeId: 'metadata_db',
    summary:
      'TaskInstances transition from scheduled to queued in the Metadata DB so every component shares an atomic, lock-safe view of state.',
  },
  {
    step: 4,
    title: 'Dispatch to Workers',
    activeNodeId: 'executor',
    summary:
      'The Executor claims queued tasks and dispatches them to subprocesses, Celery workers, or ephemeral Kubernetes Pods to run your Python/SQL/Bash code.',
  },
  {
    step: 5,
    title: 'Defer Async Sensors',
    activeNodeId: 'triggerer',
    summary:
      'Deferrable operators yield their worker slot immediately and hand off polling (such as waiting on S3 or external jobs) to the lightweight asyncio Triggerer.',
  },
  {
    step: 6,
    title: 'Inspect Logs & State in UI',
    activeNodeId: 'webserver',
    summary:
      'The Webserver reads DagRun state directly from the Metadata DB and streams remote worker logs from object storage to engineers.',
  },
];

function NodeIcon({ id }: { id: string }) {
  switch (id) {
    case 'dag_folder':
      return <FileCode2 className="h-4 w-4 text-teal-700" />;
    case 'scheduler':
      return <Layers className="h-4 w-4 text-teal-700" />;
    case 'metadata_db':
      return <Database className="h-4 w-4 text-teal-700" />;
    case 'executor':
      return <Server className="h-4 w-4 text-teal-700" />;
    case 'triggerer':
      return <Zap className="h-4 w-4 text-teal-700" />;
    default:
      return <Globe className="h-4 w-4 text-teal-700" />;
  }
}

export const ArchitectureExplorer: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('scheduler');
  const [activeStepIdx, setActiveStepIdx] = useState<number>(1);

  const selectedNode =
    ARCHITECTURE_NODES.find((n) => n.id === selectedNodeId) ||
    ARCHITECTURE_NODES[0];

  const handleSelectStep = (idx: number) => {
    setActiveStepIdx(idx);
    setSelectedNodeId(LIFECYCLE_STEPS[idx].activeNodeId);
  };

  const handleAdvanceStep = () => {
    const next = (activeStepIdx + 1) % LIFECYCLE_STEPS.length;
    handleSelectStep(next);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Apache Airflow Architecture
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Explore how Airflow separates pipeline authoring, scheduling, state coordination, and distributed task execution across independent processes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAdvanceStep}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Play className="h-3.5 w-3.5" />
          <span>Next Lifecycle Step ({activeStepIdx + 1}/{LIFECYCLE_STEPS.length})</span>
        </button>
      </div>

      {/* Lifecycle Strip */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {LIFECYCLE_STEPS.map((item, idx) => {
          const isCurrent = idx === activeStepIdx;
          return (
            <button
              key={item.step}
              type="button"
              onClick={() => handleSelectStep(idx)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                isCurrent
                  ? 'border-teal-700 bg-teal-50/70'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="font-mono text-[11px] font-medium text-slate-500 tabular-nums">
                Step 0{item.step}
              </div>
              <div className="mt-1 font-display text-xs font-semibold text-slate-900">
                {item.title}
              </div>
            </button>
          );
        })}
      </div>

      {/* Split Diagram + Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
            <span>Click any component to inspect its role & configuration</span>
            <span className="font-mono">Airflow Control & Data Plane</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ARCHITECTURE_NODES.map((node) => {
              const isSelected = node.id === selectedNodeId;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-teal-700 bg-teal-50/60 ring-2 ring-teal-600/15'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white">
                        <NodeIcon id={node.id} />
                      </span>
                      {isSelected && (
                        <span className="text-[11px] font-medium text-teal-800">
                          Selected
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 font-display text-sm font-semibold text-slate-900">
                      {node.name}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {node.role}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
                    <span>Links to</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="truncate">
                      {node.connections.join(', ')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">
              Active Walkthrough (Step {LIFECYCLE_STEPS[activeStepIdx].step}):{' '}
            </span>
            {LIFECYCLE_STEPS[activeStepIdx].summary}
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Component Specification</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{selectedNode.id}</span>
            </div>
            <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {selectedNode.name}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {selectedNode.role}
            </p>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-semibold text-slate-900">
                Core Responsibilities
              </h4>
              <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-600">
                {selectedNode.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal-700 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-1.5 text-xs font-medium text-slate-700">
              airflow.cfg / Environment Flags
            </div>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3.5 font-mono text-[11px] leading-relaxed text-teal-200">
              {selectedNode.configSnippet}
            </pre>
          </div>
        </div>
      </div>

      {/* Executor Comparison Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="font-display text-base font-semibold text-slate-900">
          Choosing an Airflow Executor
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Your Executor determines how queued TaskInstances are scaled and isolated across compute infrastructure.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-4 font-semibold">Executor</th>
                <th className="py-2.5 px-4 font-semibold">Architecture</th>
                <th className="py-2.5 px-4 font-semibold">Scaling Model</th>
                <th className="py-2.5 px-4 font-semibold">Task Isolation</th>
                <th className="py-2.5 pl-4 font-semibold">Recommended Workload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EXECUTOR_COMPARISONS.map((exec) => (
                <tr key={exec.name} className="hover:bg-slate-50">
                  <td className="py-3 pr-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    {exec.name}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{exec.architecture}</td>
                  <td className="py-3 px-4 text-slate-700">{exec.scaling}</td>
                  <td className="py-3 px-4 text-slate-700">{exec.isolation}</td>
                  <td className="py-3 pl-4 text-slate-700">{exec.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
