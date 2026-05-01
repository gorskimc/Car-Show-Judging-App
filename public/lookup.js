const entryEl = document.getElementById('entry');
const confirmationEl = document.getElementById('confirmation');
const lookupForm = document.getElementById('lookup-form');
const lookupError = document.getElementById('lookup-error');
const carDetailsEl = document.getElementById('car-details');
const startJudgingBtn = document.getElementById('start-judging');
const tryAgainBtn = document.getElementById('try-again');
const logoutBtn = document.getElementById('logout');
const judgeNameEl = document.getElementById('judge-name');
const participantInput = document.getElementById('participant-input');

let currentCar = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showEntry() {
  entryEl.hidden = false;
  confirmationEl.hidden = true;
  participantInput.value = '';
  lookupError.hidden = true;
  participantInput.focus();
}

function showConfirmation(car) {
  currentCar = car;
  entryEl.hidden = true;
  confirmationEl.hidden = false;

  const rows = [
    ['Reg #', `#${car.participant}`],
    ['Owner', `${car.firstname || ''} ${car.lastname || ''}`.trim()],
    ['Year', car.year],
    ['Make', car.make],
    ['Model', car.model],
    ['Body', car.bodytype],
    ['Color', car.color],
    ['Generation', car.generation],
  ];

  carDetailsEl.innerHTML = rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('');
}

async function init() {
  const r = await fetch('/api/auth/me');
  if (!r.ok) {
    window.location.href = '/';
    return;
  }
  const me = await r.json();
  judgeNameEl.textContent = `${me.firstname} ${me.lastname}`;
  showEntry();
}

lookupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  lookupError.hidden = true;
  const participant = participantInput.value.trim();

  if (!/^\d+$/.test(participant)) {
    lookupError.textContent = 'Please enter a registration number.';
    lookupError.hidden = false;
    return;
  }

  try {
    const r = await fetch(`/api/registrations/${encodeURIComponent(participant)}`);
    if (r.status === 401) {
      window.location.href = '/';
      return;
    }
    if (r.status === 404) {
      lookupError.textContent = `No paid + checked-in car for #${participant}. Try again?`;
      lookupError.hidden = false;
      return;
    }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      lookupError.textContent = data.error || 'Lookup failed.';
      lookupError.hidden = false;
      return;
    }
    const car = await r.json();
    showConfirmation(car);
  } catch (err) {
    lookupError.textContent = 'Network error — please try again.';
    lookupError.hidden = false;
  }
});

tryAgainBtn.addEventListener('click', showEntry);

startJudgingBtn.addEventListener('click', async () => {
  startJudgingBtn.disabled = true;
  try {
    const r = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant: currentCar.participant }),
    });
    if (r.status === 401) {
      window.location.href = '/';
      return;
    }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      alert(data.error || 'Could not start judging.');
      startJudgingBtn.disabled = false;
      return;
    }
    const { session } = await r.json();
    window.location.href = `/judging.html?session=${session.id}`;
  } catch (err) {
    alert('Network error — please try again.');
    startJudgingBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

init();
