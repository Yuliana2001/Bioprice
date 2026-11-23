import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import type { TooltipComponentFormatterCallbackParams } from 'echarts';
import { ECharts, EChartsCoreOption, init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import { BrandModelMatch } from '../../core/dashboard/dashboard.service';

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

@Component({
  selector: 'app-brand-model-chart',
  template: `
    <figure class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <figcaption class="font-semibold text-[#0B1736]">{{ category }}</figcaption>
      <div
        #chartElement
        class="mt-3 w-full"
        [style.height.px]="chartHeight"
        role="img"
        [attr.aria-label]="'Coincidencias DIAN-INVIMA por marca y modelo: ' + category"
      ></div>
      <p class="mt-2 text-xs text-slate-500">
        Eje horizontal: coincidencias DIAN–INVIMA. Eje vertical: marca | producto INVIMA.
      </p>
    </figure>
  `,
})
export class BrandModelChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) category = '';
  @Input({ required: true }) rows: BrandModelMatch[] = [];
  @ViewChild('chartElement', { static: true }) private chartElement!: ElementRef<HTMLDivElement>;

  private chart: ECharts | null = null;
  private observer: ResizeObserver | null = null;

  protected get chartHeight(): number {
    return Math.max(180, this.rows.length * 38 + 55);
  }

  ngAfterViewInit(): void {
    this.chart = init(this.chartElement.nativeElement);
    this.renderChart();
    this.observer = new ResizeObserver(() => {
      this.chart?.resize();
      this.renderChart();
    });
    this.observer.observe(this.chartElement.nativeElement);
  }

  ngOnChanges(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.chart?.dispose();
  }

  private renderChart(): void {
    if (!this.chart) {
      return;
    }

    const labelWidth = Math.min(250, Math.max(90, Math.floor(this.chart.getWidth() * 0.38)));
    const option: EChartsCoreOption = {
      grid: { top: 10, bottom: 35, left: labelWidth + 12, right: 38 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        renderMode: 'richText',
        formatter: (params: TooltipComponentFormatterCallbackParams) => {
          const point = Array.isArray(params) ? params[0] : params;
          const row = point ? this.rows[point.dataIndex] : undefined;
          return row
            ? `${row.MARCA_MODELO}\nCoincidencias DIAN-INVIMA: ${row.COINCIDENCIAS}\nRegistros sanitarios distintos: ${row.REGISTROS_INVIMA}`
            : '';
        },
      },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: '#475569' },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: this.rows.map((row) => row.MARCA_MODELO),
        axisLabel: { color: '#334155', width: labelWidth, overflow: 'truncate' },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: this.rows.map((row) => row.COINCIDENCIAS),
          barMaxWidth: 24,
          itemStyle: { color: '#028c84', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: '#334155' },
        },
      ],
    };
    this.chart.setOption(option, true);
  }
}
