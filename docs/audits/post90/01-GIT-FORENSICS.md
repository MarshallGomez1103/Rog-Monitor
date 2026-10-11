# 01 · Forense de Git

Fecha de la auditoría: 2026-10-10 (America/Bogota). Todo lo de abajo es **OBSERVADO** con comandos de solo lectura. No se hizo fetch, commit, reset, stash ni push.

## Entorno
| Campo | Valor |
|---|---|
| SO / kernel | Bazzite (Fedora 44 base), `Linux 7.2.8-ogc5.1.fc44.x86_64`, x86_64 |
| Python | 3.14.7 (`rich` instalado en `~/.local`, sitio de usuario) |
| Node | v22.22.3; Electron local 42.11.12 (`desktop/node_modules`) |
| Hardware | i7-13650HX (20 hilos), RTX 4060 Laptop, 47 GiB RAM (según `BASELINE.md` y snapshot) |
| Repo | `~/MyFiles/Dev/Rog-Monitor` |

## Estado del repositorio
| Campo | Valor | Comando |
|---|---|---|
| Rama | `master` | `git status --short --branch` |
| HEAD | `7d49333` docs(changelog): SMART cache, usage series and translations in 21.0.0 | `git log -1` |
| Upstream | `origin/master` = `fbfee52` (v20.0.0, 2026-08-12 14:33) | `git branch -vv` |
| Remoto | `origin https://github.com/MarshallGomez1103/Rog-Monitor.git` (sin credenciales en la URL) | `git remote -v` |
| Divergencia | **54 commits por delante, 0 por detrás** (según la última copia local de `origin/master`; no se hizo fetch) | `git rev-list --left-right --count origin/master...HEAD` → `0 54` |
| Working tree | **limpio** (solo archivos ignorados) | `git status --short` vacío |
| Stash | 0 entradas | `git stash list` |
| Tags | ninguno (v20 ni v21 están etiquetadas) | `git tag` |
| Ramas locales | solo `master` | `git branch -vv` |
| Worktrees | solo el principal (los worktrees de agentes ya se limpiaron) | `git worktree list` |
| `git diff --check fbfee52 HEAD` | sin errores de espacios | rc=0 |

### Archivos ignorados relevantes (no versionados)
`.gitignore:29-30` ignora `docs/agent-work/` y `ROG_MONITOR_PLAN_MAESTRO_IA.md`. Es la decisión D5 del agente anterior. **Consecuencia:** el plan y toda la evidencia de checkpoints (`STATUS.md`, `CP-*.md`, `BASELINE.md`) solo existen en este disco. Si se pierde la carpeta local, no queda rastro en Git de qué checkpoint cerró qué commit, salvo los mensajes de commit. `docs/HANDOFF.md` también está ignorado.

## Base y alcance del trabajo
- **Base del plan:** `fbfee52` = `merge-base origin/master HEAD`. Coincide con el SHA que declara `docs/agent-work/STATUS.md`. Es verificable.
- **Ventana temporal:** los 54 commits van de 2026-10-10 17:55:39 a 23:13:24 (-0500), unas 5 h 18 min.
- **Tamaño:** `git diff --shortstat fbfee52 HEAD` → **124 archivos, +11 744 / −1 598 líneas**. 51 archivos añadidos, 73 modificados, 0 borrados.
- **Distribución por directorio** (`--dirstat=files`): src/rog_monitor 17.7 %, scripts 14.5 %, tests 12.9 %, desktop/renderer 11.2 %, renderer/styles 6.4 %, desktop/test 5.6 %, desktop 5.6 %, docs/adr 4 %, docs 4 %, fixtures /proc ~6.4 %, systemd 3.2 %.

