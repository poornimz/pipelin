import React, { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PRODUCTION_PATTERNS, PatternCase } from '../data/concepts';

export const BestPracticesLab: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(PRODUCTION_PATTERNS[0].id);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const categories = ['All', 'ML Inference', 'Parsing', 'Idempotency', 'XComs', 'Sensors'];

  const filtered =
    categoryFilter === 'All'
      ? PRODUCTION_PATTERNS
      : PRODUCTION_PATTERNS.filter((p) => p.category === categoryFilter);

  const active: PatternCase =
    filtered.find((p) => p.id === selectedId) || filtered[0] || PRODUCTION_PATTERNS[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Production Pipeline Patterns
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Compare common Airflow anti-patterns against resilient, production-tested implementations for parsing speed, idempotent backfills, and worker efficiency.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setCategoryFilter(cat);
                const firstMatch =
                  cat === 'All'
                    ? PRODUCTION_PATTERNS[0]
                    : PRODUCTION_PATTERNS.find((p) => p.category === cat);
                if (firstMatch) setSelectedId(firstMatch.id);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                categoryFilter === cat
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Topic Selector */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map((item) => {
          const isSelected = item.id === active.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                isSelected
                  ? 'border-teal-700 bg-teal-50/70'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-500">
                {item.category}
              </div>
              <h3 className="mt-1 font-display text-sm font-semibold text-slate-900">
                {item.title}
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                {item.impact}
              </p>
            </button>
          );
        })}
      </div>

      {/* Side-by-side Anti-Pattern vs Production Pattern */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col rounded-xl border border-red-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-red-100 bg-red-50/70 px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-900">
              <XCircle className="h-4 w-4 text-red-700 shrink-0" />
              <span>Anti-Pattern: {active.antiPatternTitle}</span>
            </div>
          </div>

          <pre className="flex-1 overflow-x-auto bg-slate-900 p-4 font-mono text-xs leading-relaxed text-red-200">
            {active.antiPatternCode}
          </pre>

          <div className="border-t border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700">
            <strong className="text-slate-900">Why it breaks in production: </strong>
            {active.antiPatternWhy}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-emerald-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/70 px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>Production Pattern: {active.productionTitle}</span>
            </div>
          </div>

          <pre className="flex-1 overflow-x-auto bg-slate-900 p-4 font-mono text-xs leading-relaxed text-emerald-200">
            {active.productionCode}
          </pre>

          <div className="border-t border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700">
            <strong className="text-slate-900">Why it scales cleanly: </strong>
            {active.productionWhy}
          </div>
        </div>
      </div>
    </div>
  );
};
