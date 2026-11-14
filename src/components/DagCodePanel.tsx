import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { CodeStyle } from '../types/airflow';

interface DagCodePanelProps {
  dagId: string;
  code: string;
  codeStyle: CodeStyle;
  onChangeStyle: (style: CodeStyle) => void;
  onDownload: () => void;
}

export const DagCodePanel: React.FC<DagCodePanelProps> = ({
  dagId,
  code,
  codeStyle,
  onChangeStyle,
  onDownload,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const lines = code.split('\n');

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-medium text-slate-800">
            dags/{dagId}.py
          </span>
          <span className="text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => onChangeStyle('taskflow')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                codeStyle === 'taskflow'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              TaskFlow API (@dag)
            </button>
            <button
              type="button"
              onClick={() => onChangeStyle('classic')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                codeStyle === 'classic'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Classic Operators
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Python</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download .py</span>
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto bg-slate-900 p-4 text-xs leading-relaxed">
        <table className="w-full border-collapse font-mono">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-slate-800/50">
                <td className="w-10 select-none pr-4 text-right text-slate-500 tabular-nums align-top">
                  {idx + 1}
                </td>
                <td className="whitespace-pre text-slate-100">
                  {highlightPythonLine(line)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function highlightPythonLine(line: string): React.ReactNode {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) {
    return <span className="text-slate-400">{line}</span>;
  }
  if (trimmed.startsWith('@dag') || trimmed.startsWith('@task')) {
    return <span className="text-teal-300 font-medium">{line}</span>;
  }
  if (
    trimmed.startsWith('from ') ||
    trimmed.startsWith('import ') ||
    trimmed.startsWith('def ') ||
    trimmed.startsWith('with ') ||
    trimmed.startsWith('return ')
  ) {
    return <span className="text-sky-300">{line}</span>;
  }
  if (line.includes('>>')) {
    return <span className="text-amber-300">{line}</span>;
  }
  return line;
}
