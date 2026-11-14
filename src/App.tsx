import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  LayoutGrid,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Square,
} from 'lucide-react';
import { ArchitectureExplorer } from './components/ArchitectureExplorer';
import { BestPracticesLab } from './components/BestPracticesLab';
import { DagCanvas } from './components/DagCanvas';
import { DagCodePanel } from './components/DagCodePanel';
import { GridAndGanttView } from './components/GridAndGanttView';
import { ScheduleIntervalLab } from './components/ScheduleIntervalLab';
import { TaskInspector } from './components/TaskInspector';
import {
  BLUEPRINTS,
  OPERATOR_META,
  generateDagPythonCode,
  generateHistoricalRuns,
} from './data/blueprints';
import {
  AppSection,
  CodeStyle,
  DagConfig,
  DagEdge,
  StudioSubView,
  TaskNode,
  TaskRunSnapshot,
  TaskState,
} from './types/airflow';
import {
  buildTaskLogLines,
  computeTopologicalLayout,
  evaluateTriggerRule,
  wouldCreateCycle,
} from './utils/dagEngine';

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('studio');
  const [studioView, setStudioView] = useState<StudioSubView>('graph');

  const [activeBlueprintId, setActiveBlueprintId] = useState<string>(
    BLUEPRINTS[0].id
  );
  const [dagConfig, setDagConfig] = useState<DagConfig>(BLUEPRINTS[0].config);
  const [tasks, setTasks] = useState<TaskNode[]>(BLUEPRINTS[0].tasks);
  const [edges, setEdges] = useState<DagEdge[]>(BLUEPRINTS[0].edges);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    BLUEPRINTS[0].tasks[0]?.id || null
  );
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [showDagSettings, setShowDagSettings] = useState<boolean>(false);
  const [codeStyle, setCodeStyle] = useState<CodeStyle>('taskflow');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runStartedAtMs, setRunStartedAtMs] = useState<number | null>(null);
  const [runSnapshots, setRunSnapshots] = useState<
    Record<string, TaskRunSnapshot>
  >({});

  const runTokenRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      runTokenRef.current += 1;
    };
  }, []);

  const generatedPython = useMemo(
    () => generateDagPythonCode(dagConfig, tasks, edges, codeStyle),
    [dagConfig, tasks, edges, codeStyle]
  );

  const historicalRuns = useMemo(() => generateHistoricalRuns(tasks), [tasks]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );

  const handleLoadBlueprint = (blueprintId: string) => {
    const bp = BLUEPRINTS.find((b) => b.id === blueprintId);
    if (!bp) return;
    runTokenRef.current += 1;
    setIsRunning(false);
    setRunSnapshots({});
    setRunStartedAtMs(null);
    setConnectingFromId(null);
    setNoticeMessage(null);
    setActiveBlueprintId(bp.id);
    setDagConfig({ ...bp.config });
    setTasks(bp.tasks.map((t) => ({ ...t })));
    setEdges(bp.edges.map((e) => ({ ...e })));
    setSelectedTaskId(bp.tasks[0]?.id || null);
  };

  const handleResetRun = () => {
    runTokenRef.current += 1;
    setIsRunning(false);
    setRunSnapshots({});
    setRunStartedAtMs(null);
    setNoticeMessage(null);
  };

  const handleMoveTask = (taskId: string, x: number, y: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, x, y } : t))
    );
  };

  const handleUpdateTask = (updated: TaskNode) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleAddTask = () => {
    if (isRunning) return;
    const index = tasks.length + 1;
    let candidateId = `custom_task_${index}`;
    let counter = index;
    while (tasks.some((t) => t.id === candidateId)) {
      counter += 1;
      candidateId = `custom_task_${counter}`;
    }

    const rightmostX =
      tasks.length > 0 ? Math.max(...tasks.map((t) => t.x)) + 255 : 40;
    const newTask: TaskNode = {
      id: candidateId,
      label: `Custom Step ${counter}`,
      operator: 'TaskFlow',
      x: Math.min(rightmostX, 1100),
      y: 165,
      retries: 1,
      retryDelaySec: 10,
      triggerRule: 'all_success',
      pool: 'default_pool',
      durationMs: 1000,
      payload: OPERATOR_META.TaskFlow.defaultPayload,
      simulateFail: false,
      xcomOutput: `{"step": "${candidateId}", "ok": true}`,
    };

    setTasks((prev) => [...prev, newTask]);
    setSelectedTaskId(newTask.id);
    setStudioView('graph');
    setNoticeMessage(null);
  };

  const handleDeleteTask = (taskId: string) => {
    if (isRunning) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setEdges((prev) =>
      prev.filter((e) => e.source !== taskId && e.target !== taskId)
    );
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null);
    }
    if (connectingFromId === taskId) {
      setConnectingFromId(null);
    }
  };

  const handleStartConnect = (taskId: string) => {
    setConnectingFromId((prev) => (prev === taskId ? null : taskId));
    setNoticeMessage(null);
  };

  const handleCompleteConnect = (targetId: string) => {
    if (!connectingFromId) return;
    const sourceId = connectingFromId;
    setConnectingFromId(null);

    if (sourceId === targetId) {
      setNoticeMessage('A task cannot depend on itself in an Airflow DAG.');
      return;
    }

    const exists = edges.some(
      (e) => e.source === sourceId && e.target === targetId
    );
    if (exists) {
      setNoticeMessage(`Dependency ${sourceId} >> ${targetId} already exists.`);
      return;
    }

    if (wouldCreateCycle(tasks, edges, sourceId, targetId)) {
      setNoticeMessage(
        `Rejected ${sourceId} >> ${targetId}: Airflow DAGs must be acyclic (no circular dependencies).`
      );
      return;
    }

    const newEdge: DagEdge = {
      id: `e_${sourceId}_${targetId}_${Date.now()}`,
      source: sourceId,
      target: targetId,
    };
    setEdges((prev) => [...prev, newEdge]);
    setNoticeMessage(null);
  };

  const handleRemoveEdge = (edgeId: string) => {
    if (isRunning) return;
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  };

  const handleAutoLayout = () => {
    const positions = computeTopologicalLayout(tasks, edges);
    setTasks((prev) =>
      prev.map((t) =>
        positions[t.id] ? { ...t, x: positions[t.id].x, y: positions[t.id].y } : t
      )
    );
  };

  const handleDownloadPython = () => {
    const blob = new Blob([generatedPython], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dagConfig.dagId || 'airflow_dag'}.py`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRunDag = async () => {
    if (tasks.length === 0) return;
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;

    setIsRunning(true);
    setNoticeMessage(null);
    setConnectingFromId(null);
    const startMs = Date.now();
    setRunStartedAtMs(startMs);

    const localStates: Record<string, TaskState> = {};
    const localSnaps: Record<string, TaskRunSnapshot> = {};
    tasks.forEach((t) => {
      localStates[t.id] = 'none';
      localSnaps[t.id] = {
        taskId: t.id,
        state: 'none',
        attempt: 0,
        maxAttempts: t.retries + 1,
        logs: [],
      };
    });
    setRunSnapshots({ ...localSnaps });

    const upstreamMap = new Map<string, string[]>();
    const downstreamMap = new Map<string, string[]>();
    tasks.forEach((t) => {
      upstreamMap.set(t.id, []);
      downstreamMap.set(t.id, []);
    });
    edges.forEach((e) => {
      upstreamMap.get(e.target)?.push(e.source);
      downstreamMap.get(e.source)?.push(e.target);
    });

    const skippedByBranch = new Set<string>();
    const inFlight = new Set<string>();

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    const commitSnapshot = (
      taskId: string,
      patch: Partial<TaskRunSnapshot>
    ) => {
      if (runTokenRef.current !== token) return;
      localSnaps[taskId] = { ...localSnaps[taskId], ...patch };
      if (patch.state) {
        localStates[taskId] = patch.state;
      }
      setRunSnapshots({ ...localSnaps });
    };

    const executeSingleTask = async (task: TaskNode) => {
      inFlight.add(task.id);
      commitSnapshot(task.id, { state: 'scheduled' });
      await sleep(160);
      if (runTokenRef.current !== token) return;

      commitSnapshot(task.id, { state: 'queued' });
      await sleep(180);
      if (runTokenRef.current !== token) return;

      const taskStart = Date.now();
      let succeeded = false;
      const totalAttempts = task.retries + 1;

      for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        if (runTokenRef.current !== token) return;
        commitSnapshot(task.id, {
          state: 'running',
          attempt,
          startedAtMs: localSnaps[task.id].startedAtMs || taskStart,
          logs: [
            ...localSnaps[task.id].logs,
            ...buildTaskLogLines(task, dagConfig.dagId, attempt, 'running'),
          ],
        });

        await sleep(Math.max(450, Math.min(task.durationMs, 1500)));
        if (runTokenRef.current !== token) return;

        if (task.simulateFail) {
          if (attempt < totalAttempts) {
            commitSnapshot(task.id, {
              state: 'up_for_retry',
              logs: [
                ...localSnaps[task.id].logs,
                ...buildTaskLogLines(task, dagConfig.dagId, attempt, 'retry'),
              ],
            });
            await sleep(550);
          } else {
            commitSnapshot(task.id, {
              state: 'failed',
              endedAtMs: Date.now(),
              logs: [
                ...localSnaps[task.id].logs,
                ...buildTaskLogLines(task, dagConfig.dagId, attempt, 'failed'),
              ],
            });
          }
        } else {
          succeeded = true;
          commitSnapshot(task.id, {
            state: 'success',
            endedAtMs: Date.now(),
            xcomValue: task.xcomOutput,
            logs: [
              ...localSnaps[task.id].logs,
              ...buildTaskLogLines(task, dagConfig.dagId, attempt, 'success'),
            ],
          });
          break;
        }
      }

      if (succeeded && task.operator === 'BranchPythonOperator') {
        const outs = downstreamMap.get(task.id) || [];
        const chosen = task.branchTarget || outs[0];
        outs.forEach((downId) => {
          if (downId !== chosen) {
            skippedByBranch.add(downId);
          }
        });
      }

      inFlight.delete(task.id);
    };

    const terminalStates = new Set<TaskState>([
      'success',
      'failed',
      'upstream_failed',
      'skipped',
    ]);

    while (runTokenRef.current === token) {
      const unfinished = tasks.filter(
        (t) => !terminalStates.has(localStates[t.id])
      );
      if (unfinished.length === 0) break;

      const launches: Promise<void>[] = [];

      for (const t of unfinished) {
        if (inFlight.has(t.id) || localStates[t.id] !== 'none') continue;
        const upIds = upstreamMap.get(t.id) || [];
        const decision = evaluateTriggerRule(
          t,
          upIds,
          localStates,
          skippedByBranch
        );

        if (decision === 'upstream_failed') {
          commitSnapshot(t.id, {
            state: 'upstream_failed',
            logs: [
              `[scheduler] Marked ${t.id} as upstream_failed (trigger_rule=${t.triggerRule}).`,
            ],
          });
        } else if (decision === 'skipped') {
          commitSnapshot(t.id, {
            state: 'skipped',
            logs: buildTaskLogLines(t, dagConfig.dagId, 0, 'skipped'),
          });
        } else if (decision === 'ready') {
          launches.push(executeSingleTask(t));
        }
      }

      if (launches.length > 0) {
        // Trigger ready parallel tasks concurrently without blocking loop
        Promise.all(launches);
      }

      await sleep(120);
    }

    if (runTokenRef.current === token) {
      setIsRunning(false);
      const counts = tasks.reduce(
        (acc, t) => {
          const st = localStates[t.id];
          if (st === 'success') acc.success += 1;
          else if (st === 'failed' || st === 'upstream_failed') acc.failed += 1;
          else if (st === 'skipped') acc.skipped += 1;
          return acc;
        },
        { success: 0, failed: 0, skipped: 0 }
      );
      setNoticeMessage(
        `DAG run finished: ${counts.success} succeeded, ${counts.failed} failed, ${counts.skipped} skipped.`
      );
    }
  };

  const navItems: { id: AppSection; label: string }[] = [
    { id: 'studio', label: 'DAG Studio' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'intervals', label: 'Data Intervals' },
    { id: 'patterns', label: 'Patterns' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveSection('studio')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            Airflow Workbench
          </button>

          {/* Zone 2: 4 single-line text nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? 'border-teal-700 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleDownloadPython}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Export DAG .py
            </button>
          </div>
        </div>

        {/* Mobile navigation fallback */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-slate-100 px-6 py-2 text-xs font-medium">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeSection === item.id
                  ? 'text-teal-800 font-semibold'
                  : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-7">
        {activeSection === 'studio' && (
          <div className="space-y-6">
            {/* Studio Header & Blueprint Selector */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 text-balance">
                  ML Prediction Pipelines with Apache Airflow
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono text-slate-700">
                    {dagConfig.dagId}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{dagConfig.schedule}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{tasks.length} tasks</span>
                  <span aria-hidden="true">·</span>
                  <span>catchup={dagConfig.catchup ? 'True' : 'False'}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="blueprint-select" className="sr-only">
                  Pipeline Blueprint
                </label>
                <select
                  id="blueprint-select"
                  value={activeBlueprintId}
                  onChange={(e) => handleLoadBlueprint(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
                >
                  {BLUEPRINTS.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      Blueprint: {bp.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowDagSettings((s) => !s)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    showDagSettings
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>DAG Config</span>
                </button>
              </div>
            </div>

            {/* Collapsible DAG Configuration Drawer */}
            {showDagSettings && (
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    dag_id
                  </label>
                  <input
                    type="text"
                    value={dagConfig.dagId}
                    onChange={(e) =>
                      setDagConfig({
                        ...dagConfig,
                        dagId: e.target.value.replace(/\s+/g, '_'),
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    schedule (Cron)
                  </label>
                  <input
                    type="text"
                    value={dagConfig.schedule}
                    onChange={(e) =>
                      setDagConfig({ ...dagConfig, schedule: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    owner
                  </label>
                  <input
                    type="text"
                    value={dagConfig.owner}
                    onChange={(e) =>
                      setDagConfig({ ...dagConfig, owner: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    max_active_runs
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={dagConfig.maxActiveRuns}
                    onChange={(e) =>
                      setDagConfig({
                        ...dagConfig,
                        maxActiveRuns: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono tabular-nums text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <span className="font-medium text-slate-700">
                      catchup={dagConfig.catchup ? 'True' : 'False'}
                    </span>
                    <input
                      type="checkbox"
                      checked={dagConfig.catchup}
                      onChange={(e) =>
                        setDagConfig({
                          ...dagConfig,
                          catchup: e.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-teal-700"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Studio Control Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStudioView('graph')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    studioView === 'graph'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Graph View
                </button>
                <button
                  type="button"
                  onClick={() => setStudioView('grid')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    studioView === 'grid'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Grid & Gantt
                </button>
                <button
                  type="button"
                  onClick={() => setStudioView('code')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    studioView === 'code'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Python Code
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={handleAddTask}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Task</span>
                </button>

                <button
                  type="button"
                  disabled={isRunning}
                  onClick={handleAutoLayout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Auto Layout</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetRun}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>

                {isRunning ? (
                  <button
                    type="button"
                    onClick={handleResetRun}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>Stop Run</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunDag}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Run DAG</span>
                  </button>
                )}
              </div>
            </div>

            {noticeMessage && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-teal-700 shrink-0" />
                  <span>{noticeMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNoticeMessage(null)}
                  className="text-slate-400 hover:text-slate-700 font-medium"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Main Studio Sub-View */}
            {studioView === 'graph' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
                <div className="lg:col-span-8 flex flex-col gap-3">
                  <DagCanvas
                    tasks={tasks}
                    edges={edges}
                    selectedTaskId={selectedTaskId}
                    connectingFromId={connectingFromId}
                    runSnapshots={runSnapshots}
                    isRunning={isRunning}
                    onSelectTask={setSelectedTaskId}
                    onMoveTask={handleMoveTask}
                    onCompleteConnect={handleCompleteConnect}
                    onRemoveEdge={handleRemoveEdge}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
                    <span>
                      Drag tasks to rearrange. Hover any arrow to remove a dependency, or click a task and choose Link Downstream.
                    </span>
                    <span className="font-mono tabular-nums">
                      {edges.length} dependencies
                    </span>
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <TaskInspector
                    task={selectedTask}
                    allTasks={tasks}
                    edges={edges}
                    snapshot={
                      selectedTask ? runSnapshots[selectedTask.id] : undefined
                    }
                    isRunning={isRunning}
                    isConnecting={
                      !!selectedTask && connectingFromId === selectedTask.id
                    }
                    onUpdateTask={handleUpdateTask}
                    onStartConnect={handleStartConnect}
                    onDeleteTask={handleDeleteTask}
                  />
                </div>
              </div>
            )}

            {studioView === 'grid' && (
              <GridAndGanttView
                tasks={tasks}
                historicalRuns={historicalRuns}
                runSnapshots={runSnapshots}
                runStartedAtMs={runStartedAtMs}
              />
            )}

            {studioView === 'code' && (
              <DagCodePanel
                dagId={dagConfig.dagId}
                code={generatedPython}
                codeStyle={codeStyle}
                onChangeStyle={setCodeStyle}
                onDownload={handleDownloadPython}
              />
            )}
          </div>
        )}

        {activeSection === 'architecture' && <ArchitectureExplorer />}
        {activeSection === 'intervals' && <ScheduleIntervalLab />}
        {activeSection === 'patterns' && <BestPracticesLab />}
      </main>
    </div>
  );
}
