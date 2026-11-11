import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthlyByProvider } from '../lib/analytics';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../lib/categories';
import { OTHER_KEY } from '../lib/colors';
import { monthlyByCategory, typeByMonth } from '../lib/insights';
import { KIND_LABELS, type ChargeKind, type TypeInfo } from '../lib/overrides';
import { monthLabel, monthShort } from '../lib/dates';
import { formatEUR } from '../lib/money';
import type { LedgerRow } from '../lib/types';
import { providerHref } from '../router';
import { useLedger } from '../store';

// Shared chart chrome
const axisTick = { fill: 'var(--ink-3)', fontSize: 11 };
const yTick = (v: number) => (v === 0 ? '€0' : `€${v.toLocaleString('en-IE')}`);

function monthTick(months: string[]) {
  const multiYear = months.length > 12;
  return (m: string) => (multiYear ? `${monthShort(m)} ${m.slice(2, 4)}` : monthShort(m));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type TipProps = { active?: boolean; payload?: readonly any[]; label?: any };

function TipShell({ title, total, children, hint }: { title: string; total?: number; children?: React.ReactNode; hint?: string }) {
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">
        <span>{title}</span>
        {total !== undefined && <span className="num">{formatEUR(total)}</span>}
      </div>
      {children}
      {hint && <div className="chart-tip-hint">{hint}</div>}
    </div>
  );
}

function TipRow({ color, label, cents, line }: { color: string; label: string; cents: number; line?: boolean }) {
  return (
    <div className="chart-tip-row">
      <span>
        {line ? (
          <span className="legend-line" style={{ background: color }} />
        ) : (
          <span className="dot" style={{ background: color }} />
        )}
        {label}
      </span>
      <span className="num">{formatEUR(cents)}</span>
    </div>
  );
}

// ---------- monthly spending stacked by provider ----------

