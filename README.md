# Login Nimbo

Aplicación local de registro e inicio de sesión con frontend y backend en puertos separados. El backend crea `data/users.sqlite` automáticamente. Cada usuario se persiste en SQLite con una contraseña derivada mediante PBKDF2; la contraseña original no se guarda. La sesión usa una cookie `HttpOnly`.

## Requisitos

Node.js 22.13 o posterior. No requiere paquetes npm adicionales.

## Ejecutar

```powershell
npm.cmd run dev
```

Abre <http://localhost:5173>. El frontend corre en el puerto `5173` y la API con SQLite en `3001`. Detén ambos procesos con `Ctrl+C` en la terminal. Para iniciarlos por separado usa `npm.cmd run frontend` y `npm.cmd run backend` en terminales distintas.

La API ofrece `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/me` y `GET /api/health`. El puerto de cada servidor se puede cambiar con `FRONTEND_PORT` y `BACKEND_PORT`; la URL de la API del frontend se configura al inicio en `app.js`.

## Pruebas y Git hooks

Ejecuta las cinco pruebas de integración de la API con `npm.cmd test` en PowerShell o `npm test` en macOS/Linux. El workflow `.github/workflows/test.yml` las ejecuta en cada push y pull request.

Para activar el hook local que bloquea commits si alguna prueba falla, ejecuta una vez `git config core.hooksPath .githooks`. El hook usa `node --test` y no requiere dependencias adicionales.

Codex carga el hook de agente desde `.codex/hooks.json`. Antes de usarlo, revisa y confía la definición nueva con `/hooks`. Cuando el agente vaya a ejecutar un comando `git push`, valida las cinco pruebas y la sintaxis de `profile.js`; si alguna falla, bloquea el push y muestra el resultado.

La autenticación está pensada para desarrollo local. Para exponerla en internet se necesita HTTPS, protección de fuerza bruta, política de despliegue y configuración segura de cookies y orígenes.

## Agentes y skill

Los perfiles de los tres subagentes están en `.codex/agents/`. Codex puede cargarlos como agentes personalizados del proyecto; `.codex/config.toml` habilita la delegación y permite hasta tres hilos de agentes a la vez.

La skill principal está en `.agents/skills/login-coordinator/SKILL.md`. Al invocarla, instruye a Codex a delegar las partes de interfaz, API y persistencia a esos tres agentes, integrar el resultado y dejar el login ejecutable.

### Usar la skill en Codex

Abre este proyecto en Codex y escribe en el chat:

```text
$login-coordinator Crea o termina el login funcional en este proyecto. Usa los tres subagentes, integra los cambios y déjame los servidores funcionando.
```

También puedes usar `$login-coordinator` para pedir cambios concretos, por ejemplo: `agrega recuperación de contraseña al login`. La skill vive en el proyecto, por lo que Codex debe tener abierta esta carpeta y sus instrucciones habilitadas. Si no aparece en el selector, abre de nuevo la carpeta o reinicia la sesión de Codex para que vuelva a descubrir la skill y los perfiles de agentes.
