import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface BrandModelMatch {
  CATEGORIA: string;
  MARCA_MODELO: string;
  COINCIDENCIAS: number;
  REGISTROS_INVIMA: number;
}

export interface BrandModelMatchesResponse {
  data: BrandModelMatch[];
  generated_at: string | null;
  period_start: string | null;
  period_end: string | null;
}

export type AnalyticsChartId =
  | 'distribucion_equipos'
  | 'registros_invima'
  | 'precio_mediano_anual'
  | 'variacion_mediana_anual'
  | 'precio_pais'
  | 'concentracion_mercado'
  | 'cuotas_importadores'
  | 'contratos_secop'
  | 'trm_mensual_2021_2026';

export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsRow = Record<string, AnalyticsValue>;

export interface AnalyticsChartResponse {
  data: AnalyticsRow[];
  generated_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  getBrandModelMatches(): Observable<BrandModelMatchesResponse> {
    return this.http.get<BrandModelMatchesResponse>(
      '/api/dashboard/marcas-modelos-coincidentes',
    );
  }

  getAnalyticsChart(id: AnalyticsChartId): Observable<AnalyticsChartResponse> {
    return this.http.get<AnalyticsChartResponse>(`/api/dashboard/graficas/${id}`);
  }
}
