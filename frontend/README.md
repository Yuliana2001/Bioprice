# Frontend de BioPrice BI

Aplicación Angular standalone con landing pública, autenticación y dashboard.

## Desarrollo

```powershell
npm ci
npm start
```

El servidor usa `proxy.conf.json` para reenviar `/api` a FastAPI en `http://127.0.0.1:8000`,
incluso al ejecutarlo con `ng serve`. Reinicia el servidor de desarrollo después de cambiar
la configuración del proxy o `angular.json`.

## Validación

```powershell
npm run build
npm test -- --watch=false
```
