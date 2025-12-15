# Plan de Desarrollo - Santo Tomás Viewer

## ✅ Estado: Implementado

La aplicación web está lista para usar. A continuación se documenta la estructura y cómo ejecutarla.

---

## Stack técnico

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **UI**: Tailwind CSS con paleta personalizada (txakoli, sidra, pizarra)
- **Datos**: Lectura de ficheros `.jsonl` desde el servidor usando `fs`

---

## Estructura de carpetas

```
viewer/
├── app/
│   ├── layout.tsx          # Layout base con navbar y footer
│   ├── page.tsx             # Página principal (home)
│   ├── globals.css          # Estilos globales + Tailwind
│   ├── api/
│   │   └── runs/
│   │       ├── route.ts     # GET /api/runs - Lista de ejecuciones
│   │       └── [file]/
│   │           └── route.ts # GET /api/runs/[file] - Detalle
│   └── runs/
│       ├── page.tsx         # Listado de ejecuciones
│       └── [file]/
│           ├── page.tsx     # Detalle de una ejecución
│           └── not-found.tsx
├── components/
│   ├── RunList.tsx          # Tabla de ejecuciones
│   ├── TurnCard.tsx         # Card expandible por turno
│   ├── StatsCard.tsx        # Tarjeta de estadística
│   └── LoadingSpinner.tsx   # Spinner de carga
├── lib/
│   ├── types.ts             # Tipos TypeScript
│   ├── fs.ts                # Utilidades de lectura de ficheros
│   └── parseRun.ts          # Parseo de .jsonl y métricas
├── data/                    # Carpeta para ficheros .jsonl
│   └── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── postcss.config.js
```

---

## Cómo ejecutar

### 1. Instalar dependencias

```bash
cd viewer
npm install
```

### 2. Copiar ficheros de datos

Copia los ficheros `.jsonl` que quieras visualizar a la carpeta `data/`:

```bash
cp ../runs/*.jsonl ./data/
```

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

La aplicación estará disponible en http://localhost:3000

### 4. Build de producción

```bash
npm run build
npm start
```

---

## Configuración

### Variable de entorno `RUNS_DIR`

Por defecto, la aplicación lee los ficheros de `./data`. Puedes cambiar esto con la variable de entorno:

```bash
RUNS_DIR=/ruta/a/mis/runs npm run dev
```

---

## Funcionalidades implementadas

### Página de inicio (`/`)
- Descripción del proyecto
- Enlace a ejecuciones
- Cards informativas

### Listado de ejecuciones (`/runs`)
- Tabla con todas las ejecuciones disponibles
- Columnas: Modelo, Fecha, Turnos, Ingresos, Cash Final, Coste LLM, Tokens
- Click en fila → navega al detalle

### Detalle de ejecución (`/runs/[file]`)
- Resumen con métricas agregadas (6 StatsCards)
- Timeline de turnos (TurnCards expandibles)
- Cada turno muestra:
  - Badges de acciones (set_prices, place_order, etc.)
  - Métricas rápidas (ingresos, cash)
  - Grid expandible con: Demanda, Ventas, Stock, Precios
  - Alertas de demanda no cubierta
  - Entregas pendientes
  - Métricas LLM
  - Tool calls colapsables con JSON completo

---

## Próximos pasos (opcionales)

- [ ] Añadir gráficos (evolución de cash, precios)
- [ ] Filtros en el timeline (por tipo de acción)
- [ ] Comparador de ejecuciones
- [ ] Dockerización
- [ ] Tema oscuro

---

## Dockerización (futuro)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

Construir con:
```bash
docker build --platform linux/amd64 -t santo-tomas-viewer .
```





