import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingHarness } from '@angular/router/testing';

import { App } from './app';
import { routes } from './app.routes';
import { AboutPage } from './features/about/about.page';
import { LandingPage } from './features/landing/landing.page';
import { LoginPage } from './features/auth/login.page';
import { RegisterPage } from './features/auth/register.page';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the public landing page without analytics data', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/', LandingPage);

    const pageText = harness.routeNativeElement?.textContent ?? '';
    expect(pageText).toContain('Inteligencia de precios');
    expect(pageText).toContain('No contiene precios ni resultados');
  });

  it('should provide the institutional page', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/quienes-somos', AboutPage);

    const pageText = harness.routeNativeElement?.textContent ?? '';
    expect(pageText).toContain('Misión');
    expect(pageText).toContain('Visión');
    expect(pageText).toContain('pendiente de definir');
  });

  it('should provide a real login form', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ingresar', LoginPage);

    expect(harness.routeNativeElement?.textContent).toContain('Ingresar a BioPrice BI');
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
  });

  it('shows registration links and the three-field form without calling the backend', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ingresar', LoginPage);
    expect(harness.routeNativeElement?.textContent).toContain('¿No tienes una cuenta?');
    expect(harness.routeNativeElement?.textContent).toContain('Registrarse');

    await harness.navigateByUrl('/registro', RegisterPage);
    const page = harness.routeNativeElement;
    expect(page?.querySelectorAll('form input').length).toBe(3);
    expect(page?.querySelector('#register-email')).not.toBeNull();
    expect(page?.querySelector('#register-password')).not.toBeNull();
    expect(page?.querySelector('#register-confirmation')).not.toBeNull();
    TestBed.inject(HttpTestingController).expectNone('/api/auth/registration-status');
  });

  it('reports registration failures without hiding the form', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/registro', RegisterPage);
    const page = harness.routeNativeElement as HTMLElement;
    for (const [selector, value] of [
      ['#register-email', 'admin@example.com'],
      ['#register-password', 'secure-password-123'],
      ['#register-confirmation', 'secure-password-123'],
    ]) {
      const input = page.querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    page.querySelector('form')?.dispatchEvent(new Event('submit'));
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/auth/csrf').flush({ csrf_token: 'csrf-token' });
    const request = http.expectOne('/api/auth/register');
    expect(request.request.body.name).toBe('admin@example.com');
    request.flush({ detail: 'Servicio no disponible' }, { status: 503, statusText: 'Unavailable' });
    harness.detectChanges();
    expect(page.textContent).toContain('Servicio no disponible');
    expect(page.querySelectorAll('form input').length).toBe(3);
    http.verify();
  });
});
