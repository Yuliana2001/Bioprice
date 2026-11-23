import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { getInstanceByDom } from 'echarts/core';
import { of, throwError } from 'rxjs';

import { routes } from '../../app.routes';
import { AuthService, AuthUser } from '../../core/auth/auth.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { LoginPage } from '../auth/login.page';
import { RegisterPage } from '../auth/register.page';
import { DashboardPage } from './dashboard.page';

describe('Dashboard navigation', () => {
  const user: AuthUser = {
    id: '1',
    name: 'Usuario de prueba',
    email: 'usuario@example.com',
    role: 'VISUALIZADOR',
    active: true,
    email_verified: true,
    created_at: '2026-01-01T00:00:00Z',
    last_login_at: null,
  };
  let auth: jasmine.SpyObj<AuthService>;
  let dashboard: jasmine.SpyObj<DashboardService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', [
      'loadCurrentUser',
      'login',
      'register',
      'logout',
    ]);
    Object.defineProperty(auth, 'currentUser', { value: signal<AuthUser | null>(null) });
    auth.loadCurrentUser.and.returnValue(of(null));
    dashboard = jasmine.createSpyObj<DashboardService>('DashboardService', [
      'getBrandModelMatches',
      'getAnalyticsChart',
    ]);
    dashboard.getBrandModelMatches.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    dashboard.getAnalyticsChart.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: DashboardService, useValue: dashboard },
      ],
    });
  });

  function setAuthenticated(): void {
    auth.currentUser.set(user);
    auth.loadCurrentUser.and.returnValue(of(user));
  }

  function fill(page: HTMLElement, selector: string, value: string): void {
    const input = page.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('redirects an unauthenticated dashboard visitor to login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/app/dashboard', LoginPage);
    expect(TestBed.inject(Router).url).toContain('/ingresar');
    expect(dashboard.getBrandModelMatches).not.toHaveBeenCalled();
  });

  it('validates the session and opens the dashboard after login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ingresar', LoginPage);
    auth.login.and.callFake(() => {
      setAuthenticated();
      return of(user);
    });
    const page = harness.routeNativeElement as HTMLElement;
    fill(page, '#login-email', 'usuario@example.com');
    fill(page, '#login-password', 'secure-password-123');
    page.querySelector('form')?.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/app/dashboard');
    expect(auth.loadCurrentUser).toHaveBeenCalledTimes(2);
    expect(harness.routeNativeElement?.textContent).toContain('archivo de resultados todavía no');
  });

  it('validates the session and opens the dashboard after registration', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/registro', RegisterPage);
    auth.register.and.callFake(() => {
      setAuthenticated();
      return of(user);
    });
    const page = harness.routeNativeElement as HTMLElement;
    fill(page, '#register-email', 'usuario@example.com');
    fill(page, '#register-password', 'secure-password-123');
    fill(page, '#register-confirmation', 'secure-password-123');
    page.querySelector('form')?.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/app/dashboard');
    expect(auth.loadCurrentUser).toHaveBeenCalled();
  });

  it('redirects an authenticated visitor away from login', async () => {
    setAuthenticated();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ingresar');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/app/dashboard');
  });

  it('shows exported categories and the original values', async () => {
    setAuthenticated();
    dashboard.getBrandModelMatches.and.returnValue(
      of({
        data: [
          {
            CATEGORIA: 'ECOGRAFO',
            MARCA_MODELO: 'Marca de prueba | Modelo de prueba',
            COINCIDENCIAS: 4,
            REGISTROS_INVIMA: 2,
          },
        ],
        generated_at: '2026-01-02T03:04:05Z',
        period_start: '2026-01-01',
        period_end: '2026-08-31',
      }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/app/dashboard', DashboardPage);
    const page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain('ECOGRAFO');
    expect(page.textContent).toContain('Período DIAN');
    expect(page.querySelector('app-brand-model-chart canvas')).not.toBeNull();
  });

  it('distinguishes an empty export from an unavailable file', async () => {
    setAuthenticated();
    dashboard.getBrandModelMatches.and.returnValue(
      of({ data: [], generated_at: null, period_start: null, period_end: null }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/app/dashboard', DashboardPage);
    expect(harness.routeNativeElement?.textContent).toContain('No hay coincidencias');
  });

  it('shows an error when the export cannot be read', async () => {
    setAuthenticated();
    dashboard.getBrandModelMatches.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/app/dashboard', DashboardPage);
    expect(harness.routeNativeElement?.textContent).toContain('No se pudieron cargar los resultados');
  });

  it('shows available charts even when SECOP is unavailable', async () => {
    setAuthenticated();
    dashboard.getAnalyticsChart.and.callFake((id) =>
      id === 'distribucion_equipos'
        ? of({
            data: [{ EQUIPO_CLASIFICADO: 'ECOGRAFO', CANTIDAD: 3 }],
            generated_at: '2026-01-02T03:04:05Z',
          })
        : throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/app/dashboard', DashboardPage);
    const page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain('Distribución de equipos biomédicos');
    expect(page.textContent).toContain('Contratación pública SECOP II');
    expect(page.textContent).toContain('Resultado no disponible en la última exportación');
    expect(page.querySelector('app-analytics-chart canvas')).not.toBeNull();
  });

  it('orders monthly TRM values and does not invent an export date', async () => {
    setAuthenticated();
    dashboard.getAnalyticsChart.and.callFake((id) =>
      id === 'trm_mensual_2021_2026'
        ? of({
            data: [
              { PERIODO: '2025-03-01T00:00:00', ANIO: 2025, MES: 3, TRM_PROMEDIO_COP_USD: 4100 },
              { PERIODO: '2024-12-01T00:00:00', ANIO: 2024, MES: 12, TRM_PROMEDIO_COP_USD: 3900 },
              { PERIODO: '2025-02-01T00:00:00', ANIO: 2025, MES: 2, TRM_PROMEDIO_COP_USD: 4200 },
            ],
            generated_at: null,
          })
        : throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/app/dashboard', DashboardPage);
    const page = harness.routeNativeElement as HTMLElement;
    const graph = page.querySelector('[aria-label="Tendencia mensual de la TRM"]') as HTMLDivElement;
    const chart = getInstanceByDom(graph)!;
    const option = chart.getOption() as {
      xAxis: { data: string[] }[];
      series: { data: number[] }[];
    };
    expect(option.xAxis[0].data).toEqual(['2024-12-01T00:00:00', '2025-02-01T00:00:00', '2025-03-01T00:00:00']);
    expect(option.series[0].data).toEqual([3900, 4200, 4100]);
    const figure = graph.closest('figure')!;
    expect(page.querySelector('main figure')).toBe(figure);
    expect(figure.textContent).toContain('Fecha de exportación no disponible');
    expect(figure.textContent).toContain('2025-03');
    const year = figure.querySelector('select')!;
    year.value = '2024';
    year.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(figure.textContent).toContain('2024-12');
    expect((chart.getOption() as { series: { data: number[] }[] }).series[0].data).toEqual([3900]);
  });

  it('shows independent FOB shares, gaps and zeroes without changing denominators on filtering', async () => {
    setAuthenticated();
    dashboard.getAnalyticsChart.and.callFake((id) =>
      id === 'cuotas_importadores'
        ? of({
            data: [
              { FAMILIA: 'A', ANIO: 2021, NOMBRE: 'UNO', CUOTA_PCT: 40, _fob: 40 },
              { FAMILIA: 'A', ANIO: 2021, NOMBRE: 'OTROS', CUOTA_PCT: 60, _fob: 60 },
              { FAMILIA: 'A', ANIO: 2024, NOMBRE: 'OTROS', CUOTA_PCT: 100, _fob: 200 },
            ],
            generated_at: '2026-01-02T03:04:05Z',
          })
        : throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/app/dashboard', DashboardPage);
    const page = harness.routeNativeElement as HTMLElement;
    const graph = page.querySelector('[aria-label="Evolución de cuota de valor FOB"]') as HTMLDivElement;
    const figure = graph.closest('figure') as HTMLElement;
    const chart = getInstanceByDom(graph)!;
    const options = () => chart.getOption() as {
      xAxis: { data: string[] }[];
      yAxis: { min: number; max: number }[];
      series: { name: string; type: string; data: (number | null)[]; areaStyle?: object; stack?: string }[];
      tooltip: { formatter: (point: { dataIndex: number; seriesName: string }) => string }[];
    };
    expect(options().xAxis[0].data).toEqual(['2021', '2022', '2023', '2024']);
    expect(options().yAxis[0].min).toBe(0);
    expect(options().yAxis[0].max).toBe(100);
    const uno = options().series.find((series) => series.name === 'UNO')!;
    expect(uno.type).toBe('line');
    expect(uno.data).toEqual([40, null, null, 0]);
    expect(uno.areaStyle).toBeUndefined();
    expect(uno.stack).toBeUndefined();
    expect(options().tooltip[0].formatter({ dataIndex: 0, seriesName: 'UNO' }))
      .toContain('FOB: 40 USD');

    const selects = figure.querySelectorAll('select');
    selects[1].value = '2021';
    selects[1].dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(options().series.find((series) => series.name === 'UNO')?.type).toBe('bar');
    expect(options().series.find((series) => series.name === 'UNO')?.data).toEqual([40]);
    selects[2].value = 'UNO';
    selects[2].dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(options().series.length).toBe(1);
    expect(options().series[0].data).toEqual([40]);
    selects[1].value = '2024';
    selects[1].dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(options().series[0].data).toEqual([0]);
  });
});
