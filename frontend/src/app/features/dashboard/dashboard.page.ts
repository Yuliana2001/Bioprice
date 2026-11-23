import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import {
  BrandModelMatch,
  DashboardService,
} from '../../core/dashboard/dashboard.service';
import { BrandModelChartComponent } from './brand-model-chart.component';
import { AnalyticsChartComponent, AnalyticsChartSpec } from './analytics-chart.component';

interface ChartGroup {
  category: string;
  rows: BrandModelMatch[];
}

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, RouterLink, BrandModelChartComponent, AnalyticsChartComponent],
  template: `
    <header class="border-b border-slate-200 bg-white px-5 py-4">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <a routerLink="/app/dashboard" class="text-xl font-bold text-[#0B1736]">
          BioPrice <span class="text-[#008f85]">BI</span>
        </a>
        <button type="button" class="text-sm font-semibold text-slate-700 underline" (click)="signOut()">
          Cerrar sesión
        </button>
      </div>
    </header>
    <div class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col bg-[#f8fafc] md:flex-row">
      <aside class="border-b border-slate-200 bg-white p-5 md:w-56 md:border-b-0 md:border-r">
        <nav aria-label="Navegación de la plataforma" class="flex flex-wrap gap-2 md:flex-col">
          <a routerLink="/app/dashboard" aria-current="page" class="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
            Dashboard
          </a>
          @if (auth.currentUser()?.role === 'ADMIN') {
            <a routerLink="/app/administracion/usuarios" class="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Administración de usuarios
            </a>
          }
        </nav>
      </aside>
      <main id="contenido" class="min-w-0 flex-1 p-5 sm:p-8">
        <p class="text-sm font-medium text-slate-600">Bienvenido/a, {{ auth.currentUser()?.name }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight text-[#0B1736]">Dashboard de BioPrice BI</h1>
        @if (actionError()) {
          <p class="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ actionError() }}</p>
        }
        <section class="mt-8" aria-label="Tendencia de la TRM">
          <app-analytics-chart [spec]="trmChart" />
        </section>
        <section class="mt-8" aria-labelledby="general-title">
          <h2 id="general-title" class="mb-4 text-xl font-semibold text-[#0B1736]">Resumen general de equipos biomédicos</h2>
          <app-analytics-chart [spec]="distributionChart" />
        </section>
        <section class="mt-8" aria-labelledby="invima-title">
          <h2 id="invima-title" class="mb-4 text-xl font-semibold text-[#0B1736]">Registros INVIMA y coincidencias DIAN–INVIMA</h2>
          <app-analytics-chart [spec]="invimaChart" />
        </section>
        <section class="mt-8" aria-labelledby="chart-title">
          <h2 id="chart-title" class="text-xl font-semibold text-[#0B1736]">
            Análisis de marcas y modelos coincidentes
          </h2>
          <p class="mt-2 text-sm leading-6 text-slate-600">
            Coincidencias DIAN–INVIMA del notebook, hasta 15 marcas y productos por categoría.
          </p>
          @if (periodStart() && periodEnd()) {
            <p class="mt-2 text-sm text-slate-500">
              Período DIAN: {{ periodStart() | date: 'dd/MM/yyyy' }} – {{ periodEnd() | date: 'dd/MM/yyyy' }}
            </p>
          }
          @if (generatedAt()) {
            <p class="mt-2 text-sm text-slate-500">
              Resultados exportados: {{ generatedAt() | date: 'dd/MM/yyyy HH:mm' }}
            </p>
          }
          @if (state() === 'loading') {
            <p class="mt-6 rounded-xl bg-white p-5 text-slate-600" role="status">Cargando resultados…</p>
          } @else if (state() === 'missing') {
            <p class="mt-6 rounded-xl bg-white p-5 text-slate-600" role="status">
              El archivo de resultados todavía no está disponible. Debe exportarse desde Colab y sincronizarse.
            </p>
          } @else if (state() === 'error') {
            <div class="mt-6 rounded-xl bg-red-50 p-5 text-red-800" role="alert">
              <p>No se pudieron cargar los resultados. Verifica el archivo o intenta nuevamente.</p>
              <button type="button" class="mt-3 text-sm font-semibold underline" (click)="loadData()">Reintentar</button>
            </div>
          } @else if (groups().length === 0) {
            <p class="mt-6 rounded-xl bg-white p-5 text-slate-600" role="status">
              No hay coincidencias en los resultados exportados.
            </p>
          } @else {
            <div class="mt-6 grid gap-4 lg:grid-cols-2">
              @for (group of groups(); track group.category) {
                <app-brand-model-chart [category]="group.category" [rows]="group.rows" />
              }
            </div>
          }
        </section>
        <section class="mt-8" aria-labelledby="prices-title">
          <h2 id="prices-title" class="mb-4 text-xl font-semibold text-[#0B1736]">Análisis histórico de precios</h2>
          <div class="grid gap-4 xl:grid-cols-2">
            @for (spec of priceCharts; track spec.id) { <app-analytics-chart [spec]="spec" /> }
          </div>
          <p class="mt-3 text-sm text-slate-600">La distribución de precio de Streamlit aún no está exportada.</p>
        </section>
        <section class="mt-8" aria-labelledby="country-title">
          <h2 id="country-title" class="mb-4 text-xl font-semibold text-[#0B1736]">Comparación por país de origen</h2>
          <app-analytics-chart [spec]="countryChart" />
        </section>
        <section class="mt-8" aria-labelledby="importers-title">
          <h2 id="importers-title" class="mb-4 text-xl font-semibold text-[#0B1736]">Importadores y concentración del mercado</h2>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            @for (spec of importerCharts; track spec.id) {
              <app-analytics-chart [spec]="spec" [class.min-w-0]="spec.id === 'cuotas_importadores'" />
            }
          </div>
          <p class="mt-3 text-sm text-slate-600">El perfil de importadores de Streamlit aún no está exportado.</p>
        </section>
        <section class="mt-8" aria-labelledby="secop-title">
          <h2 id="secop-title" class="mb-4 text-xl font-semibold text-[#0B1736]">Contratación pública SECOP II</h2>
          <app-analytics-chart [spec]="secopChart" />
          <p class="mt-3 text-sm text-slate-600">La gráfica de valor adjudicado de Streamlit aún no está exportada.</p>
        </section>
        <section class="mt-8" aria-labelledby="quality-title">
          <h2 id="quality-title" class="text-xl font-semibold text-[#0B1736]">Calidad y ML</h2>
          <p class="mt-3 text-sm text-slate-600">La gráfica de confianza de Streamlit aún no está exportada.</p>
        </section>
      </main>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);

  protected readonly distributionChart: AnalyticsChartSpec = {
    id: 'distribucion_equipos', title: 'Distribución de equipos biomédicos',
    x: 'EQUIPO_CLASIFICADO', y: 'CANTIDAD', unit: 'registros', type: 'bar', horizontal: true,
    family: 'EQUIPO_CLASIFICADO',
  };
  protected readonly invimaChart: AnalyticsChartSpec = {
    id: 'registros_invima', title: 'Registros sanitarios INVIMA por equipo biomédico',
    x: 'EQUIPOS_RELACIONADOS', y: 'CANTIDAD', unit: 'registros sanitarios', type: 'bar',
    group: 'ESTADO_REGISTRO', family: 'EQUIPOS_RELACIONADOS',
  };
  protected readonly priceCharts: AnalyticsChartSpec[] = [
    {
      id: 'precio_mediano_anual', title: 'Precio unitario mediano (USD, sin anomalías)',
      x: 'PERIODO', y: 'mediana', unit: 'USD', type: 'line', group: 'FAMILIA',
      family: 'FAMILIA', year: 'PERIODO', logarithmic: true,
      details: ['n', 'p25', 'p75', 'VAR_PCT_MEDIANA', 'MUESTRA_PEQUENA'],
      note: 'Escala logarítmica; los períodos con menos de cinco registros son poco fiables.',
    },
    {
      id: 'variacion_mediana_anual', title: 'Variación % anual de la mediana',
      x: 'PERIODO', y: 'VAR_PCT_MEDIANA', unit: '%', type: 'bar', group: 'FAMILIA',
      family: 'FAMILIA', year: 'PERIODO', details: ['n', 'MUESTRA_PEQUENA'],
    },
  ];
  protected readonly trmChart: AnalyticsChartSpec = {
    id: 'trm_mensual_2021_2026', title: 'Tendencia mensual de la TRM',
    x: 'PERIODO', y: 'TRM_PROMEDIO_COP_USD', unit: 'COP/USD', type: 'line',
    year: 'ANIO', monthlyPeriod: true,
    note: 'Promedio mensual exportado desde el notebook; no es una tasa diaria. El eje vertical se ajusta a los datos visibles.',
  };
  protected readonly countryChart: AnalyticsChartSpec = {
    id: 'precio_pais', title: 'Precio mediano por país de origen',
    x: 'PAIS_ORIGEN', y: 'mediana', unit: 'USD', type: 'bar',
    family: 'EQUIPO_CLASIFICADO', selectFamily: true, country: 'PAIS_ORIGEN',
    colorBy: 'PRIMA_PCT_VS_FAMILIA', details: ['n', 'PRIMA_PCT_VS_FAMILIA', 'CUOTA_UNIDADES_PCT', 'MUESTRA_PEQUENA'],
    note: 'El color representa la prima porcentual frente a la mediana de la familia.',
  };

  protected readonly importerCharts: AnalyticsChartSpec[] = [
    {
      id: 'concentracion_mercado', title: 'Concentración del mercado (HHI, 0–10.000)',
      x: 'ANIO', y: 'HHI', unit: 'HHI', type: 'line', group: 'EQUIPO_CLASIFICADO',
      family: 'EQUIPO_CLASIFICADO', year: 'ANIO', details: ['TOP5_PCT', 'n_importadores'],
    },
    {
      id: 'cuotas_importadores', title: 'Evolución de cuota de valor FOB',
      x: 'ANIO', y: 'CUOTA_PCT', unit: '%', type: 'line', group: 'NOMBRE',
      family: 'FAMILIA', selectFamily: true, year: 'ANIO', importer: 'NOMBRE',
      note: 'Registros sin anomalías de precio. Top 10 por FOB acumulado en todo el período exportado; OTROS agrupa los restantes. Ausencias de importador en un año con datos se muestran como cero; años sin datos quedan vacíos. Los filtros no modifican el total de la familia.',
    },
  ];
  protected readonly secopChart: AnalyticsChartSpec = {
    id: 'contratos_secop', title: 'Valor de contratos de equipos principales (COP)',
    x: 'ANIO', y: 'sum', unit: 'COP', type: 'bar', group: 'FAMILIA_NOMBRE',
    family: 'FAMILIA_NOMBRE', year: 'ANIO', details: ['count', 'median'],
    note: 'Valor estimado del proceso o contrato; no es un precio unitario.',
  };

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly groups = signal<ChartGroup[]>([]);
  protected readonly generatedAt = signal<string | null>(null);
  protected readonly periodStart = signal<string | null>(null);
  protected readonly periodEnd = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadData();
  }

  protected loadData(): void {
    this.state.set('loading');
    this.dashboard.getBrandModelMatches().subscribe({
      next: (response) => {
        const grouped = new Map<string, BrandModelMatch[]>();
        for (const row of response.data) {
          const rows = grouped.get(row.CATEGORIA) ?? [];
          rows.push(row);
          grouped.set(row.CATEGORIA, rows);
        }
        this.groups.set(
          Array.from(grouped, ([category, rows]) => ({ category, rows })),
        );
        this.generatedAt.set(response.generated_at);
        this.periodStart.set(response.period_start);
        this.periodEnd.set(response.period_end);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          void this.router.navigateByUrl('/ingresar');
        } else {
          this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'missing' : 'error');
        }
      },
    });
  }

  protected signOut(): void {
    this.actionError.set(null);
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/ingresar'),
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401 && error.url?.endsWith('/api/auth/logout')) {
          void this.router.navigate(['/ingresar'], { queryParams: { sesion: 'no-valida' } });
        } else {
          this.actionError.set('No se pudo cerrar la sesión. Inténtalo nuevamente.');
        }
      },
    });
  }
}
