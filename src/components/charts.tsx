import { useId, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { niceAxis } from './chartAxis';
import { monthlyByProvider } from '../lib/analytics';
import type { ExpectedCharge } from '../lib/forecast';
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

function TipRow({ color, label, cents, line, hatch }: { color: string; label: string; cents: number; line?: boolean; hatch?: boolean }) {
  return (
    <div className="chart-tip-row">
      <span>
        {line ? (
          <span className="legend-line" style={{ background: color }} />
        ) : hatch ? (
          <span className="dot dot-hatch" style={{ ['--hatch' as string]: color }} />
        ) : (
          <span className="dot" style={{ background: color }} />
        )}
        {label}
      </span>
      <span className="num">{formatEUR(cents)}</span>
    </div>
  );
}

// ---------- monthly spending stacked by provider, category or commitment type ----------

/** What is still due this month: stacked on top of that month's bar as hatched segments, one per series. */
export interface Projection {
  month: string;
  charges: ExpectedCharge[];
}

interface Series {
  key: string;
  label: string;
  color: string;
  href?: string;
  title?: string;
}

/** The bars that are not selected, once a month is selected. */
const FADED = 0.45;
const DUE_PREFIX = 'due:';

/** Cents per series key of the charges still due, with `keyOf` choosing the series each one belongs to. */
function dueByKey(projection: Projection | undefined, keyOf: (e: ExpectedCharge) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of projection?.charges ?? []) out[keyOf(e)] = (out[keyOf(e)] ?? 0) + e.cents;
  return out;
}

