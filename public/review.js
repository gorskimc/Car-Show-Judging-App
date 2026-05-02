const STATE = {
  judge: null,
  session: null,
  rubric: null,
  car: null,
  deductions: [],
  submitting: false,
};

const els = {
  loading: document.getElementById('loading'),
  review: document.getElementById('review'),
  done: document.getElementById('done'),
  errorState: document.getElementById('error-state'),
  errorMsg: document.getElementById('error-msg'),
  backBtn: document.getElementById('back-btn'),

  judgeName: document.getElementById('judge-name'),
  logout: document.getElementById('logout'),

  carSummary: document.getElementById('car-summary'),
  sectionCards: document.getElementById('section-cards'),
  totalScore: document.getElementById('total-score'),
  totalMax: document.getElementById('total-max'),

  judgeNotes: document.getElementById('judge-notes'),
  submitStatus: document.getElementById('submit-status'),
  editMoreBtn: document.getElementById('edit-more-btn'),
  submitBtn: document.getElementById('submit-btn'),

  doneTotal: document.getElementById('done-total'),
  doneTime: document.getElementById('done-time'),
  doneCar: document.getElementById('done-car'),
  nextCarBtn: document.getElementById('next-car-btn'),
};

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}
function quarterRound(n) {
  return Math.round(n * 4) / 4;
}

function showSection(name) {
  els.loading.hidden = name !== 'loading';
  els.review.hidden = name !== 'review';
  els.done.hidden = name !== 'done';
  els.errorState.hidden = name !== 'error';
}

function showError(msg) {
  showSection('error');
  els.errorMsg.textContent = msg;
}

async function init() {
  els.backBtn.addEventListener('click', () => {
    window.location.href = '/lookup.html';
  });
  els.editMoreBtn.addEventListener('click', () => {
    window.location.href = `/judging.html?session=${STATE.session.id}`;
  });
  els.submitBtn.addEventListener('click', submit);
  els.nextCarBtn.addEventListener('click', () => {
    window.location.href = '/lookup.html';
  });
  els.logout.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });

  const params = new URLSearchParams(window.location.search);
  const sessionId = Number(params.get('session'));
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    showError('Missing or invalid session id in URL.');
    return;
  }

  const meRes = await fetch('/api/auth/me');
  if (!meRes.ok) {
    window.location.href = '/';
    return;
  }
  STATE.judge = await meRes.json();
  els.judgeName.textContent = `${STATE.judge.firstname} ${STATE.judge.lastname}`;

  const [rubricRes, sessionRes] = await Promise.all([
    fetch('/api/rubric'),
    fetch(`/api/sessions/${sessionId}`),
  ]);
  if (!rubricRes.ok) return showError('Could not load rubric.');
  if (!sessionRes.ok) {
    if (sessionRes.status === 403) return showError('This session belongs to another judge.');
    if (sessionRes.status === 404) return showError('Session not found.');
    return showError('Could not load session.');
  }

  STATE.rubric = await rubricRes.json();
  const sessionData = await sessionRes.json();
  STATE.session = sessionData.session;
  STATE.deductions = sessionData.deductions;

  const carRes = await fetch(`/api/registrations/${STATE.session.participant}`);
  if (carRes.ok) STATE.car = await carRes.json();

  if (STATE.session.is_complete) {
    renderDone();
    showSection('done');
    return;
  }

  renderReview();
  showSection('review');
}

