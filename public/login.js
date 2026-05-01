const form = document.getElementById('login-form');
const errorEl = document.getElementById('error');
const button = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  button.disabled = true;

  const fd = new FormData(form);
  const body = {
    firstname: (fd.get('firstname') || '').toString(),
    lastname: (fd.get('lastname') || '').toString(),
    password: (fd.get('password') || '').toString(),
  };

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      errorEl.textContent = data.error || 'Sign in failed';
      errorEl.hidden = false;
      button.disabled = false;
      return;
    }

    window.location.href = '/lookup.html';
  } catch (err) {
    errorEl.textContent = 'Network error — please try again.';
    errorEl.hidden = false;
    button.disabled = false;
  }
});
