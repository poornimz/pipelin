import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FastForward,
  GitBranch,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { OPERATOR_META, TASK_STATE_META } from '../data/blueprints';
import { DagEdge, TaskNode, TaskRunSnapshot, TaskState } from '../types/airflow';

interface DagCanvasProps {
  tasks: TaskNode[];
  edges: DagEdge[];
  selectedTaskId: string | null;
  connectingFromId: string | null;
  runSnapshots: Record<string, TaskRunSnapshot>;
  isRunning: boolean;
  onSelectTask: (taskId: string) => void;
  onMoveTask: (taskId: string, x: number, y: number) => void;
  onCompleteConnect: (targetTaskId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
}

const NODE_WIDTH = 208;
const NODE_HEIGHT = 86;

function StateIcon({ state }: { state: TaskState }) {
  switch (state) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />;
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 text-teal-700 animate-spin shrink-0" />;
    case 'up_for_retry':
      return <RefreshCw className="h-3.5 w-3.5 text-amber-700 shrink-0" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-700 shrink-0" />;
    case 'upstream_failed':
      return <AlertTriangle className="h-3.5 w-3.5 text-orange-700 shrink-0" />;
    case 'skipped':
      return <FastForward className="h-3.5 w-3.5 text-fuchsia-700 shrink-0" />;
    case 'scheduled':
    case 'queued':
      return <Clock className="h-3.5 w-3.5 text-slate-600 shrink-0" />;
    default:
      return <GitBranch className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
  }
}

export const DagCanvas: React.FC<DagCanvasProps> = ({
  tasks,
  edges,
  selectedTaskId,
  connectingFromId,
  runSnapshots,
  isRunning,
  onSelectTask,
  onMoveTask,
  onCompleteConnect,
  onRemoveEdge,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const canvasWidth = Math.max(
    1180,
    ...tasks.map((t) => t.x + NODE_WIDTH + 80)
  );
  const canvasHeight = Math.max(
    410,
    ...tasks.map((t) => t.y + NODE_HEIGHT + 60)
  );

  const handlePointerDown = (e: React.PointerEvent, task: TaskNode) => {
    if (connectingFromId) {
      e.stopPropagation();
      onCompleteConnect(task.id);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDraggingId(task.id);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    onSelectTask(task.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent, task: TaskNode) => {
    if (draggingId !== task.id || !containerRef.current) return;
    const canvasRect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;
    const nextX = Math.max(16, Math.round(e.clientX - canvasRect.left + scrollLeft - dragOffset.x));
    const nextY = Math.max(16, Math.round(e.clientY - canvasRect.top + scrollTop - dragOffset.y));
    onMoveTask(task.id, nextX, nextY);
  };

  const handlePointerUp = () => {
    setDraggingId(null);
  };

  const taskMap = new Map<string, TaskNode>(tasks.map((t) => [t.id, t]));

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-auto rounded-xl border border-slate-200 bg-slate-50 dag-grid-bg"
      style={{ height: '430px' }}
    >
      {connectingFromId && (
        <div className="sticky top-3 left-3 z-20 inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-900 shadow-sm ml-3 mt-3">
          <Link2 className="h-3.5 w-3.5 text-teal-700" />
          <span>
            Select a downstream task to connect from{' '}
            <strong className="font-mono">{connectingFromId}</strong>
          </span>
        </div>
      )}

      <div
        className="relative"
        style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasWidth}
          height={canvasHeight}
        >
          <defs>
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#0d9488" />
            </marker>
            <marker
              id="arrow-failed"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const src = taskMap.get(edge.source);
            const tgt = taskMap.get(edge.target);
            if (!src || !tgt) return null;

            const x1 = src.x + NODE_WIDTH;
            const y1 = src.y + NODE_HEIGHT / 2;
            const x2 = tgt.x;
            const y2 = tgt.y + NODE_HEIGHT / 2;
            const dx = Math.max(48, Math.abs(x2 - x1) * 0.45);
            const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            const srcState = runSnapshots[src.id]?.state || 'none';
            const tgtState = runSnapshots[tgt.id]?.state || 'none';
            const isFlowing =
              isRunning && (srcState === 'success' && (tgtState === 'running' || tgtState === 'queued' || tgtState === 'scheduled'));
            const isFailedPath = srcState === 'failed' || srcState === 'upstream_failed';
            const isSuccessPath = srcState === 'success' && tgtState === 'success';

            let strokeColor = '#94a3b8';
            let marker = 'url(#arrow-default)';
            if (isFailedPath) {
              strokeColor = '#dc2626';
              marker = 'url(#arrow-failed)';
            } else if (isFlowing || isSuccessPath) {
              strokeColor = '#0d9488';
              marker = 'url(#arrow-active)';
            }

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g
                key={edge.id}
                className="pointer-events-auto"
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId(null)}
              >
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  className="cursor-pointer"
                />
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={hoveredEdgeId === edge.id ? 2.5 : 1.75}
                  markerEnd={marker}
                  className={isFlowing ? 'edge-flowing' : 'transition-colors duration-150'}
                />
                {hoveredEdgeId === edge.id && !isRunning && (
                  <g
                    transform={`translate(${midX - 11}, ${midY - 11})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveEdge(edge.id);
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      width="22"
                      height="22"
                      rx="6"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                    />
                    <Trash2 x="5" y="5" width="12" height="12" className="text-red-600" />
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {tasks.map((task) => {
          const snapshot = runSnapshots[task.id];
          const state: TaskState = snapshot?.state || 'none';
          const stateMeta = TASK_STATE_META[state];
          const opMeta = OPERATOR_META[task.operator];
          const isSelected = selectedTaskId === task.id;
          const isConnectSource = connectingFromId === task.id;

          return (
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              onPointerDown={(e) => handlePointerDown(e, task)}
              onPointerMove={(e) => handlePointerMove(e, task)}
              onPointerUp={handlePointerUp}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (connectingFromId) {
                    onCompleteConnect(task.id);
                  } else {
                    onSelectTask(task.id);
                  }
                }
              }}
              style={{
                transform: `translate(${task.x}px, ${task.y}px)`,
                width: `${NODE_WIDTH}px`,
                height: `${NODE_HEIGHT}px`,
              }}
              className={`absolute top-0 left-0 select-none rounded-lg border px-3 py-2.5 text-left transition-shadow cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                stateMeta.bg
              } ${
                isSelected
                  ? 'border-teal-700 ring-2 ring-teal-600/20 shadow-sm'
                  : isConnectSource
                  ? 'border-amber-500 ring-2 ring-amber-400/30'
                  : `${stateMeta.border} hover:border-slate-400`
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-medium text-slate-500 truncate">
                  {opMeta.shortName}
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap ${stateMeta.text}`}>
                  <StateIcon state={state} />
                  <span>{stateMeta.label}</span>
                </span>
              </div>

              <div className="mt-1 font-display text-sm font-semibold text-slate-900 truncate">
                {task.label}
              </div>

              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-mono truncate">{task.id}</span>
                {task.simulateFail && (
                  <span className="font-medium text-red-700 whitespace-nowrap shrink-0">
                    Fail On
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <p className="font-display text-base font-semibold text-slate-800">
                No tasks in this DAG yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Click Add Task above or load a blueprint to start building your pipeline.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
