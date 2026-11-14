import React, { useMemo, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';

interface PresetSchedule {
  label: string;
  expr: string;
  intervalHours: number;
  note: string;
}

const PRESETS: PresetSchedule[] = [
  {
    label: '@daily (Midnight UTC)',
    expr: '0 0 * * *',
    intervalHours: 24,
    note: 'Processes one full UTC calendar day, triggering right after 23:59:59 UTC.',
  },
  {
    label: '0 2 * * * (02:00 UTC)',
    expr: '0 2 * * *',
    intervalHours: 24,
    note: 'Runs 24-hour intervals anchored at 02:00 UTC to allow upstream late arrivals.',
  },
  {
    label: '@hourly',
    expr: '0 * * * *',
    intervalHours: 1,
    note: 'Processes 60-minute windows, triggering at the top of the following hour.',
  },
  {
    label: '0 */6 * * * (Every 6h)',
    expr: '0 */6 * * *',
    intervalHours: 6,
    note: 'Splits each day into four 6-hour micro-batch intervals.',
  },
];

function formatUtc(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function formatDs(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const ScheduleIntervalLab: React.FC = () => {
  const [selectedPresetIdx, setSelectedPresetIdx] = useState<number>(0);
  const [anchorDate, setAnchorDate] = useState<string>('2026-11-14');
  const [catchup, setCatchup] = useState<boolean>(false);

  const preset = PRESETS[selectedPresetIdx];

  const intervals = useMemo(() => {
    const startHour = preset.expr === '0 2 * * *' ? 2 : 0;
    const base = new Date(`${anchorDate}T00:00:00Z`);
    if (Number.isNaN(base.getTime())) return [];
    base.setUTCHours(startHour, 0, 0, 0);

    return [0, 1, 2, 3].map((idx) => {
      const start = new Date(
        base.getTime() + idx * preset.intervalHours * 3600 * 1000
      );
      const end = new Date(
        start.getTime() + preset.intervalHours * 3600 * 1000
      );
      return {
        runIndex: idx + 1,
        logicalDate: start,
        dataIntervalStart: start,
        dataIntervalEnd: end,
        actualExecutionStart: end,
        ds: formatDs(start),
        dsNodash: formatDs(start).replace(/-/g, ''),
      };
    });
  }, [anchorDate, preset]);

  const activeSample = intervals[0];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Data Intervals & Scheduling Simulator
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Airflow schedules a DAG run at the <strong>end</strong> of its data interval so all events within that window are present before processing begins.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-6 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-12">
        <div className="md:col-span-6">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Schedule Preset
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PRESETS.map((p, idx) => (
              <button
                key={p.expr}
                type="button"
                onClick={() => setSelectedPresetIdx(idx)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  idx === selectedPresetIdx
                    ? 'border-teal-700 bg-teal-50/70 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-mono text-xs font-semibold">{p.expr}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{p.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Start Date (UTC)
          </label>
          <div className="relative">
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {preset.note}
          </p>
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Catchup Behavior
          </label>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setCatchup(false)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                !catchup
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              catchup=False
            </button>
            <button
              type="button"
              onClick={() => setCatchup(true)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                catchup
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              catchup=True
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {catchup
              ? 'Scheduler backfills every missed data interval since start_date sequentially.'
              : 'Scheduler runs only the latest completed data interval and skips historical gaps.'}
          </p>
        </div>
      </div>

      {/* Generated Intervals Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Scheduled DagRuns & Data Interval Boundaries
          </h3>
          <span className="font-mono text-xs text-slate-500">
            schedule=&quot;{preset.expr}&quot;
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-4 font-semibold">Run</th>
                <th className="py-2.5 px-4 font-semibold">logical_date (data_interval_start)</th>
                <th className="py-2.5 px-4 font-semibold">data_interval_end</th>
                <th className="py-2.5 px-4 font-semibold">Actual Trigger Time</th>
                <th className="py-2.5 pl-4 font-semibold">{"{{ ds }}"} Partition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {intervals.map((row) => (
                <tr key={row.runIndex} className="hover:bg-slate-50">
                  <td className="py-3 pr-4 text-slate-500">
                    #{row.runIndex}
                  </td>
                  <td className="py-3 px-4 text-slate-900">
                    {formatUtc(row.dataIntervalStart)}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {formatUtc(row.dataIntervalEnd)}
                  </td>
                  <td className="py-3 px-4 text-teal-800 font-medium">
                    {formatUtc(row.actualExecutionStart)}
                  </td>
                  <td className="py-3 pl-4 text-slate-800">
                    {row.ds}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Jinja Variables Card */}
      {activeSample && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-900">
            <Calendar className="h-4 w-4 text-teal-700" />
            <span>Jinja Template Context for Run #1</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Use these runtime context variables inside SQL queries, Bash commands, and S3 keys so every DagRun remains strictly idempotent.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="font-mono text-[11px] text-slate-500">{"{{ ds }}"}</div>
              <div className="mt-1 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                {activeSample.ds}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="font-mono text-[11px] text-slate-500">{"{{ ds_nodash }}"}</div>
              <div className="mt-1 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                {activeSample.dsNodash}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="font-mono text-[11px] text-slate-500">{"{{ data_interval_start }}"}</div>
              <div className="mt-1 font-mono text-xs font-semibold text-slate-900 tabular-nums truncate">
                {activeSample.dataIntervalStart.toISOString()}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="font-mono text-[11px] text-slate-500">{"{{ data_interval_end }}"}</div>
              <div className="mt-1 font-mono text-xs font-semibold text-slate-900 tabular-nums truncate">
                {activeSample.dataIntervalEnd.toISOString()}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
            <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>
              Notice that Run #1 processes data for <span className="font-mono font-medium text-slate-900">{activeSample.ds}</span>, even though the worker actually launches at <span className="font-mono font-medium text-teal-800">{formatUtc(activeSample.actualExecutionStart)}</span>.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
