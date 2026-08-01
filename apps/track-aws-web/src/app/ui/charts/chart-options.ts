import type { EChartsCoreOption } from 'echarts/core';

const TEXT = '#9aa8c3';
const ACCENT = '#3dd6c6';
const BLUE = '#5b8def';
const DANGER = '#f07178';
const WARN = '#e6b450';
const OK = '#7fd99a';

export function gaugeScoreOption(score: number): EChartsCoreOption {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        progress: { show: true, width: 14 },
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [0.4, DANGER],
              [0.7, WARN],
              [1, ACCENT],
            ],
          },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 28,
          fontWeight: 700,
          color: '#e8eef9',
          offsetCenter: [0, '10%'],
          formatter: '{value}',
        },
        data: [{ value }],
      },
    ],
  };
}

export function wafRadarOption(pillars: {
  operationalExcellence: number;
  security: number;
  reliability: number;
  performanceEfficiency: number;
  costOptimization: number;
  sustainability: number;
}): EChartsCoreOption {
  const values = [
    pillars.operationalExcellence,
    pillars.security,
    pillars.reliability,
    pillars.performanceEfficiency,
    pillars.costOptimization,
    pillars.sustainability,
  ].map((v) => Math.max(0, Math.min(100, Math.round(v))));

  return {
    color: [ACCENT],
    radar: {
      indicator: [
        { name: 'Ops', max: 100 },
        { name: 'Security', max: 100 },
        { name: 'Reliability', max: 100 },
        { name: 'Perf', max: 100 },
        { name: 'Cost', max: 100 },
        { name: 'Sustain', max: 100 },
      ],
      axisName: { color: TEXT, fontSize: 11 },
      splitArea: { areaStyle: { color: ['#121a2b', '#182338'] } },
      splitLine: { lineStyle: { color: '#243049' } },
      axisLine: { lineStyle: { color: '#243049' } },
    },
    series: [
      {
        type: 'radar',
        data: [{ value: values, name: 'WAF', areaStyle: { opacity: 0.25 } }],
        lineStyle: { width: 2 },
      },
    ],
  };
}

export function severityPieOption(counts: {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  INFO: number;
}): EChartsCoreOption {
  const data = [
    { name: 'CRITICAL', value: counts.CRITICAL, itemStyle: { color: DANGER } },
    { name: 'HIGH', value: counts.HIGH, itemStyle: { color: WARN } },
    { name: 'MEDIUM', value: counts.MEDIUM, itemStyle: { color: BLUE } },
    { name: 'LOW', value: counts.LOW, itemStyle: { color: ACCENT } },
    { name: 'INFO', value: counts.INFO, itemStyle: { color: OK } },
  ].filter((d) => d.value > 0);

  return {
    tooltip: { trigger: 'item' },
    legend: {
      bottom: 0,
      textStyle: { color: TEXT, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '46%'],
        label: { color: TEXT, fontSize: 11 },
        data: data.length
          ? data
          : [{ name: 'Sin datos', value: 1, itemStyle: { color: '#243049' } }],
      },
    ],
  };
}

export function savingsBarOption(
  rows: Array<{ name: string; value: number }>,
): EChartsCoreOption {
  const top = rows.slice(0, 8);
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: TEXT, formatter: '${value}' },
      splitLine: { lineStyle: { color: '#243049' } },
    },
    yAxis: {
      type: 'category',
      data: top.map((r) => r.name).reverse(),
      axisLabel: { color: TEXT, width: 110, overflow: 'truncate' },
      axisLine: { lineStyle: { color: '#243049' } },
    },
    series: [
      {
        type: 'bar',
        data: top.map((r) => r.value).reverse(),
        itemStyle: {
          color: ACCENT,
          borderRadius: [0, 6, 6, 0],
        },
        barWidth: 14,
      },
    ],
  };
}

export function scoreTrendOption(
  points: Array<{ label: string; score: number; savings: number }>,
): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['Score', 'Ahorro $/mes'],
      textStyle: { color: TEXT },
      top: 0,
    },
    grid: { left: 8, right: 12, top: 36, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.label),
      axisLabel: { color: TEXT },
      axisLine: { lineStyle: { color: '#243049' } },
    },
    yAxis: [
      {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: TEXT },
        splitLine: { lineStyle: { color: '#243049' } },
      },
      {
        type: 'value',
        axisLabel: { color: TEXT, formatter: '${value}' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Score',
        type: 'line',
        smooth: true,
        data: points.map((p) => p.score),
        itemStyle: { color: BLUE },
        areaStyle: { opacity: 0.12 },
      },
      {
        name: 'Ahorro $/mes',
        type: 'bar',
        yAxisIndex: 1,
        data: points.map((p) => p.savings),
        itemStyle: { color: ACCENT, borderRadius: [4, 4, 0, 0] },
        barWidth: 16,
      },
    ],
  };
}