function renderReview() {
  // Car summary
  if (STATE.car) {
    const c = STATE.car;
    els.carSummary.innerHTML =
      `<div class="car-summary-name">#${c.participant} — ${escapeHtml(`${c.firstname || ''} ${c.lastname || ''}`.trim())}</div>` +
      `<div class="muted">${escapeHtml(`${c.year || ''} ${c.make || ''} ${c.model || ''}`.trim())}` +
      (c.color ? ` · ${escapeHtml(c.color)}` : '') +
      (c.generation ? ` · ${escapeHtml(c.generation)}` : '') +
      `</div>`;
  }

  const dedByItem = new Map();
  for (const d of STATE.deductions) dedByItem.set(d.rubric_item_id, d);

  let totalScore = 0;
  let totalMax = 0;

  els.sectionCards.innerHTML = STATE.rubric.sections.map((section) => {
    let sectionDed = 0;
    const sectionMax = Number(section.max_points);

    const subsHtml = section.subsections.map((sub) => {
      let subDed = 0;
      let subMax = 0;
      const itemsHtml = sub.items.map((item) => {
        const d = dedByItem.get(item.id);
        const ded = d ? Number(d.deduction_amount) : 0;
        subDed += ded;
        sectionDed += ded;
        subMax += Number(item.max_points);
        const itemScore = quarterRound(Number(item.max_points) - ded);
        const photoCount = d && d.photos ? d.photos.length : 0;
        const photoBadge = photoCount > 0
          ? `<span class="badge photo-badge" title="${photoCount} photo${photoCount === 1 ? '' : 's'}">📷 ${photoCount}</span>`
          : '';
        const noteBadge = d && d.notes
          ? `<span class="badge note-badge" title="${escapeHtml(d.notes)}">📝</span>`
          : '';
        return `<li>
          <span class="item-name">${escapeHtml(item.name)}${photoBadge}${noteBadge}</span>
          <span class="item-score">${formatNumber(itemScore)} / ${formatNumber(item.max_points)}</span>
        </li>`;
      }).join('');
      const subScore = quarterRound(subMax - subDed);
      return `<div class="sub-block">
        <div class="sub-header">
          <span>${escapeHtml(sub.name)}</span>
          <span class="muted">${formatNumber(subScore)} / ${formatNumber(subMax)}</span>
        </div>
        <ul class="item-list">${itemsHtml}</ul>
      </div>`;
    }).join('');

    const sectionScore = quarterRound(sectionMax - sectionDed);
    totalScore += sectionScore;
    totalMax += sectionMax;

    return `<details class="section-card">
      <summary>
        <span class="section-name">${escapeHtml(section.name)}</span>
        <span class="section-score">${formatNumber(sectionScore)} / ${formatNumber(sectionMax)}</span>
      </summary>
      <div class="section-body">${subsHtml}</div>
    </details>`;
  }).join('');

  els.totalScore.textContent = formatNumber(quarterRound(totalScore));
  els.totalMax.textContent = formatNumber(totalMax);
}

async function submit() {
  if (STATE.submitting) return;
  STATE.submitting = true;
  els.submitBtn.disabled = true;
  els.editMoreBtn.disabled = true;
  els.submitStatus.hidden = false;
  els.submitStatus.textContent = 'Submitting…';
  els.submitStatus.className = 'muted save-status saving';

  try {
    const r = await fetch(`/api/sessions/${STATE.session.id}/submit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judge_notes: els.judgeNotes.value || null }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      els.submitStatus.textContent = `✗ ${data.error || 'Submit failed'}`;
      els.submitStatus.className = 'muted save-status error';
      els.submitBtn.disabled = false;
      els.editMoreBtn.disabled = false;
      STATE.submitting = false;
      return;
    }
    STATE.session = await r.json();
    renderDone();
    showSection('done');
  } catch (err) {
    els.submitStatus.textContent = '✗ Network error';
    els.submitStatus.className = 'muted save-status error';
    els.submitBtn.disabled = false;
    els.editMoreBtn.disabled = false;
    STATE.submitting = false;
  }
}

function renderDone() {
  const total = Number(STATE.session.total_score);
  els.doneTotal.textContent = formatNumber(quarterRound(total));
  if (STATE.session.submitted_at) {
    els.doneTime.textContent = new Date(STATE.session.submitted_at).toLocaleString();
  }
  if (STATE.car) {
    const c = STATE.car;
    els.doneCar.textContent =
      `#${c.participant} — ${(c.firstname || '')} ${(c.lastname || '')}`.trim() +
      `, ${(c.year || '')} ${(c.make || '')} ${(c.model || '')}`.trim();
  }
}

init();
