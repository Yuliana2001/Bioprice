Aquí se guardan las copias locales de los resultados exportados desde Colab.
No se deben guardar los registros originales ni datasets grandes en Git.

Para sincronizar los archivos disponibles y el manifiesto desde Drive, ejecuta desde la raíz:

```powershell
.\scripts\sincronizar_resultados.ps1
```

El script no copia los Parquet originales de `_PARQUET` y conserva los resultados anteriores
cuando una exportación figura como no disponible. El dashboard muestra los agregados de las
gráficas del notebook que se hayan exportado; las visualizaciones de Streamlit siguen pendientes.
La TRM mensual incluye un filtro por año; si el Parquet original no contiene fecha
de exportación, el dashboard muestra que no está disponible.
Consulta [la guía de integración](../../docs/integracion_notebook.md).
