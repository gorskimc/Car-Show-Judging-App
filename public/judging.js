// Walkthrough state.
//   flatItems is a sequence of { type: 'preview' | 'item', ... } entries.
//   17 preview entries are interleaved — one before each subsection's first item.
const STATE = {
  judge: null,
  session: null,
  rubric: null,
  flatItems: [],
  totalItems: 0,
  index: 0,
  saving: false,
};

const els = {
  loading: document.getElementById('loading'),
  preview: document.getElementById('preview'),
  walkthrough: document.getElementById('walkthrough'),
  errorState: document.getElementById('error-state'),
  errorMsg: document.getElementById('error-msg'),
  backBtn: document.getElementById('back-btn'),
  judgeName: document.getElementById('judge-name'),
  logout: document.getElementById('logout'),

  progressBlock: document.getElementById('progress-block'),
  progressText: document.getElementById('progress-text'),
  progressFill: document.getElementById('progress-fill'),

  // Preview screen
  previewSection: document.getElementById('preview-section'),
  previewSubsection: document.getElementById('preview-subsection'),
  previewSummary: document.getElementById('preview-summary'),
  previewList: document.getElementById('preview-list'),
  previewPrev: document.getElementById('preview-prev'),
  previewBegin: document.getElementById('preview-begin'),

  // Walkthrough screen
  breadcrumb: document.getElementById('breadcrumb'),
  itemName: document.getElementById('item-name'),
  maxPill: document.getElementById('max-pill'),
  inputLabel: document.getElementById('input-label'),
  decBtn: document.getElementById('dec-btn'),
  incBtn: document.getElementById('inc-btn'),
  displayValue: document.getElementById('display-value'),
  quickZero: document.getElementById('quick-zero'),
  quickMax: document.getElementById('quick-max'),
  scoreReadout: document.getElementById('score-readout'),
  notes: document.getElementById('notes'),
  saveStatus: document.getElementById('save-status'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
};

// Helpers ---------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function quarterRound(n) {
  return Math.round(n * 4) / 4;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}
function getCurrent() {
  return STATE.flatItems[STATE.index];
}

function deductionToDisplayed(deduction_amount, max, mode) {
  if (mode === 'award') return quarterRound(max - deduction_amount);
  return quarterRound(deduction_amount);
}
function displayedToDeduction(displayed, max, mode) {
  if (mode === 'award') return quarterRound(max - displayed);
  return quarterRound(displayed);
}
function setSaveStatus(text, cls) {
  els.saveStatus.textContent = text;
  els.saveStatus.className = `muted save-status ${cls || ''}`.trim();
}

function showError(msg) {
  els.loading.hidden = true;
  els.preview.hidden = true;
  els.walkthrough.hidden = true;
  els.progressBlock.hidden = true;
  els.errorState.hidden = false;
  els.errorMsg.textContent = msg;
}

// Init ------------------------------------------------------------------

