// packages/cli/src/commands/report.ts
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { PW_DOCTOR_DIR } from '@pw-doctor/shared';
import type { RunHistory, RepairRecord } from '@pw-doctor/shared';
import { assertWithinRoot } from '../utils/safe-path.js';

export interface AggregatedReport {
  generatedAt: string;
  runsIncluded: number;
  totalSelectors: number;
  healthyCount: number;
  brokenCount: number;
  healthyPercent: number;
  repairedCount: number;
  verifiedCount: number;
  rolledBackCount: number;
  fragileSelectors: FragileSelector[];
  repairs: RepairRecord[];
  perFile: Record<string, RepairRecord[]>;
}

export interface FragileSelector {
  selector: string;
  file: string;
  breakCount: number;
}

export function loadRunHistory(historyDir: string, last: number): RunHistory[] {
  if (!fs.existsSync(historyDir)) {
    return [];
  }

  const files = fs.readdirSync(historyDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const selected = files.slice(-last);

  const runs: RunHistory[] = [];
  for (const file of selected) {
    try {
      const content = fs.readFileSync(path.join(historyDir, file), 'utf-8');
      const parsed = JSON.parse(content) as RunHistory;
      // Runtime validation: skip files missing required fields
      if (!parsed || typeof parsed !== 'object' || !parsed.results || !parsed.repairs) continue;
      if (typeof parsed.results.totalSelectors !== 'number') continue;
      runs.push(parsed);
    } catch {
      // skip malformed files
    }
  }

  return runs;
}

export function aggregateRuns(runs: RunHistory[]): AggregatedReport {
  let totalSelectors = 0;
  let healthyCount = 0;
  let brokenCount = 0;
  let repairedCount = 0;
  let verifiedCount = 0;
  let rolledBackCount = 0;
  const allRepairs: RepairRecord[] = [];

  for (const run of runs) {
    totalSelectors += run.results.totalSelectors;
    healthyCount += run.results.healthy;
    brokenCount += run.results.broken;
    repairedCount += run.results.repaired;
    verifiedCount += run.results.verified;
    rolledBackCount += run.results.rolledBack;
    allRepairs.push(...run.repairs);
  }

  // Calculate fragile selectors: selectors that broke most often
  const breakCounts = new Map<string, { file: string; count: number }>();
  for (const repair of allRepairs) {
    const key = `${repair.filePath}::${repair.oldSelector}`;
    const existing = breakCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      breakCounts.set(key, { file: repair.filePath, count: 1 });
    }
  }

  const fragileSelectors: FragileSelector[] = Array.from(breakCounts.entries())
    .map(([key, value]) => ({
      selector: key.split('::')[1],
      file: value.file,
      breakCount: value.count,
    }))
    .sort((a, b) => b.breakCount - a.breakCount);

  // Group repairs by file
  const perFile: Record<string, RepairRecord[]> = {};
  for (const repair of allRepairs) {
    if (!perFile[repair.filePath]) {
      perFile[repair.filePath] = [];
    }
    perFile[repair.filePath].push(repair);
  }

  const healthyPercent = totalSelectors > 0
    ? Math.round((healthyCount / totalSelectors) * 100)
    : 100;

  return {
    generatedAt: new Date().toISOString(),
    runsIncluded: runs.length,
    totalSelectors,
    healthyCount,
    brokenCount,
    healthyPercent,
    repairedCount,
    verifiedCount,
    rolledBackCount,
    fragileSelectors,
    repairs: allRepairs,
    perFile,
  };
}

