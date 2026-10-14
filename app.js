const API_URL = 'http://localhost:3001/api';
const $ = (selector) => document.querySelector(selector);
const loginForm = $('#login-form');
const registerForm = $('#register-form');
const loginPrompt = $('#signup-prompt');
const registerPrompt = $('#login-prompt');
const accountView = $('#account-view');
const intro = $('#intro');

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Comprueba que el backend esté iniciado e inténtalo de nuevo.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}

function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach((item) => { item.textContent = ''; });
  form.querySelectorAll('[aria-invalid="true"]').forEach((item) => item.removeAttribute('aria-invalid'));
  const message = form.querySelector('.form-message');
  if (message) {
    message.textContent = '';
    message.classList.remove('error', 'success');
  }
}

function showMessage(form, text, kind = 'error') {
  const message = form.querySelector('.form-message');
  message.textContent = text;
  message.classList.toggle('error', kind === 'error');
  message.classList.toggle('success', kind === 'success');
}

function showMode(mode) {
  const registering = mode === 'register';
  loginForm.classList.toggle('hidden', registering);
  registerForm.classList.toggle('hidden', !registering);
  loginPrompt.classList.toggle('hidden', registering);
  registerPrompt.classList.toggle('hidden', !registering);
  accountView.classList.add('hidden');
  clearErrors(loginForm);
  clearErrors(registerForm);
  intro.querySelector('h1').textContent = registering ? 'Crea tu cuenta.' : 'Qué bueno verte.';
  intro.querySelector('.subtitle').textContent = registering
    ? 'Regístrate para empezar.'
    : 'Inicia sesión para continuar donde lo dejaste.';
  history.replaceState(null, '', registering ? '#registro' : '#login');
  (registering ? $('#register-name') : $('#email')).focus();
}

function showAccount(user) {
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  loginPrompt.classList.add('hidden');
  registerPrompt.classList.add('hidden');
  accountView.classList.remove('hidden');
  intro.querySelector('h1').textContent = '¡Bienvenido!';
  intro.querySelector('.subtitle').textContent = 'Has iniciado sesión correctamente.';
  $('#account-greeting').textContent = user.name;
  history.replaceState(null, '', '#cuenta');
  $('#logout-button').focus();
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setBusy(form, busy, label) {
  const button = form.querySelector('[type="submit"]');
  if (!button.dataset.label) button.dataset.label = button.querySelector('span').textContent;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.querySelector('span').textContent = busy ? label : button.dataset.label;
}

$('#show-register').addEventListener('click', (event) => { event.preventDefault(); showMode('register'); });
$('#show-login').addEventListener('click', (event) => { event.preventDefault(); showMode('login'); });

document.querySelectorAll('.show-password').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Ocultar' : 'Mostrar';
    button.setAttribute('aria-label', `${show ? 'Ocultar' : 'Mostrar'} contraseña`);
    button.setAttribute('aria-pressed', String(show));
    input.focus();
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(loginForm);
  const emailInput = $('#email');
  const passwordInput = $('#password');
  const email = emailInput.value.trim();
  let valid = true;
  if (!validateEmail(email)) {
    $('#email-error').textContent = 'Escribe un correo electrónico válido.';
    emailInput.setAttribute('aria-invalid', 'true');
    valid = false;
  }
  if (!passwordInput.value) {
    $('#password-error').textContent = 'Escribe tu contraseña.';
    passwordInput.setAttribute('aria-invalid', 'true');
    valid = false;
  }
  if (!valid) {
    loginForm.querySelector('[aria-invalid="true"]').focus();
    return;
  }
  setBusy(loginForm, true, 'Verificando…');
  try {
    const { user } = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: passwordInput.value, remember: $('#remember').checked }),
    });
    loginForm.reset();
    showAccount(user);
  } catch (error) {
    showMessage(loginForm, error.message);
  } finally {
    setBusy(loginForm, false);
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(registerForm);
  const name = $('#register-name');
  const email = $('#register-email');
  const password = $('#register-password');
  const checks = [
    [name, $('#name-error'), !name.value.trim() || name.value.trim().length > 80, 'Escribe un nombre de hasta 80 caracteres.'],
    [email, $('#register-email-error'), !validateEmail(email.value.trim()), 'Escribe un correo electrónico válido.'],
    [password, $('#register-password-error'), password.value.length < 8, 'Usa al menos 8 caracteres.'],
  ];
  let firstInvalid;
  checks.forEach(([input, error, invalid, text]) => {
    if (invalid) {
      error.textContent = text;
      input.setAttribute('aria-invalid', 'true');
      firstInvalid ||= input;
    }
  });
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }
  setBusy(registerForm, true, 'Creando cuenta…');
  try {
    const { user } = await api('/register', {
      method: 'POST',
      body: JSON.stringify({ name: name.value.trim(), email: email.value.trim(), password: password.value }),
    });
    registerForm.reset();
    showAccount(user);
  } catch (error) {
    showMessage(registerForm, error.message);
  } finally {
    setBusy(registerForm, false);
  }
});

$('#logout-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  $('#logout-message').textContent = '';
  try {
    await api('/logout', { method: 'POST', body: '{}' });
    loginForm.reset();
    showMode('login');
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    $('#logout-message').textContent = error.message;
  }
});

async function restoreSession() {
  loginForm.querySelector('[type="submit"]').disabled = true;
  try {
    const { user } = await api('/me');
    if (user) showAccount(user);
  } catch {
    // La pantalla de acceso permanece disponible si el servidor aún no responde.
  } finally {
    loginForm.querySelector('[type="submit"]').disabled = false;
  }
}

restoreSession();
