---
name: login-coordinator
description: Crea e integra un login funcional con frontend, backend, persistencia de usuarios y sesiones; coordina los subagentes especializados.
---

# Skill principal: crear un login

## Propósito

Cuando el usuario invoque esta skill para crear un login, crea e integra la función completa en el proyecto: frontend, API backend, persistencia real de usuarios en la base de datos, sesiones y cómo ejecutarlo. No te detengas en un plan, una maqueta ni una simulación en cliente.

## Delegación obligatoria

Al invocarse para crear o cambiar el login, usa los tres subagentes de este proyecto, definidos en `.codex/agents/`:

- `login-frontend`: pantalla y flujo de registro, inicio, sesión activa y salida; estados y accesibilidad.
- `login-backend`: endpoints, validación, hash de contraseña, sesiones, errores y configuración de origen.
- `login-database`: esquema, restricciones e índices; persistencia del usuario y revocación de sesiones.

Da a cada subagente un encargo concreto y límites de archivos claros. Pide al de base de datos que acuerde el esquema con backend; pasa ese contrato y el contrato HTTP al frontend. Haz que trabajen en archivos o partes independientes; si hay solapamiento, asigna la integración al agente principal. Espera sus resultados y resuelve conflictos antes de considerar completa la tarea. Si Codex no ofrece herramientas de subagentes en la sesión, avanza tú mismo con esos tres perfiles como lista de responsabilidades y explica brevemente esa limitación.

## Implementación

1. Inspecciona el proyecto y reutiliza su stack, rutas, base de datos, convenciones e instrucciones existentes. En este repositorio, la aplicación existente usa Node.js y SQLite; mejora e integra esa aplicación en lugar de crear una segunda.
2. Implementa registro e inicio de sesión reales conectados a la API. Guarda los datos necesarios del usuario y un hash seguro con sal; nunca guardes ni devuelvas la contraseña en claro.
3. Crea y valida la sesión en backend con cookie segura para el entorno, incluye consulta de sesión y cierre de sesión. El frontend debe llamar a la API y reflejar estados de error, carga y éxito. No guardes contraseñas ni tokens de sesión en localStorage.
4. Mantén frontend y backend ejecutables en puertos separados para desarrollo; configura CORS/origen y documenta un único comando para iniciar ambos, además de cómo detenerlos. No inventes credenciales de demo.
5. Termina la implementación, inicia los servicios si el entorno lo permite y da instrucciones concretas para registrar un usuario y volver a iniciar sesión. Si algo bloquea la ejecución, informa del bloqueo y deja el código listo.

## Seguridad y alcance

Valida los datos en servidor; usa consultas parametrizadas, unicidad de correo, errores genéricos al autenticar, expiración y revocación de sesión. No expongas secretos ni guardes contraseñas en cliente, base de datos o registros. Distingue el desarrollo local de una publicación en internet, que requiere HTTPS y controles adicionales. Conserva el resto de la aplicación y limita los cambios al login y su integración.
