# 14 · Validación local y gates de publicación (SIN PUBLICAR)

Checklist ordenada. Cada gate se cumple con su evidencia, y no se pasa al siguiente sin la del anterior. **Nadie hace `git push` hasta el gate 9, y ese push lo hace el propietario.**

Estado al cerrar esta auditoría: ☑ hecho y verificado aquí · ☐ pendiente · ◐ parcial.

## Gate 1 · Working tree documentado y sin pérdidas
- ☑ `git status --short --branch` → `## master...origin/master [ahead 54]`, sin cambios.
- ☑ Stash vacío y sin worktrees colgados.
- ☐ **Respaldo antes de cualquier operación de publicación:** `git bundle create ~/rog-monitor-v21-$(date +%F).bundle --all`. Es reversible y no toca el repo.
- ☐ Archivar `docs/agent-work/` y el plan, que hoy solo están en disco: copia fechada fuera del repo o rama `audit/agent-work` (decisión en 16).

## Gate 2 · Diferencias con el remoto revisadas
- ☐ `git fetch origin` **solo lectura** (no se hizo en la auditoría) y volver a contar con `git rev-list --left-right --count origin/master...HEAD`. Si `origin` avanzó, no hacer rebase a ciegas: abrir PR y resolver allí.
- ☑ Diferencia conocida contra el `origin/master` local: 54 commits, 124 archivos, +11 744/−1 598.

## Gate 3 · Commits peligrosos auditados por un humano
Revisar el diff completo de estos commits, que tocan código que corre como root:
- ☐ `531ec9e` frontera root (libexec/lib, `rog-py.sh -I`, `rog-ctl.sh`, `priv.js`).
- ☐ `858023a` validación de entradas y hardening de unidades.
- ☐ `824be80` uninstall completo y asusd.
- ☐ `74fc4ff` Guardián 2.0 (`hw_write`, restauración).

Comando: `git show --stat <sha>` y `git show <sha> -- scripts systemd desktop/priv.js`.

- ☑ Secret scan del diff base..HEAD: sin secretos (informe 01).

## Gate 4 · Tests, builds y smoke en verde
| Check | Estado | Evidencia |
|---|---|---|
| `python3 -m py_compile src/rog_monitor/*.py` | ☑ | rc=0 |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (en un entorno con `rich`) | ☑ 162 OK | `evidencia/test-unittest-2.log` |
| `node --test desktop/test/*.test.js` | ☑ 46 OK | `evidencia/test-nodetest-glob.log` |
| `node scripts/validate-i18n.mjs` | ☑ | 1009 claves × 8 |
| `bash -n` de todos los scripts | ☑ | rc=0 |
| `node scripts/e2e-smoke.mjs` | ☑ 29/29 | `evidencia/test-e2e.log`, captura |
| `electron-builder --linux dir` | ☐ no ejecutado aquí (escribe `desktop/dist`) | solo en CI |
| `install-system.sh --dry-run` | ◐ cubierto por `test_install_dryrun.py` (21 OK); no se ejecutó a mano | – |
| Suite en un venv limpio | ☐ | GIT-05 |

## Gate 5 · Validación local por el propietario (manual)
Ver también `docs/agent-work/checkpoints/CP-8.10.md` y `PENDIENTE-MARSHALL.md`, aunque tienen cifras obsoletas.

- ☐ **TUI:** `PYTHONPATH=src python3 -m rog_monitor`. Clic, rueda y teclas basura durante 30 s: la pantalla no salta. `e` exporta un CSV: a los 80 s debe tener unas 80 filas. Pasos completos en 08 §5.
- ☐ **Escritorio:** minimizar 1 min y restaurar, y comprobar que los datos siguen vivos (`2701aaa`).
- ☐ **Overlay** en KDE Wayland y sobre un juego a pantalla completa: ¿se ve?, ¿respeta la esquina?, ¿click-through? Repetir en sesión X11 si existe. **Si falla, quitar "KDE/Wayland" de `roadmap.js` y del README.**
- ☐ **Ventiladores:** guardar una curva y reiniciar el servicio `rog-profile-sync`.
- ☐ **SMART:** leer un disco (pkexec, prompt esperado).
- ☐ **Batería:** aplicar 80 % desde la app (activa `rog-battery-limit`) y reiniciar para confirmar que persiste.
- ☐ **Guardián:** activarlo en **Simulación** una sesión de juego y leer las decisiones en el journal. No pasar a modo real hasta resolver GRD-01/02/03.

## Gate 6 · Instalador en un entorno aislado
- ☐ VM Bazzite/Fedora Atomic con snapshot previo (GNOME Boxes o virt-manager):
  1. `sudo bash scripts/install-system.sh`
  2. Reinicio, y confirmar que llega a la pantalla de login.
  3. `sudo bash scripts/rog-monitor-safe-mode.sh disable`
  4. Reinicio.
  5. `uninstall`
  6. Reinicio.
  7. Comprobar que no queda nada en `/usr/local/libexec/rog-monitor`, `/etc/systemd/system/rog-*`, `/etc/udev/rules.d` ni `/etc/tmpfiles.d`.
- ☐ Recuperación desde TTY (CP-1.09) siguiendo `docs/RECOVERY.md` **corregido** (INS-doc del informe 12).
- **Nunca en el host sin un permiso explícito y separado.**

## Gate 7 · Documentación al día (solo cuando se autorice implementar)
- ☐ `docs/roadmap.md` todavía dice "through v20".
- ☐ `roadmap.js` sin v21.
- ☐ README del overlay según el resultado del gate 5.
- ☐ Capturas nuevas.
- ☐ Matriz de compatibilidad con lo realmente probado.

## Gate 8 · Inspección final de diffs y secretos
- ☐ `git log -p origin/master..HEAD | grep -n -i -E "api[_-]?key|secret|token|BEGIN .*PRIVATE|ghp_|sk-"`, revisado a mano.
- ☐ Confirmar que los fixtures (`tests/fixtures/`) no tienen hostname, usuario ni seriales de disco.

## Gate 9 · Plan de push (lo ejecuta el propietario)
1. Respaldo: el bundle del gate 1.
2. `git switch -c release/v21` y `git push -u origin release/v21`. **No** empujar directo a `master`.
3. Abrir un PR `release/v21 → master` con este paquete de auditoría resumido (sin el ZIP privado).
4. Esperar el CI de GitHub (primer run del CI nuevo, que incluye e2e con xvfb) y corregir lo que falle en la rama.
5. Revisión humana de los commits del gate 3.
6. Merge, con `--no-ff` o squash según preferencia, y tag `v21.0.0` en el merge. Opcional: tag retroactivo `v20.0.0` en `fbfee52`.
7. **Reversión:** si algo sale mal tras el merge, `git revert -m 1 <merge>` en una rama nueva, nunca `push --force`. En el host: `sudo bash /usr/local/libexec/rog-monitor/rog-monitor-safe-mode.sh disable` y reinstalar v20 desde el tag.
