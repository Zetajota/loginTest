const API_URL = 'http://localhost:3001/api';
const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}

async function loadProfile() {
  // El perfil muestra los datos de la sesión validada por la API.
  try {
    const { user } = await api('/me');
    if (!user) {
      window.location.replace('/#login');
      return;
    }
    $('#profile-name').textContent = user.name;
    $('#profile-email').textContent = user.email;
    $('#profile-avatar').textContent = user.name.trim().charAt(0).toLocaleUpperCase('es');
  } catch {
    window.location.replace('/#login');
  }
}

$('#profile-logout').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await api('/logout', { method: 'POST', body: '{}' });
    window.location.replace('/#login');
  } catch (error) {
    $('#profile-message').textContent = error.message;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});

loadProfile();
