# Autenticación y administración

## Alcance

PostgreSQL almacena exclusivamente cuentas, roles, sesiones, tokens de recuperación y eventos de
auditoría. Los datos analíticos siguen fuera de la base de usuarios. Las contraseñas se derivan con
Argon2id; las cookies de sesión contienen un token aleatorio opaco y la base de datos conserva solo
su hash SHA-256.

## Configuración

El archivo activo es `<raíz del repositorio>/.env`; se encuentra fuera de `backend/` y no existe hasta
que lo copies desde `.env.example`. [backend/app/core/config.py](../backend/app/core/config.py) carga
ese archivo con el prefijo `BIOPRICE_`. No se usa una configuración de SQLite ni una base remota ficticia.

Completa los valores de `.env` antes de iniciar la API:

- `BIOPRICE_DATABASE_URL`: conexión PostgreSQL.
- `BIOPRICE_AUTH_SECRET_KEY`: secreto aleatorio de al menos 32 caracteres. Genéralo con
  `uv run python -c "import secrets; print(secrets.token_urlsafe(48))"`. No lo compartas ni lo
  guardes en el repositorio.
- `BIOPRICE_CORS_ORIGINS`: lista JSON con los orígenes frontend exactos; no uses `*`.
- `BIOPRICE_SESSION_TTL_MINUTES`: expiración de sesión, entre 15 minutos y 24 horas.
- `BIOPRICE_PASSWORD_RESET_TTL_MINUTES`: duración del token de recuperación.
- `BIOPRICE_FRONTEND_BASE_URL`: origen usado para crear enlaces de recuperación.

La cookie `bioprice_session` es `HttpOnly`, `SameSite=Lax`, tiene alcance de ruta `/` y se marca
`Secure` cuando `BIOPRICE_ENVIRONMENT=production`. La cookie `bioprice_csrf` no es `HttpOnly`:
contiene el valor firmado que el cliente debe enviar también en `X-CSRF-Token` en cada operación
que cambia estado. Los tokens CSRF se mantienen en memoria en el cliente; no se guardan en
`localStorage` ni `sessionStorage`.

En producción, FastAPI redirige el tráfico HTTP a HTTPS. Si TLS termina en un proxy, configura
Uvicorn para confiar únicamente en las direcciones de ese proxy y asegúrate de que este reenvíe
`X-Forwarded-Proto` de forma confiable. El envío SMTP en producción también requiere STARTTLS.

## Primer administrador

Después de aplicar las migraciones, el formulario `/registro` permite crear la primera cuenta
administradora solo cuando no existen usuarios. El correo se utiliza como nombre visible
(limitado a 120 caracteres). El formulario se muestra aunque la API no esté disponible, pero
crear una cuenta requiere que la API y la base estén funcionando. El servidor rechaza registros
posteriores; un administrador debe crear las demás cuentas.

Como alternativa, ejecuta desde `backend/`:

```powershell
uv run alembic upgrade head
uv run python -m app.cli create-admin
```

El comando solicita nombre, correo y contraseña de forma interactiva, no admite contraseñas en
argumentos y se detiene si ya existe un administrador. No hay cuentas ni credenciales iniciales
ficticias.

## Recuperación de contraseña

La recuperación requiere SMTP configurado: `BIOPRICE_SMTP_HOST`, `BIOPRICE_SMTP_PORT`,
`BIOPRICE_SMTP_SENDER` y, si el servidor exige autenticación, `BIOPRICE_SMTP_USERNAME` junto con
`BIOPRICE_SMTP_PASSWORD`. STARTTLS se activa con `BIOPRICE_SMTP_STARTTLS=true`. Las credenciales
SMTP son secretos de entorno y nunca se registran.

Sin los datos necesarios, `POST /api/auth/forgot-password` responde `503` de forma explícita. Con
SMTP configurado, la respuesta no revela si el correo existe; los tokens son aleatorios, de un
solo uso, expiran según `BIOPRICE_PASSWORD_RESET_TTL_MINUTES` y solo se conserva su hash. Los
errores de entrega se registran sin incluir correo, token, contraseña ni contenido SMTP.

## Endpoints

- `GET /api/auth/csrf`: entrega un token CSRF firmado y establece su cookie.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `POST /api/auth/change-password`.
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.
- `GET /api/admin/users`: listado paginado, solo `ADMIN`.
- `POST /api/admin/users`: alta de cuenta, solo `ADMIN`.
- `PATCH /api/admin/users/{id}`: asigna rol o activa/desactiva; protege al último administrador
  activo y revoca sus sesiones al cambiar rol o desactivar.
- `POST /api/admin/users/{id}/revoke-sessions`: revoca sesiones, solo `ADMIN`.
- `GET /api/admin/audit`: eventos paginados, solo `ADMIN`.

Si el cierre de sesión responde `401` porque la sesión ya no es válida, la
interfaz vuelve a la pantalla de ingreso y lo informa. Otros errores de cierre
se muestran sin afirmar que la sesión se haya cerrado.

Los cambios administrativos, los inicios/cierres de sesión y los cambios de contraseña generan
eventos de auditoría sin registrar credenciales ni tokens. Los intentos fallidos limitan por IP y
correo dentro del proceso, y la cuenta se bloquea temporalmente después de cinco contraseñas
incorrectas. Para despliegues con varios procesos, configura además límites compartidos en el
proxy/gateway perimetral; la limitación en memoria no se comparte entre procesos.

## Verificación

Las pruebas de autenticación usan SQLite en memoria para no requerir un servicio externo. En esta
implementación, la migración está preparada para PostgreSQL; la aplicación efectiva en un servidor
PostgreSQL debe verificarse en el entorno de despliegue.
