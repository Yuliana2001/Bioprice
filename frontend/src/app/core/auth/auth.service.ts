import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';

export type UserRole = 'ADMIN' | 'ANALISTA' | 'VISUALIZADOR';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  email_verified: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface UserPage {
  items: AuthUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: string;
  occurred_at: string;
  details: Record<string, unknown>;
}

export interface AuditEventPage {
  items: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

interface AuthResponse {
  user: AuthUser;
}

interface CsrfResponse {
  csrf_token: string;
}

interface MessageResponse {
  message: string;
}

interface RegistrationStatusResponse {
  registration_available: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly currentUser = signal<AuthUser | null>(null);
  private csrfToken: string | null = null;

  loadCurrentUser(): Observable<AuthUser | null> {
    return this.http.get<AuthUser>('/api/auth/me').pipe(
      tap((user) => this.currentUser.set(user)),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.currentUser.set(null);
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }

  registrationStatus(): Observable<boolean> {
    return this.http
      .get<RegistrationStatusResponse>('/api/auth/registration-status')
      .pipe(map((response) => response.registration_available));
  }

  register(name: string, email: string, password: string): Observable<AuthUser> {
    return this.withCsrf((token) =>
      this.http.post<AuthResponse>(
        '/api/auth/register',
        { name, email, password },
        { headers: this.csrfHeaders(token) },
      ),
    ).pipe(
      map((response) => response.user),
      tap((user) => this.currentUser.set(user)),
    );
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.withCsrf((token) =>
      this.http.post<AuthResponse>(
        '/api/auth/login',
        { email, password },
        { headers: this.csrfHeaders(token) },
      ),
    ).pipe(
      map((response) => response.user),
      tap((user) => this.currentUser.set(user)),
    );
  }

  logout(): Observable<MessageResponse> {
    return this.withCsrf((token) =>
      this.http.post<MessageResponse>(
        '/api/auth/logout',
        {},
        { headers: this.csrfHeaders(token) },
      ).pipe(
        tap({
          error: (error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status === 401) {
              this.currentUser.set(null);
              this.csrfToken = null;
            }
          },
        }),
      ),
    ).pipe(
      tap(() => {
        this.currentUser.set(null);
        this.csrfToken = null;
      }),
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<MessageResponse> {
    return this.withCsrf((token) =>
      this.http.post<MessageResponse>(
        '/api/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { headers: this.csrfHeaders(token) },
      ),
    ).pipe(
      tap(() => {
        this.currentUser.set(null);
        this.csrfToken = null;
      }),
    );
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.withCsrf((token) =>
      this.http.post<MessageResponse>(
        '/api/auth/forgot-password',
        { email },
        { headers: this.csrfHeaders(token) },
      ),
    );
  }

  resetPassword(token: string, newPassword: string): Observable<MessageResponse> {
    return this.withCsrf((csrfToken) =>
      this.http.post<MessageResponse>(
        '/api/auth/reset-password',
        { token, new_password: newPassword },
        { headers: this.csrfHeaders(csrfToken) },
      ),
    ).pipe(
      tap(() => {
        this.currentUser.set(null);
        this.csrfToken = null;
      }),
    );
  }

  listUsers(limit: number, offset: number): Observable<UserPage> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http.get<UserPage>('/api/admin/users', { params });
  }

  createUser(input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }): Observable<AuthUser> {
    return this.withCsrf((token) =>
      this.http.post<AuthUser>('/api/admin/users', input, {
        headers: this.csrfHeaders(token),
      }),
    );
  }

  updateUser(
    userId: string,
    changes: { role?: UserRole; active?: boolean },
  ): Observable<AuthUser> {
    return this.withCsrf((token) =>
      this.http.patch<AuthUser>(`/api/admin/users/${userId}`, changes, {
        headers: this.csrfHeaders(token),
      }),
    );
  }

  revokeUserSessions(userId: string): Observable<{ revoked_count: number }> {
    return this.withCsrf((token) =>
      this.http.post<{ revoked_count: number }>(
        `/api/admin/users/${userId}/revoke-sessions`,
        {},
        { headers: this.csrfHeaders(token) },
      ),
    );
  }

  listAuditEvents(limit: number, offset: number): Observable<AuditEventPage> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http.get<AuditEventPage>('/api/admin/audit', { params });
  }

  private csrfHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ 'X-CSRF-Token': token });
  }

  private fetchCsrfToken(): Observable<string> {
    if (this.csrfToken) {
      return of(this.csrfToken);
    }

    return this.http.get<CsrfResponse>('/api/auth/csrf').pipe(
      map((response) => response.csrf_token),
      tap((token) => (this.csrfToken = token)),
    );
  }

  private withCsrf<T>(request: (token: string) => Observable<T>): Observable<T> {
    return this.fetchCsrfToken().pipe(
      switchMap(request),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 403) {
          this.csrfToken = null;
          return this.fetchCsrfToken().pipe(switchMap(request));
        }
        return throwError(() => error);
      }),
    );
  }
}
