# Contribuir a NexoDesk

Gracias por tu interés 🙌. La interfaz y los mensajes están en **español de España (`es-ES`)**; mantén ese criterio en UI, seed y documentación.

## Flujo de trabajo

1. Haz un fork o crea una rama desde `main`:
   ```bash
   git checkout -b feature/mi-mejora
   ```
2. Realiza los cambios.
3. Comprueba que todo pasa antes de abrir el PR:
   ```bash
   bun run lint          # ESLint
   bun run build         # compilación de producción
   ```
4. Abre un Pull Request describiendo el *qué* y el *porqué*.

> 🤖 El **CI** (GitHub Actions, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) ejecuta `lint` + `build` automáticamente en cada push y PR sobre `main`; el PR no se acepta en rojo.

## Convención de commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/es/):

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `feat:` | nueva funcionalidad | `feat: filtro por canal en la bandeja` |
| `fix:` | corrección de bug | `fix: atajo e no enviaba CSAT` |
| `docs:` | documentación | `docs: ampliar ARQUITECTURA.md` |
| `refactor:` | reestructuración sin cambios de comportamiento | `refactor: extraer motor de búsqueda` |
| `chore:` | tareas de mantenimiento | `chore: actualizar dependencias` |

## Estilo del código

- **TypeScript estricto**; evita `any` innecesarios.
- Componentes de UI con **shadcn/ui + Tailwind**; no introduzcas librerías de estilos alternativas.
- El dominio vive en `src/lib/` (constantes, routing, búsqueda, IA): mantén la lógica fuera de los componentes.
- Los estados y prioridades se manejan con las constantes de `src/lib/constants.ts` — nunca con strings sueltos.

## Base de datos

- El schema de Prisma es la fuente de verdad: tras cambiarlo ejecuta `npm run db:push`.
- Si añades modelos o campos, actualiza el seed (`prisma/seed.ts`) y `docs/ARQUITECTURA.md`.

## Reportar bugs

Abre un *issue* con: pasos para reproducir, comportamiento esperado vs. observado y capturas si aplica. Si afecta al enrutamiento Zero-Touch, incluye el texto del ticket que lo dispara.
