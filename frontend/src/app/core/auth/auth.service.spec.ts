import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService, AuthUser } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const user: AuthUser = {
    id: '0c5c1478-a44a-4bf8-a765-e85858ee78d1',
    name: 'BioPrice Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    active: true,
    email_verified: true,
    created_at: '2026-03-19T00:00:00Z',
    last_login_at: '2026-03-19T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches a CSRF token before login and keeps the returned user in memory', () => {
    let responseUser: AuthUser | undefined;
    service.login('admin@example.com', 'correct-password').subscribe((value) => {
      responseUser = value;
    });

    const csrfRequest = http.expectOne('/api/auth/csrf');
    expect(csrfRequest.request.method).toBe('GET');
    csrfRequest.flush({ csrf_token: 'signed-csrf-token' });

    const loginRequest = http.expectOne('/api/auth/login');
    expect(loginRequest.request.method).toBe('POST');
    expect(loginRequest.request.headers.get('X-CSRF-Token')).toBe('signed-csrf-token');
    loginRequest.flush({ user });

    expect(responseUser).toEqual(user);
    expect(service.currentUser()).toEqual(user);
  });

  it('refreshes an expired CSRF token once before retrying a request', () => {
    let responseUser: AuthUser | undefined;
    service.login('admin@example.com', 'correct-password').subscribe((value) => {
      responseUser = value;
    });
    http.expectOne('/api/auth/csrf').flush({ csrf_token: 'expired-token' });
    http
      .expectOne('/api/auth/login')
      .flush({ detail: 'CSRF validation failed' }, { status: 403, statusText: 'Forbidden' });

    http.expectOne('/api/auth/csrf').flush({ csrf_token: 'renewed-token' });
    const retry = http.expectOne('/api/auth/login');
    expect(retry.request.headers.get('X-CSRF-Token')).toBe('renewed-token');
    retry.flush({ user });

    expect(responseUser).toEqual(user);
  });
});
