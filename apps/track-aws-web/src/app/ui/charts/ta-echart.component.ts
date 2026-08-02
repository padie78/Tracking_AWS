import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
  effect,
  input,
} from '@angular/core';
import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, GraphChart, LineChart, PieChart, RadarChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';

echarts.use([
  BarChart,
  GaugeChart,
  GraphChart,
  LineChart,
  PieChart,
  RadarChart,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  CanvasRenderer,
]);

@Component({
  standalone: true,
  selector: 'ta-echart',
  encapsulation: ViewEncapsulation.None,
  template: `<div #host class="ta-echart" [style.height]="height()"></div>`,
})
export class TaEchartComponent implements AfterViewInit, OnDestroy {
  readonly options = input.required<EChartsCoreOption>();
  readonly height = input('260px');

  @ViewChild('host', { static: true })
  private readonly host!: ElementRef<HTMLDivElement>;

  private chart: EChartsType | null = null;
  private ro: ResizeObserver | null = null;
  private viewReady = false;

  constructor() {
    effect(() => {
      const opt = this.options();
      if (!this.viewReady || !this.chart) return;
      this.chart.setOption(opt, { notMerge: true });
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.host.nativeElement, undefined, {
      renderer: 'canvas',
    });
    this.viewReady = true;
    this.chart.setOption(this.options(), { notMerge: true });
    this.ro = new ResizeObserver(() => this.chart?.resize());
    this.ro.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.chart?.dispose();
    this.chart = null;
  }
}