async function init() {
  els.backBtn.addEventListener('click', () => {
    window.location.href = '/lookup.html';
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

  if (!rubricRes.ok) {
    showError('Could not load rubric.');
    return;
  }
  if (!sessionRes.ok) {
    if (sessionRes.status === 403) showError('This session belongs to another judge.');
    else if (sessionRes.status === 404) showError('Session not found.');
    else showError('Could not load session.');
    return;
  }

  STATE.rubric = await rubricRes.json();
  const sessionData = await sessionRes.json();
  STATE.session = sessionData.session;

  if (STATE.session.is_complete) {
    showError('This session has already been submitted.');
    return;
  }

  // Build the flat list: subsection preview, then its items, then next preview, ...
  const dedByItemId = new Map();
  for (const d of sessionData.deductions) dedByItemId.set(d.rubric_item_id, d);

  let itemNumber = 0;
  for (const section of STATE.rubric.sections) {
    for (const subsection of section.subsections) {
      const items = subsection.items;
      const total_max = items.reduce((sum, i) => sum + Number(i.max_points), 0);
      STATE.flatItems.push({
        type: 'preview',
        section,
        subsection,
        items,
        total_max,
        next_item_number: itemNumber + 1,
      });
      for (const item of items) {
        const deduction = dedByItemId.get(item.id);
        if (!deduction) continue;
        itemNumber++;
        STATE.flatItems.push({
          type: 'item',
          section,
          subsection,
          item,
          deduction,
          item_number: itemNumber,
        });
      }
    }
  }
  STATE.totalItems = itemNumber;

  if (STATE.totalItems === 0) {
    showError('No rubric items to judge.');
    return;
  }

  STATE.index = 0;
  els.loading.hidden = true;
  els.progressBlock.hidden = false;
  renderCurrent();
}

// Render dispatch -------------------------------------------------------

function renderCurrent() {
  updateProgress();
  const cur = getCurrent();
  if (cur.type === 'preview') {
    renderPreview(cur);
  } else {
    renderItem(cur);
  }
  window.scrollTo(0, 0);
}

function updateProgress() {
  const total = STATE.flatItems.length;
  const fill = ((STATE.index + 1) / total) * 100;
  els.progressFill.style.width = `${fill}%`;

  const cur = getCurrent();
  if (cur.type === 'item') {
    els.progressText.textContent = `Item ${cur.item_number} of ${STATE.totalItems}`;
  } else {
    els.progressText.textContent = `Up next: item ${cur.next_item_number} of ${STATE.totalItems}`;
  }
}

function renderPreview(cur) {
  els.preview.hidden = false;
  els.walkthrough.hidden = true;
  els.errorState.hidden = true;

  els.previewSection.textContent = cur.section.name;
  els.previewSubsection.textContent = cur.subsection.name;

  const itemCount = cur.items.length;
  const noun = itemCount === 1 ? 'item' : 'items';
  els.previewSummary.textContent =
    `${itemCount} ${noun} · up to ${formatNumber(cur.total_max)} pts`;

  els.previewList.innerHTML = cur.items
    .map(
      (item, i) =>
        `<li>` +
        `<span class="num">${i + 1}.</span>` +
        `<span class="name">${escapeHtml(item.name)}</span>` +
        `<span class="pts muted">${formatNumber(item.max_points)} pts</span>` +
        `</li>`,
    )
    .join('');

  els.previewBegin.textContent = `Begin ${cur.subsection.name} →`;
  els.previewPrev.disabled = STATE.index === 0;
}

function renderItem(cur) {
  els.preview.hidden = true;
  els.walkthrough.hidden = false;
  els.errorState.hidden = true;

  const max = cur.item.max_points;
  const mode = cur.section.scoring_mode;

  els.breadcrumb.textContent = `${cur.section.name} › ${cur.subsection.name}`;
  els.itemName.textContent = cur.item.name;
  els.maxPill.textContent = `Max: ${formatNumber(max)} pts`;

  if (mode === 'award') {
    els.inputLabel.textContent = 'Bonus points to award';
    els.quickZero.textContent = 'No Bonus';
    els.quickMax.textContent = `Max Bonus (${formatNumber(max)})`;
  } else {
    els.inputLabel.textContent = 'Points to deduct';
    els.quickZero.textContent = 'Perfect (0)';
    els.quickMax.textContent = `Max Deduct (${formatNumber(max)})`;
  }

  const displayed = deductionToDisplayed(cur.deduction.deduction_amount, max, mode);
  els.displayValue.textContent = formatNumber(displayed);

  const score = quarterRound(max - cur.deduction.deduction_amount);
  els.scoreReadout.textContent = `Score: ${formatNumber(score)} / ${formatNumber(max)}`;

  els.notes.value = cur.deduction.notes || '';

  els.prevBtn.disabled = STATE.index === 0;
  els.nextBtn.textContent =
    STATE.index === STATE.flatItems.length - 1 ? 'Review →' : 'Next →';

  setSaveStatus('', '');
}

// Input handling --------------------------------------------------------

function getCurrentDisplayed() {
  const cur = getCurrent();
  return deductionToDisplayed(
    cur.deduction.deduction_amount,
    cur.item.max_points,
    cur.section.scoring_mode,
  );
}

function setDisplayed(newDisplayed) {
  const cur = getCurrent();
  if (cur.type !== 'item') return;
  const max = cur.item.max_points;
  const mode = cur.section.scoring_mode;

  newDisplayed = clamp(quarterRound(newDisplayed), 0, max);
  cur.deduction.deduction_amount = displayedToDeduction(newDisplayed, max, mode);

  els.displayValue.textContent = formatNumber(newDisplayed);
  const score = quarterRound(max - cur.deduction.deduction_amount);
  els.scoreReadout.textContent = `Score: ${formatNumber(score)} / ${formatNumber(max)}`;

  setSaveStatus('• Unsaved', 'dirty');
}

// Save-as-you-go --------------------------------------------------------

async function saveCurrentItem() {
  if (STATE.saving) return false;
  const cur = getCurrent();
  if (cur.type !== 'item') return true; // nothing to save on preview screens

  STATE.saving = true;
  setSaveStatus('Saving…', 'saving');
  cur.deduction.notes = els.notes.value || null;

  try {
    const r = await fetch(
      `/api/sessions/${STATE.session.id}/items/${cur.item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deduction_amount: cur.deduction.deduction_amount,
          notes: cur.deduction.notes,
        }),
      },
    );
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setSaveStatus(`✗ ${data.error || 'Save failed'}`, 'error');
      STATE.saving = false;
      return false;
    }
    cur.deduction = await r.json();
    setSaveStatus('Saved ✓', 'saved');
    STATE.saving = false;
    return true;
  } catch (err) {
    setSaveStatus('✗ Network error', 'error');
    STATE.saving = false;
    return false;
  }
}

// Navigation ------------------------------------------------------------

async function navigate(direction) {
  if (STATE.saving) return;
  const cur = getCurrent();
  if (cur.type === 'item') {
    const ok = await saveCurrentItem();
    if (!ok) return;
  }

  const newIndex = STATE.index + direction;
  if (newIndex < 0) return;
  if (newIndex >= STATE.flatItems.length) {
    alert('Review screen comes in Step 9. All your scores are saved.');
    return;
  }
  STATE.index = newIndex;
  renderCurrent();
}

// Wire up ---------------------------------------------------------------

els.decBtn.addEventListener('click', () => setDisplayed(getCurrentDisplayed() - 0.25));
els.incBtn.addEventListener('click', () => setDisplayed(getCurrentDisplayed() + 0.25));
els.quickZero.addEventListener('click', () => setDisplayed(0));
els.quickMax.addEventListener('click', () => setDisplayed(getCurrent().item.max_points));

els.notes.addEventListener('input', () => setSaveStatus('• Unsaved', 'dirty'));

els.prevBtn.addEventListener('click', () => navigate(-1));
els.nextBtn.addEventListener('click', () => navigate(1));
els.previewPrev.addEventListener('click', () => navigate(-1));
els.previewBegin.addEventListener('click', () => navigate(1));

els.logout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

init();