export function generateHtmlReport(report: AggregatedReport): string {
  const healthColor = report.healthyPercent >= 80 ? '#22c55e'
    : report.healthyPercent >= 50 ? '#eab308'
    : '#ef4444';

  const statusBadge = (status: string): string => {
    const color = status === 'verified' ? '#22c55e'
      : status === 'rolled_back' ? '#ef4444'
      : '#eab308';
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:12px;">${status}</span>`;
  };

  const confidenceBadge = (confidence: number): string => {
    const color = confidence >= 85 ? '#22c55e'
      : confidence >= 50 ? '#eab308'
      : '#ef4444';
    return `<span style="color:${color};font-weight:bold;">${confidence}%</span>`;
  };

  const fragileRows = report.fragileSelectors.slice(0, 20).map((s) =>
    `<tr><td><code>${escapeHtml(s.selector)}</code></td><td>${escapeHtml(s.file)}</td><td>${s.breakCount}</td></tr>`
  ).join('\n');

  const repairRows = report.repairs.map((r) =>
    `<tr>
      <td><code>${escapeHtml(r.oldSelector)}</code></td>
      <td><code>${escapeHtml(r.newSelector)}</code></td>
      <td>${statusBadge(r.status)}</td>
      <td>${confidenceBadge(r.confidence)}</td>
      <td>${escapeHtml(r.strategy)}</td>
    </tr>`
  ).join('\n');

  let perFileHtml = '';
  for (const [filePath, repairs] of Object.entries(report.perFile)) {
    const fileRepairRows = repairs.map((r) =>
      `<tr>
        <td>L${r.line}</td>
        <td><code>${escapeHtml(r.oldSelector)}</code> &rarr; <code>${escapeHtml(r.newSelector)}</code></td>
        <td>${statusBadge(r.status)}</td>
      </tr>`
    ).join('\n');

    perFileHtml += `
      <h3>${escapeHtml(filePath)}</h3>
      <table>
        <thead><tr><th>Line</th><th>Change</th><th>Status</th></tr></thead>
        <tbody>${fileRepairRows}</tbody>
      </table>
    `;
  }

  if (!perFileHtml) {
    perFileHtml = '<p>No repairs recorded.</p>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>pw-doctor Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #fafafa; }
  h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
  h2 { margin-top: 32px; color: #374151; }
  h3 { color: #6b7280; font-size: 14px; }
  .summary { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
  .stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 24px; min-width: 140px; }
  .stat-value { font-size: 28px; font-weight: bold; }
  .stat-label { font-size: 13px; color: #6b7280; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; background: #fff; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
  th { background: #f9fafb; font-size: 13px; text-transform: uppercase; color: #6b7280; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  .meta { color: #9ca3af; font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<h1>pw-doctor Report</h1>

<h2>Health Summary</h2>
<div class="summary">
  <div class="stat">
    <div class="stat-value">${report.totalSelectors}</div>
    <div class="stat-label">Total Selectors</div>
  </div>
  <div class="stat">
    <div class="stat-value" style="color:${healthColor}">${report.healthyPercent}%</div>
    <div class="stat-label">Healthy</div>
  </div>
  <div class="stat">
    <div class="stat-value" style="color:#ef4444">${report.brokenCount}</div>
    <div class="stat-label">Broken</div>
  </div>
  <div class="stat">
    <div class="stat-value" style="color:#22c55e">${report.verifiedCount}</div>
    <div class="stat-label">Verified Fixes</div>
  </div>
  <div class="stat">
    <div class="stat-value" style="color:#ef4444">${report.rolledBackCount}</div>
    <div class="stat-label">Rolled Back</div>
  </div>
</div>

<h2>Most Fragile Selectors</h2>
${report.fragileSelectors.length > 0 ? `
<table>
  <thead><tr><th>Selector</th><th>File</th><th>Break Count</th></tr></thead>
  <tbody>${fragileRows}</tbody>
</table>
` : '<p>No fragile selectors detected.</p>'}

<h2>Repair History</h2>
${report.repairs.length > 0 ? `
<table>
  <thead><tr><th>Old Selector</th><th>New Selector</th><th>Status</th><th>Confidence</th><th>Strategy</th></tr></thead>
  <tbody>${repairRows}</tbody>
</table>
` : '<p>No repairs recorded.</p>'}

<h2>Per-File Breakdown</h2>
${perFileHtml}

<div class="meta">
  Generated at ${escapeHtml(report.generatedAt)} | Runs included: ${report.runsIncluded}
</div>
</body>
</html>`;
}

export function generateMarkdownReport(report: AggregatedReport): string {
  const lines: string[] = [];

  lines.push('# pw-doctor Report');
  lines.push('');

  // Health Summary
  lines.push('## Health Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Selectors | ${report.totalSelectors} |`);
  lines.push(`| Healthy | ${report.healthyPercent}% |`);
  lines.push(`| Broken | ${report.brokenCount} |`);
  lines.push(`| Verified Fixes | ${report.verifiedCount} |`);
  lines.push(`| Rolled Back | ${report.rolledBackCount} |`);
  lines.push('');

  // Most Fragile Selectors
  lines.push('## Most Fragile Selectors');
  lines.push('');
  if (report.fragileSelectors.length > 0) {
    lines.push('| Selector | File | Break Count |');
    lines.push('|----------|------|-------------|');
    for (const s of report.fragileSelectors.slice(0, 20)) {
      lines.push(`| \`${s.selector}\` | ${s.file} | ${s.breakCount} |`);
    }
  } else {
    lines.push('No fragile selectors detected.');
  }
  lines.push('');

  // Repair History
  lines.push('## Repair History');
  lines.push('');
  if (report.repairs.length > 0) {
    lines.push('| Old Selector | New Selector | Status | Confidence | Strategy |');
    lines.push('|--------------|--------------|--------|------------|----------|');
    for (const r of report.repairs) {
      lines.push(`| \`${r.oldSelector}\` | \`${r.newSelector}\` | ${r.status} | ${r.confidence}% | ${r.strategy} |`);
    }
  } else {
    lines.push('No repairs recorded.');
  }
  lines.push('');

  // Per-File Breakdown
  lines.push('## Per-File Breakdown');
  lines.push('');
  const fileEntries = Object.entries(report.perFile);
  if (fileEntries.length > 0) {
    for (const [filePath, repairs] of fileEntries) {
      lines.push(`### ${filePath}`);
      lines.push('');
      lines.push('| Line | Change | Status |');
      lines.push('|------|--------|--------|');
      for (const r of repairs) {
        lines.push(`| L${r.line} | \`${r.oldSelector}\` -> \`${r.newSelector}\` | ${r.status} |`);
      }
      lines.push('');
    }
  } else {
    lines.push('No repairs recorded.');
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`Generated at ${report.generatedAt} | Runs included: ${report.runsIncluded}`);

  return lines.join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDefaultOutputPath(cwd: string, format: string): string {
  const ext = format === 'markdown' ? 'md' : format;
  return path.join(cwd, PW_DOCTOR_DIR, 'reports', `report.${ext}`);
}

export function reportCommand(): Command {
  return new Command('report')
    .description('Generate a report from run history')
    .option('--format <type>', 'Output format: json, html, or markdown', 'html')
    .option('--output <path>', 'Output file path')
    .option('--last <n>', 'Include last N runs', '10')
    .action(async (options) => {
      const cwd = process.cwd();
      const format: string = options.format;
      const last = parseInt(options.last, 10) || 10;

      if (!['json', 'html', 'markdown'].includes(format)) {
        console.error(`Invalid format: ${format}. Must be json, html, or markdown.`);
        process.exit(2);
      }

      const historyDir = path.join(cwd, PW_DOCTOR_DIR, 'history', 'runs');
      const runs = loadRunHistory(historyDir, last);
      const report = aggregateRuns(runs);

      let content: string;
      if (format === 'json') {
        content = JSON.stringify(report, null, 2);
      } else if (format === 'markdown') {
        content = generateMarkdownReport(report);
      } else {
        content = generateHtmlReport(report);
      }

      const outputPath = options.output
        ? path.resolve(cwd, options.output)
        : getDefaultOutputPath(cwd, format);

      assertWithinRoot(cwd, outputPath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(outputPath, content, { mode: 0o600 });

      console.log(`Report written to ${path.relative(cwd, outputPath)}`);
    });
}