## Los 54 commits
- **34 commits con contenido y 20 merges** (`--no-ff` de worktrees de agentes Sonnet). **Ningún commit vacío**: se comprobó con `git diff-tree` en cada commit que no es merge.
- **Autoría:** los 54 están firmados como "Marshall Gomez" con el email institucional del propietario (valor no impreso). Hay 55 líneas `Co-Authored-By: Claude …` en los mensajes. **El autor de Git es el propietario, pero el código lo escribieron agentes.** Conviene saberlo para la revisión humana.
- **No hay 90 commits para 90 checkpoints.** La relación es N:M: un merge cubre rangos (p. ej. `CP-6.02..6.05`, `CP-7.05..7.10`) y algunos commits no citan ningún CP (`96e99d8`, `616cf00`, `1e89ecb`, `2701aaa`, `32b3cbb`). La matriz está en `02-CHECKPOINTS-90-TRACEABILITY.md`.

Lista completa con fecha y asunto: `evidencia/commits-locales.txt`. Con `--stat`: `evidencia/commits-locales-stat.txt`.

### Agrupación por tanda (según los mensajes de merge)
| Tanda | Merge | Commits | CP declarados |
|---|---|---|---|
| S2 hotfix TUI | 6f0200a | 4a65b87, 7348ece | CP-4.01..4.04 |
| fixes sueltos | – | 2701aaa (minimizar), 32b3cbb (eventos TUI) | – |
| S6 renderer | f70e013 | 60910be | BACKLOG 17, 19 |
| S1 medición | – | 446fcf1 | CP-0.06 |
| S4 robustez | 39e7074 | 303b145, 77bf246 | BACKLOG 11, 13, 14 |
| S8 contrato | 39d26f3 | c229e56 | CP-2.02-2.04, 2.09 |
| S3 frontera root | e9740da | 531ec9e | CP-0.03, 1.04, 1.05, 1.07 |
| S7 perf backend | c6b15a6 | 89d4719 | CP-2.06, 2.08 |
| S9 TUI F4 | c342ab3 | a34df01 | CP-4.05-4.08, 4.10 |
| S10 métricas | c2090f2 | 44f1706 | CP-3.01-3.08, 3.10 |
| S13 diseño | 40341ab | bdb2a6a, 1e89ecb | F5 |
| S12 renderer | 4f097d8 | ed7151f, 4791866, 616cf00 | F5 + CI |
| S11 cierre F1 | dfadbb8 | 858023a, 824be80 | CP-1.06, 1.08, 1.10 |
| fix VRAM | – | 96e99d8 | – |
| S16 eventos | 2a764a3 | 0765fd5 | CP-6.02..6.05 |
| S14 benchmarks | d81da73 | 4262a1d, d2b78f0 | CP-7.05..7.10 |
| S15 Guardián 2.0 | 2f6a09f | 74fc4ff | CP-6.06..6.09 |
| S17 e2e / S18 docs | 8f53335, e7cdf05 | 602c280, 0439655 | CP-8.04, 8.08, 8.09 |
| release | – | 1b0bff9, 500c7d9 | CP-8.10 (parcial) |
| S21 i18n | 6712b55 | 6110015 | – |
| S20 series | 09342a2 | acaa388 | CP-3.03, 3.05 |
| S19 SMART | f172f18 | c4bb0d6 | CP-3.09, 4.09 |
| S22 deflake | ab9b9aa | 217b69a | – |
| changelog | – | 7d49333 | – |

## Commits que tocan instalación o privilegios
Salen de `git log fbfee52..HEAD -- install.sh uninstall.sh scripts/install-system.sh scripts/rog-ctl.sh scripts/rog-py.sh systemd desktop/priv.js scripts/rog-thermal-guardian.sh scripts/rog-monitor-safe-mode.sh`:
- `531ec9e` fix(security): root nunca ejecuta ni importa archivos del usuario (ADR-001). **Cambia dónde ejecuta root**: crea /usr/local/libexec/rog-monitor y /usr/local/lib/rog-monitor.
- `858023a` fix(security): valida entradas de poder/ventiladores y endurece lecturas root y unidades.
- `824be80` fix(security): desinstalación completa, rechazo de un asusd del usuario, docs de recuperación.
- `74fc4ff` feat(guardian): Guardián 2.0 (escrituras de hardware, simulación, restauración).
- `1b0bff9` docs + URL de la unidad del guardián.

