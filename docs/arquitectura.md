# Arquitectura inicial

## Componentes y límites

```text
Notebook y módulos analíticos en Colab
                |
       exportación manual
                v
    data/analytics/ (copias locales)
                |
         consultas FastAPI
                v
             Angular

PostgreSQL <-> FastAPI: exclusivamente identidad y seguridad
```

- **Colab** conserva el procesamiento científico. El backend no importa ni ejecuta el notebook.
- **FastAPI** expone HTTP, configuración y acceso acotado a datos preprocesados; los repositorios e integraciones mantienen separado el acceso a datos de las rutas.
- **Angular** consume solamente la API local. El proxy de desarrollo permite llamar `/api` sin exponer direcciones de Colab o Drive al navegador.
- **PostgreSQL** se reserva para usuarios, roles, sesiones y auditoría. No almacena los registros aduaneros.
- **Autenticación** usa Argon2id y sesiones opacas del lado del servidor; los tokens se almacenan como hashes. Las operaciones que cambian estado requieren protección CSRF, y la administración está restringida a `ADMIN` en FastAPI.
- **Sincronización**: inicialmente manual, copiando resultados exportados a `data/analytics/`. El servidor no descarga archivos en el arranque.

## Restricciones de ejecución

- No se necesita Docker Desktop ni una sesión Colab para arrancar frontend y API.
- FastAPI se ejecuta con un proceso en desarrollo; el pool SQLAlchemy usa tres conexiones y como máximo una adicional.
- El acceso a PostgreSQL es diferido y el endpoint de salud no conecta a la base ni carga datos analíticos.
- Los límites iniciales previstos para DuckDB son 1 GB y 2 hilos; son configurables y todavía no hay consultas DuckDB implementadas.
- Las consultas futuras deberán seleccionar columnas, paginar y evitar cargar conjuntos completos en Pandas.

## Estado por fases

La estructura actual implementa la configuración inicial, la landing y página institucional, autenticación/sesiones, administración de usuarios y un dashboard protegido. `GET /api/health` sigue sin depender de PostgreSQL. El primer gráfico del dashboard consume únicamente el resumen Parquet exportado de Colab; si falta el archivo se muestra un estado explícito. No se incluyen datos ficticios.