function StackedMonthlyChart({
  stack,
  series,
  projection,
  dueKeyOf,
  selectedMonth,
  onSelectMonth,
  months,
  height,
  fill,
  legend = true,
}: {
  stack: { month: string; totalCents: number; cents: Record<string, number> }[];
  series: Series[];
  projection?: Projection;
  dueKeyOf: (e: ExpectedCharge) => string;
  selectedMonth?: string | null;
  onSelectMonth?: (m: string) => void;
  months: string[];
  height: number;
  /** Grow to the height of the card instead of a fixed height. */
  fill?: boolean;
  legend?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const due = useMemo(() => dueByKey(projection, dueKeyOf), [projection, dueKeyOf]);
  const dueTotal = Object.values(due).reduce((a, b) => a + b, 0);
  const hasDue = projection !== undefined && dueTotal > 0 && months.includes(projection.month);

  const { data, peakCents } = useMemo(() => {
    let peak = 0;
    const data = stack.map((s) => {
      const row: Record<string, number | string> = { month: s.month, total: s.totalCents, dueTotal: 0 };
      for (const k of series) row[k.key] = (s.cents[k.key] ?? 0) / 100;
      let dueCents = 0;
      if (hasDue && s.month === projection!.month) {
        for (const k of series) {
          row[DUE_PREFIX + k.key] = (due[k.key] ?? 0) / 100;
          dueCents += due[k.key] ?? 0;
        }
        row.dueTotal = dueCents;
      }
      peak = Math.max(peak, s.totalCents + dueCents);
      return row;
    });
    return { data, peakCents: peak };
  }, [stack, series, due, hasDue, projection]);
  const axis = useMemo(() => niceAxis(peakCents / 100), [peakCents]);
  const dueRow = hasDue ? data.find((d) => d.month === projection!.month) : undefined;
  const lastKey = series[series.length - 1]?.key;

  const Tip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Record<string, number>;
    const items = series
      .map((k) => ({ k, cents: Math.round(Number(row[k.key] ?? 0) * 100) }))
      .filter((i) => i.cents !== 0)
      .sort((a, b) => b.cents - a.cents);
    const dueItems = series
      .map((k) => ({ k, cents: Math.round(Number(row[DUE_PREFIX + k.key] ?? 0) * 100) }))
      .filter((i) => i.cents !== 0)
      .sort((a, b) => b.cents - a.cents);
    return (
      <TipShell title={monthLabel(String(label))} total={Number(row.total)} hint={onSelectMonth ? `View ${monthLabel(String(label))}` : undefined}>
        {items.length === 0 && <div className="muted">No recorded spending</div>}
        {items.map((i) => (
          <TipRow key={i.k.key} color={i.k.color} label={i.k.label} cents={i.cents} />
        ))}
        {dueItems.length > 0 && (
          <>
            <div className="chart-tip-sub">
              <span>Still due</span>
              <span className="num">+{formatEUR(Number(row.dueTotal))}</span>
            </div>
            {dueItems.map((i) => (
              <TipRow key={i.k.key} color={i.k.color} label={i.k.label} cents={i.cents} hatch />
            ))}
          </>
        )}
      </TipShell>
    );
  };

  const faded = (month: unknown) => (selectedMonth && month !== selectedMonth ? FADED : 1);

  const chart = (
    <ResponsiveContainer width="100%" height={fill ? '100%' : height}>
      <BarChart
        data={data}
        margin={{ top: 22, right: hasDue ? 30 : 4, left: 0, bottom: 0 }}
        onClick={(s: any) => {
          const i = s?.activeTooltipIndex ?? s?.activeIndex;
          if (onSelectMonth && i !== undefined && i !== null && data[Number(i)]) onSelectMonth(String(data[Number(i)].month));
        }}
        style={{ cursor: onSelectMonth ? 'pointer' : undefined }}
      >
        <defs>
          {series.map((k, i) => (
            <pattern key={k.key} id={`${uid}-h${i}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={k.color} fillOpacity={0.22} />
              <rect width="3" height="6" fill={k.color} fillOpacity={0.62} />
            </pattern>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickFormatter={monthTick(months)} tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={8} />
        <YAxis domain={[0, axis.max]} ticks={axis.ticks} tickFormatter={yTick} tick={axisTick} tickLine={false} axisLine={false} width={52} allowDecimals={false} />
        <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-hover)' }} isAnimationActive={false} />
        {series.map((k) => (
          <Bar
            key={k.key}
            dataKey={k.key}
            stackId="s"
            fill={k.color}
            stroke="var(--surface)"
            strokeWidth={1}
            maxBarSize={32}
            radius={!hasDue && k.key === lastKey ? [3, 3, 0, 0] : 0}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={String(d.month)} fillOpacity={faded(d.month)} />
            ))}
          </Bar>
        ))}
        {hasDue &&
          series.map((k, i) => (
            <Bar
              key={DUE_PREFIX + k.key}
              dataKey={DUE_PREFIX + k.key}
              stackId="s"
              fill={`url(#${uid}-h${i})`}
              stroke="var(--surface)"
              strokeWidth={1}
              maxBarSize={32}
              radius={k.key === lastKey ? [3, 3, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        {dueRow && (
          <ReferenceDot
            x={String(dueRow.month)}
            y={(Number(dueRow.total) + Number(dueRow.dueTotal)) / 100}
            r={0}
            ifOverflow="visible"
            label={{ value: `≥ ${formatEUR(Number(dueRow.total) + Number(dueRow.dueTotal))}`, position: 'top', fill: 'var(--ink-2)', fontSize: 11, fontWeight: 600 }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className={fill ? 'chart-fill' : undefined}>
      {legend && (
        <div className="legend" style={{ marginBottom: 10 }}>
          {series.map((k) =>
            k.href ? (
              <a key={k.key} className="legend-item" href={k.href}>
                <span className="dot" style={{ background: k.color }} />
                {k.label}
              </a>
            ) : (
              <span key={k.key} className="legend-item" title={k.title}>
                <span className="dot" style={{ background: k.color }} />
                {k.label}
              </span>
            ),
          )}
        </div>
      )}
      {fill ? (
        <div className="chart-fill-box">
          <div className="chart-fill-abs">{chart}</div>
        </div>
      ) : (
        chart
      )}
    </div>
  );
}

interface StackedProps {
  rows: LedgerRow[];
  months: string[];
  /** The charges still due this month, stacked on that month's bar. Only the current month has any. */
  projection?: Projection;
  selectedMonth?: string | null;
  onSelectMonth?: (m: string) => void;
  height?: number;
  fill?: boolean;
}

export function MonthlyProviderChart({ rows, months, projection, selectedMonth, onSelectMonth, height = 280, fill }: StackedProps) {
  const { colors } = useLedger();
  const keyOf = useMemo(() => (e: ExpectedCharge) => (colors.seriesSet.has(e.provider) ? e.provider : OTHER_KEY), [colors]);
  const stack = useMemo(() => monthlyByProvider(rows, months, colors.seriesSet, OTHER_KEY), [rows, months, colors]);
  const series = useMemo(() => {
    const present = new Set<string>(Object.keys(dueByKey(projection, keyOf)));
    for (const s of stack) for (const k of Object.keys(s.cents)) present.add(k);
    const otherProviders = new Set<string>();
    for (const r of rows) if (!colors.seriesSet.has(r.provider)) otherProviders.add(r.provider);
    for (const e of projection?.charges ?? []) if (!colors.seriesSet.has(e.provider)) otherProviders.add(e.provider);
    const list: Series[] = colors.series
      .filter((p) => present.has(p))
      .map((p) => ({ key: p, label: p, color: colors.color(p), href: providerHref(p) }));
    if (present.has(OTHER_KEY)) {
      list.push({ key: OTHER_KEY, label: `Other (${otherProviders.size})`, color: colors.otherColor, title: [...otherProviders].sort().join(', ') });
    }
    return list;
  }, [stack, rows, colors, projection, keyOf]);
  return (
    <StackedMonthlyChart
      stack={stack}
      series={series}
      projection={projection}
      dueKeyOf={keyOf}
      months={months}
      selectedMonth={selectedMonth}
      onSelectMonth={onSelectMonth}
      height={height}
      fill={fill}
    />
  );
}

/** One provider's months, in its colour: the same chart as the Overview's, with one series and no legend. */
export function ProviderMonthlyChart({
  provider,
  rows,
  months,
  projection,
  selectedMonth,
  onSelectMonth,
  height = 280,
  fill,
}: StackedProps & { provider: string }) {
  const { colors } = useLedger();
  const stack = useMemo(() => {
    const by = new Map<string, number>(months.map((m) => [m, 0]));
    for (const r of rows) {
      const m = r.date.slice(0, 7);
      if (by.has(m)) by.set(m, (by.get(m) ?? 0) + r.amountCents);
    }
    return months.map((m) => ({ month: m, totalCents: by.get(m) ?? 0, cents: { [provider]: by.get(m) ?? 0 } as Record<string, number> }));
  }, [rows, months, provider]);
  const series = useMemo(() => [{ key: provider, label: provider, color: colors.color(provider) }], [provider, colors]);
  const keyOf = useMemo(() => () => provider, [provider]);
  return (
    <StackedMonthlyChart
      stack={stack}
      series={series}
      projection={projection}
      dueKeyOf={keyOf}
      months={months}
      selectedMonth={selectedMonth}
      onSelectMonth={onSelectMonth}
      height={height}
      fill={fill}
      legend={false}
    />
  );
}

export function MonthlyCategoryChart({
  rows,
  months,
  categoryFor,
  projection,
  selectedMonth,
  onSelectMonth,
  height = 280,
  fill,
}: StackedProps & { categoryFor: (row: any) => Category }) {
  const { categoryColors } = useLedger();
  const keyOf = useMemo(() => (e: ExpectedCharge) => e.category as string, []);
  const stack = useMemo(() => monthlyByCategory(rows, months, categoryFor), [rows, months, categoryFor]);
  const series = useMemo(() => {
    const present = new Set<string>(Object.keys(dueByKey(projection, keyOf)));
    for (const s of stack) for (const k of Object.keys(s.cents)) present.add(k);
    return CATEGORIES.filter((c) => present.has(c)).map((c) => ({ key: c, label: CATEGORY_LABELS[c], color: categoryColors(c) }));
  }, [stack, categoryColors, projection, keyOf]);
  return (
    <StackedMonthlyChart
      stack={stack}
      series={series}
      projection={projection}
      dueKeyOf={keyOf}
      months={months}
      selectedMonth={selectedMonth}
      onSelectMonth={onSelectMonth}
      height={height}
      fill={fill}
    />
  );
}

// ---------- subscription, usage and one-time ----------

const KINDS: ChargeKind[] = ['subscription', 'usage', 'other'];
/** Everything the estimate adds is a recurring charge, so it stacks as subscription. */
const dueAsSubscription = () => 'subscription';

export function TypeChart({
  rows,
  months,
  typeOf,
  projection,
  selectedMonth,
  onSelectMonth,
  height = 260,
  fill,
}: StackedProps & { typeOf: (row: any) => TypeInfo }) {
  const { typeColors } = useLedger();
  const stack = useMemo(
    () =>
      typeByMonth(rows, months, typeOf).map((m) => ({
        month: m.month,
        totalCents: m.subscriptionCents + m.usageCents + m.otherCents,
        cents: { subscription: m.subscriptionCents, usage: m.usageCents, other: m.otherCents } as Record<string, number>,
      })),
    [rows, months, typeOf],
  );
  const series = useMemo(() => KINDS.map((k) => ({ key: k, label: KIND_LABELS[k], color: typeColors(k) })), [typeColors]);
  return (
    <StackedMonthlyChart
      stack={stack}
      series={series}
      projection={projection}
      dueKeyOf={dueAsSubscription}
      months={months}
      selectedMonth={selectedMonth}
      onSelectMonth={onSelectMonth}
      height={height}
      fill={fill}
    />
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
          <CartesianGrid vertical={false} stroke="var(--border)" />
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
          <CartesianGrid vertical={false} stroke="var(--border)" />
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
