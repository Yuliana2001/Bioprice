import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import type { TooltipComponentFormatterCallbackParams } from 'echarts';
import { ECharts, EChartsCoreOption, graphic, init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import {
  AnalyticsChartId,
  AnalyticsRow,
  AnalyticsValue,
  DashboardService,
} from '../../core/dashboard/dashboard.service';

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export interface AnalyticsChartSpec {
  id: AnalyticsChartId;
  title: string;
  x: string;
  y: string;
  unit: string;
  type: 'bar' | 'line' | 'area';
  group?: string;
  family?: string;
  year?: string;
  country?: string;
  importer?: string;
  selectFamily?: boolean;
  horizontal?: boolean;
  logarithmic?: boolean;
  monthlyPeriod?: boolean;
  colorBy?: string;
  details?: string[];
  note?: string;
}

@Component({
  selector: 'app-analytics-chart',
  imports: [DatePipe],
  template: `
    <figure class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      [class.trm-highlight]="spec.id === 'trm_mensual_2021_2026'">
      @if (spec.id === 'trm_mensual_2021_2026') {
        <p class="mb-2 text-xs font-bold uppercase tracking-widest text-[#087e75]">Indicador cambiario</p>
      }
      <figcaption class="text-lg font-semibold text-[#0B1736]">{{ spec.title }}</figcaption>
      @if (spec.note) { <p class="mt-2 text-sm text-slate-600">{{ spec.note }}</p> }
      @if (generatedAt()) {
        <p class="mt-2 text-xs text-slate-500">
          Exportado: {{ generatedAt() | date: 'dd/MM/yyyy HH:mm' }}
        </p>
      } @else if (state() === 'ready') {
        <p class="mt-2 text-xs text-slate-500">Fecha de exportación no disponible.</p>
      }
      @if (spec.id === 'trm_mensual_2021_2026' && state() === 'ready' && latestTrm(); as latest) {
        <div class="mt-4 rounded-xl border border-teal-100 bg-white/80 px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Último mes visible · {{ latest.month }}</p>
          <p class="mt-1 text-2xl font-bold text-[#087e75]">{{ format(latest.value) }} <span class="text-sm font-medium">COP/USD</span></p>
        </div>
      }
      @if (state() === 'loading') {
        <p class="mt-4 text-sm text-slate-600" role="status">Cargando resultados…</p>
      } @else if (state() === 'missing') {
        <p class="mt-4 text-sm text-slate-600" role="status">Resultado no disponible en la última exportación.</p>
      } @else if (state() === 'error') {
        <p class="mt-4 text-sm text-red-800" role="alert">No se pudo leer este resultado.</p>
      } @else if (rows().length === 0) {
        <p class="mt-4 text-sm text-slate-600" role="status">La exportación no contiene registros.</p>
      } @else {
        <div class="mt-4 flex flex-wrap gap-3">
          @if (spec.family && familyOptions().length > 0) {
            <label class="text-sm text-slate-700" [class.min-w-0]="spec.id === 'cuotas_importadores'" [class.max-w-full]="spec.id === 'cuotas_importadores'">Familia
              <select class="ml-1 rounded border border-slate-300 p-1" [class.max-w-full]="spec.id === 'cuotas_importadores'" [value]="family()" (change)="setFilter('family', $event)">
                @if (!spec.selectFamily) { <option value="">Todas</option> }
                @for (option of familyOptions(); track option) { <option [value]="option">{{ option }}</option> }
              </select>
            </label>
          }
          @if (spec.year && yearOptions().length > 0) {
            <label class="text-sm text-slate-700">Año
              <select class="ml-1 rounded border border-slate-300 p-1" [value]="year()" (change)="setFilter('year', $event)">
                <option value="">Todos</option>
                @for (option of yearOptions(); track option) { <option [value]="option">{{ option }}</option> }
              </select>
            </label>
          }
          @if (spec.country && countryOptions().length > 0) {
            <label class="text-sm text-slate-700">País
              <select class="ml-1 rounded border border-slate-300 p-1" [value]="country()" (change)="setFilter('country', $event)">
                <option value="">Todos</option>
                @for (option of countryOptions(); track option) { <option [value]="option">{{ option }}</option> }
              </select>
            </label>
          }
          @if (spec.importer && importerOptions().length > 0) {
            <label class="text-sm text-slate-700" [class.min-w-0]="spec.id === 'cuotas_importadores'" [class.max-w-full]="spec.id === 'cuotas_importadores'">Importador
              <select class="ml-1 rounded border border-slate-300 p-1" [class.max-w-full]="spec.id === 'cuotas_importadores'" [value]="importer()" (change)="setFilter('importer', $event)">
                <option value="">Todos</option>
                @for (option of importerOptions(); track option) { <option [value]="option">{{ option }}</option> }
              </select>
            </label>
          }
        </div>
        <p class="mt-2 text-xs text-slate-500">Los filtros seleccionan filas exportadas; no recalculan los indicadores.</p>
        @if (filteredRows().length === 0) {
          <p class="mt-4 text-sm text-slate-600" role="status">No hay filas para los filtros seleccionados.</p>
        }
      }
      <div #chartElement class="mt-3 w-full" [hidden]="state() !== 'ready' || filteredRows().length === 0"
        [style.height.px]="spec.horizontal ? 260 : 340" role="img" [attr.aria-label]="spec.title"></div>
    </figure>
  `,
  styles: [`
    .trm-highlight {
      border-color: #b7e5df;
      background: linear-gradient(135deg, #f1fbf9 0%, #fff 62%, #eef6ff 100%);
      box-shadow: 0 12px 30px rgba(8, 126, 117, 0.08);
    }
  `],
})
export class AnalyticsChartComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) spec!: AnalyticsChartSpec;
  @ViewChild('chartElement', { static: true }) private chartElement!: ElementRef<HTMLDivElement>;

  private readonly dashboard = inject(DashboardService);
  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly rows = signal<AnalyticsRow[]>([]);
  protected readonly generatedAt = signal<string | null>(null);
  protected readonly family = signal('');
  protected readonly year = signal('');
  protected readonly country = signal('');
  protected readonly importer = signal('');
  private chart: ECharts | null = null;
  private observer: ResizeObserver | null = null;

  ngOnInit(): void {
    this.dashboard.getAnalyticsChart(this.spec.id).subscribe({
      next: (response) => {
        this.rows.set(response.data);
        this.generatedAt.set(response.generated_at);
        if (this.spec.selectFamily) this.family.set(this.familyOptions()[0] ?? '');
        this.state.set('ready');
        this.renderChart();
      },
      error: (error: unknown) => {
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'missing' : 'error');
      },
    });
  }

  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => {
      this.initializeChart();
      this.chart?.resize();
      this.renderChart();
    });
    this.observer.observe(this.chartElement.nativeElement);
    this.initializeChart();
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.chart?.dispose();
  }

  protected familyOptions(): string[] { return this.options(this.spec.family); }
  protected yearOptions(): string[] { return this.options(this.spec.year); }
  protected countryOptions(): string[] { return this.options(this.spec.country, true); }
  protected importerOptions(): string[] { return this.options(this.spec.importer, true); }

  protected filteredRows(): AnalyticsRow[] {
    let rows = this.rows();
    if (this.spec.id === 'cuotas_importadores' && this.family()) {
      const familyRows = rows.filter((row) => this.value(row, this.spec.family) === this.family());
      const years = [...new Set(familyRows.map((row) => this.value(row, this.spec.year)))];
      const importers = [...new Set(familyRows.map((row) => this.value(row, this.spec.importer)))];
      const existing = new Set(familyRows.map((row) =>
        JSON.stringify([this.value(row, this.spec.year), this.value(row, this.spec.importer)]),
      ));
      rows = [...familyRows];
      for (const year of years) {
        for (const importer of importers) {
          if (!existing.has(JSON.stringify([year, importer]))) {
            rows.push({ FAMILIA: this.family(), ANIO: year, NOMBRE: importer, CUOTA_PCT: 0 });
          }
        }
      }
    }
    return rows.filter((row) =>
      (!this.family() || this.value(row, this.spec.family) === this.family()) &&
      (!this.year() || this.value(row, this.spec.year) === this.year()) &&
      (!this.country() || this.value(row, this.spec.country) === this.country()) &&
      (!this.importer() || this.value(row, this.spec.importer) === this.importer()),
    );
  }

  protected setFilter(name: 'family' | 'year' | 'country' | 'importer', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this[name].set(value);
    if (name === 'family') {
      this.country.set('');
      this.importer.set('');
    }
    this.renderChart();
  }

  private value(row: AnalyticsRow, key: string | undefined): string {
    const value = key ? row[key] : null;
    return value == null ? '' : String(value);
  }

  private options(key: string | undefined, withinFamily = false): string[] {
    if (!key) return [];
    const rows = withinFamily && this.family()
      ? this.rows().filter((row) => this.value(row, this.spec.family) === this.family())
      : this.rows();
    return [...new Set(rows.map((row) => this.value(row, key)).filter(Boolean))].sort();
  }

  protected format(value: AnalyticsValue | undefined): string {
    if (value == null) return 'n/d';
    return typeof value === 'number'
      ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)
      : String(value);
  }

  protected latestTrm(): { month: string; value: number } | null {
    const latest = this.filteredRows()
      .filter((row) => typeof row['PERIODO'] === 'string' && typeof row['TRM_PROMEDIO_COP_USD'] === 'number')
      .sort((a, b) => String(b['PERIODO']).localeCompare(String(a['PERIODO'])))[0];
    if (!latest || typeof latest['PERIODO'] !== 'string' || typeof latest['TRM_PROMEDIO_COP_USD'] !== 'number') return null;
    return { month: latest['PERIODO'].slice(0, 7), value: latest['TRM_PROMEDIO_COP_USD'] };
  }

  private initializeChart(): void {
    const element = this.chartElement.nativeElement;
    if (!this.chart && this.state() === 'ready' && element.clientWidth > 0 && element.clientHeight > 0) {
      this.chart = init(element);
    }
  }

  private renderChart(): void {
    if (!this.chart || this.state() !== 'ready') return;
    if (this.spec.id === 'cuotas_importadores') {
      this.renderSharesChart();
      return;
    }
    const rows = this.filteredRows();
    const categories = [...new Set(rows.map((row) => this.value(row, this.spec.x)))];
    if (this.spec.monthlyPeriod) categories.sort();
    const groups = this.spec.group
      ? [...new Set(rows.map((row) => this.value(row, this.spec.group)))]
      : [this.spec.title];
    const isTrm = this.spec.id === 'trm_mensual_2021_2026';
    const colorValues = this.spec.colorBy
      ? rows.map((row) => row[this.spec.colorBy!]).filter((value): value is number => typeof value === 'number')
      : [];
    const colorLimit = Math.max(1, ...colorValues.map((value) => Math.abs(value)));
    const series = groups.map((group) => ({
      name: group,
      type: this.spec.type === 'area' ? 'line' as const : this.spec.type,
      ...(this.spec.type === 'area' ? { stack: 'cuota', areaStyle: {} } : {}),
      ...(isTrm ? {
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: false,
        lineStyle: { color: '#008f85', width: 3 },
        itemStyle: { color: '#008f85' },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 143, 133, 0.32)' },
            { offset: 1, color: 'rgba(0, 143, 133, 0.02)' },
          ]),
        },
      } : {}),
      data: categories.map((category) => {
        const row = rows.find((item) =>
          this.value(item, this.spec.x) === category &&
          (!this.spec.group || this.value(item, this.spec.group) === group),
        );
        const value = row?.[this.spec.y];
        const number = typeof value === 'number' && (!this.spec.logarithmic || value > 0) ? value : null;
        if (this.spec.colorBy) return [category, number, row?.[this.spec.colorBy] ?? null];
        return number;
      }),
    }));
    const categoryAxis = {
      type: 'category' as const,
      data: categories,
      inverse: this.spec.horizontal ?? false,
      axisLabel: {
        color: '#475569',
        rotate: this.spec.horizontal ? 0 : 25,
        hideOverlap: true,
        ...(this.spec.monthlyPeriod ? { formatter: (value: string) => value.slice(0, 7) } : {}),
      },
    };
    const valueAxis = {
      type: this.spec.logarithmic ? 'log' as const : 'value' as const,
      name: this.spec.unit,
      ...(isTrm ? { scale: true, splitLine: { lineStyle: { color: '#dfedeb' } } } : {}),
      axisLabel: { color: '#475569' },
    };
    const option: EChartsCoreOption = {
      grid: { top: 50, bottom: this.spec.colorBy ? 100 : 75, left: this.spec.horizontal ? 140 : 75, right: 25 },
      legend: { show: Boolean(this.spec.group), type: 'scroll', bottom: 0 },
      tooltip: {
        trigger: 'axis',
        renderMode: 'richText',
        formatter: (params: TooltipComponentFormatterCallbackParams) => {
          const points = Array.isArray(params) ? params : [params];
          const category = categories[points[0]?.dataIndex ?? -1] ?? '';
          const lines = points.map((point) => {
            const row = rows.find((item) =>
              this.value(item, this.spec.x) === category &&
              (!this.spec.group || this.value(item, this.spec.group) === point.seriesName),
            );
            if (!row) return '';
            const extra = (this.spec.details ?? []).map((key) => `${key}: ${this.format(row[key])}`).join(' · ');
            return `${this.spec.group ? point.seriesName + ': ' : ''}${this.format(row[this.spec.y])} ${this.spec.unit}${extra ? '\n' + extra : ''}`;
          }).filter(Boolean);
          return [this.spec.monthlyPeriod ? category.slice(0, 7) : category, ...lines].join('\n');
        },
      },
      xAxis: this.spec.horizontal ? valueAxis : categoryAxis,
      yAxis: this.spec.horizontal ? categoryAxis : valueAxis,
      ...(this.spec.colorBy ? {
        visualMap: { min: -colorLimit, max: colorLimit, dimension: 2, orient: 'horizontal', left: 'center', bottom: 5,
          text: ['Prima %', 'Descuento %'], inRange: { color: ['#2166ac', '#f7f7f7', '#b2182b'] } },
      } : {}),
      series,
    };
    this.chart.setOption(option, true);
    this.chart.resize();
  }

  private renderSharesChart(): void {
    if (!this.chart) return;
    const familyRows = this.rows().filter((row) => this.value(row, this.spec.family) === this.family());
    const presentYears = [...new Set(familyRows.map((row) => Number(row['ANIO'])))].sort((a, b) => a - b);
    if (presentYears.length === 0) return;
    const categories: string[] = [];
    if (this.year()) {
      categories.push(this.year());
    } else {
      for (let year = presentYears[0]; year <= presentYears[presentYears.length - 1]; year++) {
        categories.push(String(year));
      }
    }
    const rows = this.filteredRows();
    const groups = this.importer()
      ? [this.importer()]
      : [...new Set(familyRows.map((row) => this.value(row, this.spec.importer)))].sort();
    const singleYear = Boolean(this.year());
    const option: EChartsCoreOption = {
      color: ['#006d77', '#e76f51', '#335caa', '#9c4dcc', '#a16b00', '#bc4077',
        '#52913e', '#565b66', '#a44a3f', '#0089a1', '#6f6834'],
      grid: { top: 50, bottom: 85, left: 60, right: 20 },
      legend: {
        type: 'scroll', bottom: 0,
        formatter: (name: string) => name.length > 18 ? name.slice(0, 17) + '…' : name,
      },
      tooltip: {
        trigger: 'item',
        renderMode: 'richText',
        formatter: (params: TooltipComponentFormatterCallbackParams) => {
          const point = Array.isArray(params) ? params[0] : params;
          const year = categories[point.dataIndex];
          const row = rows.find((item) =>
            this.value(item, this.spec.year) === year &&
            this.value(item, this.spec.importer) === point.seriesName,
          );
          if (!row) return '';
          const fob = typeof row['_fob'] === 'number' ? `\nFOB: ${this.format(row['_fob'])} USD` : '';
          return `${year}\n${point.seriesName}\nParticipación FOB: ${this.format(row['CUOTA_PCT'])} %${fob}`;
        },
      },
      xAxis: { type: 'category', data: categories, axisLabel: { color: '#475569', hideOverlap: true } },
      yAxis: { type: 'value', name: '% FOB', min: 0, max: 100, axisLabel: { color: '#475569' } },
      series: groups.map((group) => ({
        name: group,
        type: singleYear ? 'bar' as const : 'line' as const,
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: false,
        data: categories.map((year) => {
          const row = rows.find((item) =>
            this.value(item, this.spec.year) === year &&
            this.value(item, this.spec.importer) === group,
          );
          return typeof row?.['CUOTA_PCT'] === 'number' ? row['CUOTA_PCT'] : null;
        }),
      })),
    };
    this.chart.setOption(option, true);
    this.chart.resize();
  }
}