Los cinco cambian código que corre como root. Hoy el propietario tiene instalada la versión 21.0.0 de estos helpers. Se verificó en la sesión anterior: root:root, VERSION 21.0.0 y `rog-profile-sync` activo. **No se re-ejecutó nada privilegiado en esta auditoría.**

## Secretos y datos personales
- `git log -p fbfee52..HEAD` filtrado por `api_key|secret|token|passw|BEGIN … PRIVATE|ghp_|sk-ant|AKIA`. **Ningún secreto encontrado.** Las coincidencias son texto de documentación ("password prompt", "design tokens") y un test de rutas maliciosas (`/dev/../etc/passwd` como entrada inválida en `desktop/test`).
- **Dato personal en metadatos:** el email institucional del autor aparece en los 54 commits. Ya estaba en el historial público anterior, así que no es nuevo. No se reproduce aquí.
- `tests/fixtures/` incluye `/proc` saneado (CPU, meminfo, diskstats) y un snapshot NDJSON saneado (commit `c229e56`). La revisión rápida no encontró hostname ni usuario. **No probado exhaustivamente.**

## Regresiones o cambios inesperados
- No hay borrados de archivos (0 `D` en `--name-status`).
- **Suite completa: 162 tests OK con el entorno correcto** (ver 11). Con `HOME` aislado sin `PYTHONUSERBASE`, 11 tests fallan porque `rich` vive en el sitio de usuario. Es un artefacto del entorno, no del código, pero muestra que **no hay entorno de dependencias reproducible** (sin venv ni lock de Python).
- El CI modificado (`4791866`, `602c280`) **nunca corrió en GitHub**: nada se ha subido. Su verde es teórico.

## Hallazgos
| ID | Severidad | Estado | Componente | Archivo:línea | Commit(s) | Evidencia/comando | Resultado | Impacto | Recomendación | Prueba de aceptación |
|---|---|---|---|---|---|---|---|---|---|---|
| GIT-01 | P1 | verificado | Trazabilidad | `.gitignore:29-30` | 7348ece | `git check-ignore -v docs/agent-work ROG_MONITOR_PLAN_MAESTRO_IA.md` | El plan y la evidencia de los 90 CP no están versionados | Si se pierde el disco, desaparece la trazabilidad; AEVA solo la ve si va en el ZIP | Decidir: versionar `docs/agent-work/` en una rama `audit/` o archivarlo junto al tag | `git ls-files docs/agent-work` no vacío, o archivo de evidencia adjunto al tag v21 |
| GIT-02 | P1 | verificado | Publicación | – | 54 commits | `git rev-list --count origin/master..HEAD` = 54 | 11.7k líneas sin CI remoto ni revisión humana | Se sube un salto grande de golpe | Push a una rama `release/v21` con PR, no directo a master | El CI de GitHub en verde sobre la rama del PR |
| GIT-03 | P2 | verificado | Release | – | 500c7d9 | `git tag` vacío | v21.0.0 declarada en VERSION/CHANGELOG sin tag | No hay punto de reversión nombrado | Etiquetar v20.0.0 en fbfee52 (retroactivo) y v21.0.0 tras validar | `git tag` lista ambas |
| GIT-04 | P2 | verificado | Autoría | – | todos | `git log --format=%an` | Commits de agentes firmados con la identidad del propietario (el trailer Co-Authored-By sí está) | Revisión humana ambigua | Aceptable si el propietario lo asume; dejarlo explícito en el PR | Descripción del PR lo indica |
| GIT-05 | P3 | verificado | Entorno de test | `requirements.txt:1` | – | unittest con `HOME` aislado → 11 fallos por `No module named 'rich'` | Sin venv ni lock de Python | Resultados que dependen de la máquina | Documentar `python3 -m venv .venv && pip install -r requirements.txt` en CONTRIBUTING | Suite verde en un venv limpio |