export function MonthlyProviderChart({
  rows,
  months,
  selectedMonth,
  onSelectMonth,
  height = 280,
}: {
  rows: LedgerRow[];
  months: string[];
  selectedMonth?: string | null;
  onSelectMonth?: (m: string) => void;
  height?: number;
}) {
  const { colors } = useLedger();
  const { data, keys } = useMemo(() => {
    const stack = monthlyByProvider(rows, months, colors.seriesSet, OTHER_KEY);
    const present = new Set<string>();
    for (const s of stack) for (const k of Object.keys(s.cents)) present.add(k);
    const keys = [...colors.series.filter((p) => present.has(p)), ...(present.has(OTHER_KEY) ? [OTHER_KEY] : [])];
    const data = stack.map((s) => {
      const row: Record<string, number | string> = { month: s.month, total: s.totalCents };
      for (const k of keys) row[k] = (s.cents[k] ?? 0) / 100;
      return row;
    });
    return { data, keys };
  }, [rows, months, colors]);

  const colorOf = (k: string) => (k === OTHER_KEY ? colors.otherColor : colors.color(k));
  const otherProviders = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (!colors.seriesSet.has(r.provider)) set.add(r.provider);
    return [...set].sort();
  }, [rows, colors]);

  const Tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Record<string, number>;
    const items = keys
      .map((k) => ({ k, cents: Math.round(Number(row[k] ?? 0) * 100) }))
      .filter((i) => i.cents !== 0)
      .sort((a, b) => b.cents - a.cents);
    return (
      <TipShell
        title={monthLabel(String(label))}
        total={Number(row.total)}
        hint={onSelectMonth ? 'Click to open this month' : undefined}
      >
        {items.length === 0 && <div className="muted">No recorded spending</div>}
        {items.map((i) => (
          <TipRow key={i.k} color={colorOf(i.k)} label={i.k} cents={i.cents} />
        ))}
      </TipShell>
    );
  };

  return (
    <div>
      <div className="legend" style={{ marginBottom: 10 }}>
        {keys.map((k) =>
          k === OTHER_KEY ? (
            <span key={k} className="legend-item" title={otherProviders.join(', ')}>
              <span className="dot" style={{ background: colors.otherColor }} />
              Other ({otherProviders.length})
            </span>
          ) : (
            <a key={k} className="legend-item" href={providerHref(k)}>
              <span className="dot" style={{ background: colorOf(k) }} />
              {k}
            </a>
          ),
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onClick={(s: any) => {
            const i = s?.activeTooltipIndex ?? s?.activeIndex;
            if (onSelectMonth && i !== undefined && i !== null && data[Number(i)]) onSelectMonth(String(data[Number(i)].month));
          }}
          style={{ cursor: onSelectMonth ? 'pointer' : undefined }}
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={monthTick(months)} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickFormatter={yTick} tick={axisTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-hover)' }} isAnimationActive={false} />
          {keys.map((k, idx) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="s"
              fill={colorOf(k)}
              stroke="var(--surface)"
              strokeWidth={1}
              maxBarSize={28}
              radius={idx === keys.length - 1 ? [3, 3, 0, 0] : 0}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell
                  key={String(d.month)}
                  fillOpacity={selectedMonth && d.month !== selectedMonth ? 0.38 : 1}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- single provider by month ----------

export function SingleSeriesMonthlyChart({
  rows,
  months,
  color,
  height = 220,
}: {
  rows: LedgerRow[];
  months: string[];
  color: string;
  height?: number;
}) {
  const data = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of rows) {
      const m = r.date.slice(0, 7);
      by.set(m, (by.get(m) ?? 0) + r.amountCents);
    }
    return months.map((m) => ({ month: m, cents: by.get(m) ?? 0, value: (by.get(m) ?? 0) / 100 }));
  }, [rows, months]);

  const Tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    return <TipShell title={monthLabel(String(label))} total={payload[0].payload.cents} />;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="month" tickFormatter={monthTick(months)} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tickFormatter={yTick} tick={axisTick} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-hover)' }} isAnimationActive={false} />
        <Bar dataKey="value" fill={color} maxBarSize={24} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- monthly total with rolling average ----------

export function MonthlyTrendChart({ rows, months, height = 280 }: { rows: LedgerRow[]; months: string[]; height?: number }) {
  const data = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of rows) {
      const m = r.date.slice(0, 7);
      by.set(m, (by.get(m) ?? 0) + r.amountCents);
    }
    const totals = months.map((m) => by.get(m) ?? 0);
    return months.map((m, i) => {
      const avgCents = i >= 2 ? Math.round((totals[i] + totals[i - 1] + totals[i - 2]) / 3) : null;
      return { month: m, cents: totals[i], value: totals[i] / 100, avgCents, avg: avgCents === null ? null : avgCents / 100 };
    });
  }, [rows, months]);

  const Tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <TipShell title={monthLabel(String(label))}>
        <TipRow color="var(--accent)" label="Spent" cents={p.cents} />
        {p.avgCents !== null && <TipRow color="var(--ink-2)" label="3-month average" cents={p.avgCents} line />}
      </TipShell>
    );
  };

  return (
    <div>
      <div className="legend" style={{ marginBottom: 10 }}>
        <span className="legend-item"><span className="dot" style={{ background: 'var(--accent)' }} />Monthly spending</span>
        <span className="legend-item"><span className="legend-line" style={{ background: 'var(--ink-2)' }} />3-month average</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={monthTick(months)} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickFormatter={yTick} tick={axisTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-hover)' }} isAnimationActive={false} />
          <Bar dataKey="value" fill="var(--accent)" maxBarSize={24} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line dataKey="avg" stroke="var(--ink-2)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- year-over-year by calendar month ----------

const YEAR_GRAYS = ['var(--ink-3)', 'var(--axis)'];

export function YearCompareChart({ rows, years, height = 260 }: { rows: LedgerRow[]; years: number[]; height?: number }) {
  const latest = years[years.length - 1];
  const yearColor = (y: number) => (y === latest ? 'var(--accent)' : YEAR_GRAYS[Math.min(latest - y - 1, YEAR_GRAYS.length - 1)]);
  const data = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of rows) {
      const m = r.date.slice(0, 7);
      by.set(m, (by.get(m) ?? 0) + r.amountCents);
    }
    const first = rows.reduce((a, r) => (r.date < a ? r.date : a), '9999').slice(0, 7);
    const last = rows.reduce((a, r) => (r.date > a ? r.date : a), '0000').slice(0, 7);
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const row: Record<string, number | null | string> = { mm, label: monthShort(`2000-${mm}`) };
      for (const y of years) {
        const key = `${y}-${mm}`;
        // Only plot months inside the recorded range (no zeros for months that haven't happened).
        row[String(y)] = key < first || key > last ? null : (by.get(key) ?? 0) / 100;
      }
      return row;
    });
  }, [rows, years]);

  const Tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <TipShell title={String(label)}>
        {[...years].reverse().map((y) => {
          const v = payload[0].payload[String(y)];
          if (v === null || v === undefined) return null;
          return <TipRow key={y} color={yearColor(y)} label={String(y)} cents={Math.round(v * 100)} line />;
        })}
      </TipShell>
    );
  };

  return (
    <div>
      <div className="legend" style={{ marginBottom: 10 }}>
        {[...years].reverse().map((y) => (
          <span key={y} className="legend-item">
            <span className="legend-line" style={{ background: yearColor(y) }} />
            {y}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval={0} minTickGap={0} />
          <YAxis tickFormatter={yTick} tick={axisTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<Tip />} cursor={{ stroke: 'var(--axis)' }} isAnimationActive={false} />
          {years.map((y) => (
            <Line
              key={y}
              dataKey={String(y)}
              stroke={yearColor(y)}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: yearColor(y) }}
              activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- monthly spending stacked by category ----------

export function MonthlyCategoryChart({
  rows,
  months,
  categoryFor,
  selectedMonth,
  onSelectMonth,
  height = 280,
}: {
  rows: LedgerRow[];
  months: string[];
  categoryFor: (row: any) => Category;
  selectedMonth?: string | null;
  onSelectMonth?: (m: string) => void;
  height?: number;
}) {
  const { categoryColors } = useLedger();
  const { data, keys } = useMemo(() => {
    const stack = monthlyByCategory(rows, months, categoryFor);
    const present = new Set<string>();
    for (const s of stack) for (const k of Object.keys(s.cents)) present.add(k);
    const keys = CATEGORIES.filter((c) => present.has(c));
    const data = stack.map((s) => {
      const row: Record<string, number | string> = { month: s.month, total: s.totalCents };
      for (const k of keys) row[k] = (s.cents[k] ?? 0) / 100;
      return row;
    });
    return { data, keys };
  }, [rows, months, categoryFor]);

  const Tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Record<string, number>;
    const items = keys
      .map((k) => ({ k, cents: Math.round(Number(row[k] ?? 0) * 100) }))
      .filter((i) => i.cents !== 0)
      .sort((a, b) => b.cents - a.cents);
    return (
      <TipShell title={monthLabel(String(label))} total={Number(row.total)} hint={onSelectMonth ? 'Click to open this month' : undefined}>
        {items.length === 0 && <div className="muted">No recorded spending</div>}
        {items.map((i) => (
          <TipRow key={i.k} color={categoryColors(i.k)} label={CATEGORY_LABELS[i.k]} cents={i.cents} />
        ))}
      </TipShell>
    );
  };

  return (
    <div>
      <div className="legend" style={{ marginBottom: 10 }}>
        {keys.map((k) => (
          <span key={k} className="legend-item">
            <span className="dot" style={{ background: categoryColors(k) }} />
            {CATEGORY_LABELS[k]}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onClick={(s: any) => {
            const i = s?.activeTooltipIndex ?? s?.activeIndex;
            if (onSelectMonth && i !== undefined && i !== null && data[Number(i)]) onSelectMonth(String(data[Number(i)].month));
          }}
          style={{ cursor: onSelectMonth ? 'pointer' : undefined }}
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={monthTick(months)} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickFormatter={yTick} tick={axisTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-hover)' }} isAnimationActive={false} />
          {keys.map((k, idx) => (
            <Bar key={k} dataKey={k} stackId="s" fill={categoryColors(k)} stroke="var(--surface)" strokeWidth={1} maxBarSize={28} radius={idx === keys.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={String(d.month)} fillOpacity={selectedMonth && d.month !== selectedMonth ? 0.38 : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- subscription, usage and one-time ----------

const KINDS: ChargeKind[] = ['subscription', 'usage', 'other'];

export function TypeChart({
  rows,
  months,
  typeOf,
  selectedMonth,
  onSelectMonth,
  height = 260,
}: {
  rows: LedgerRow[];
  months: string[];
  typeOf: (row: any) => TypeInfo;
  selectedMonth?: string | null;
  onSelectMonth?: (m: string) => void;
  height?: number;
}) {
  const { typeColors } = useLedger();
  const data = useMemo(
    () =>
      typeByMonth(rows, months, typeOf).map((m) => ({
        ...m,
        subscription: m.subscriptionCents / 100,
        usage: m.usageCents / 100,
        other: m.otherCents / 100,
      })),
    [rows, months, typeOf],
  );

  const Tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <TipShell title={monthLabel(String(label))} total={p.subscriptionCents + p.usageCents + p.otherCents} hint={onSelectMonth ? 'Click to open this month' : undefined}>
        {KINDS.map((k) => (
          <TipRow key={k} color={typeColors(k)} label={KIND_LABELS[k]} cents={p[`${k}Cents`]} />
        ))}
      </TipShell>
    );
  };

  return (
    <div>
      <div className="legend" style={{ marginBottom: 10 }}>
        {KINDS.map((k) => (
          <span key={k} className="legend-item">
            <span className="dot" style={{ background: typeColors(k) }} />
            {KIND_LABELS[k]}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onClick={(s: any) => {
            const i = s?.activeTooltipIndex ?? s?.activeIndex;
            if (onSelectMonth && i !== undefined && i !== null && data[Number(i)]) onSelectMonth(String(data[Number(i)].month));
          }}
          style={{ cursor: onSelectMonth ? 'pointer' : undefined }}
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={monthTick(months)} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickFormatter={yTick} tick={axisTick} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-hover)' }} isAnimationActive={false} />
          {KINDS.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="s" fill={typeColors(k)} stroke="var(--surface)" strokeWidth={1} maxBarSize={24} radius={i === KINDS.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={String(d.month)} fillOpacity={selectedMonth && d.month !== selectedMonth ? 0.38 : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
