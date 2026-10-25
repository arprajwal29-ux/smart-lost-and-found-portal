const state = { reports: [], activityReports: [], activityEmail: '', adminAuthenticated: false, kind: 'all', page: 'feed', category: 'all', search: '', compact: false, imageData: '', activeReportId: null };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const categoryClasses = { Electronics: 'electronics', 'Bottles & cups': 'bottle', 'Books & stationery': 'books', 'Cards & documents': 'cards', 'Clothing & accessories': 'clothing', Keys: 'keys' };
const categoryIcons = {
  Electronics: '<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M9 18v2m6-2v2M9 11h.01M15 11h.01"/>',
  'Bottles & cups': '<path d="M9 3h6v3l2 2v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-2V3Z"/><path d="M8 12h8"/>',
  'Books & stationery': '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z"/><path d="M5 16a2 2 0 0 1 2-2h12M9 8h6"/>',
  'Cards & documents': '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.8-2 5.2-2 6 0m3-5h3m-3 3h3"/>',
  'Clothing & accessories': '<path d="m8 5 4-2 4 2 5 3-3 4-3-2v11H9V10l-3 2-3-4 5-3Z"/>',
  Keys: '<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-4-4 2-2m-5-1 2-2"/>',
  Other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v.01M12 11v5"/>'
};

function artwork(report, small = false) {
  const category = categoryClasses[report.category] || 'other';
  const image = report.image ? `<img src="${escapeHtml(report.image)}" alt="${escapeHtml(report.name)}">` : `<svg viewBox="0 0 24 24" aria-hidden="true">${categoryIcons[report.category] || categoryIcons.Other}</svg>`;
  return `<div class="item-art art-${category}${small ? ' small-art' : ''}">${image}</div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function prettyDate(value) {
  if (!value) return 'Date unknown';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function getMatches(report) {
  return state.reports.filter(other => {
    if (report.kind === other.kind || report._id === other._id || other.status !== 'open') return false;
    let score = report.category === other.category ? 35 : 0;
    const tokens = value => new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2));
    const a = tokens(`${report.name} ${report.description}`);
    const b = tokens(`${other.name} ${other.description}`);
    score += Math.min(40, [...a].filter(word => b.has(word)).length * 14);
    const placeA = tokens(report.location), placeB = tokens(other.location);
    if ([...placeA].some(word => placeB.has(word))) score += 25;
    const gap = Math.abs(new Date(report.date) - new Date(other.date)) / 86400000;
    if (gap <= 3) score += Math.max(5, 20 - gap * 5);
    return score >= 35;
  }).map(other => {
    let score = report.category === other.category ? 35 : 0;
    const tokens = value => new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2));
    const a = tokens(`${report.name} ${report.description}`), b = tokens(`${other.name} ${other.description}`);
    score += Math.min(40, [...a].filter(word => b.has(word)).length * 14);
    if ([...tokens(report.location)].some(word => tokens(other.location).has(word))) score += 25;
    const gap = Math.abs(new Date(report.date) - new Date(other.date)) / 86400000;
    if (gap <= 3) score += Math.max(5, 20 - gap * 5);
    return { report: other, score: Math.min(99, score) };
  }).sort((a, b) => b.score - a.score);
}

function renderCard(report) {
  const match = getMatches(report)[0];
  const action = report.kind === 'found'
    ? `<button class="card-action claim-button" data-id="${escapeHtml(report._id)}">This is mine ${icon('arrow')}</button>`
    : `<button class="card-action secondary match-button" data-id="${escapeHtml(report._id)}">View matches ${icon('spark')}</button>`;
  const activity = report.activity?.[0];
  const statusText = activity ? `${activity.type === 'claim' ? 'claim ' : ''}${activity.status}` : report.status;
  const status = statusText !== 'open' ? `<span class="status-chip">${escapeHtml(statusText)}</span>` : '';
  return `<article class="report-card">
    ${artwork(report)}
    <div class="report-copy"><div class="report-meta"><span class="kind-chip ${report.kind}">${report.kind}</span><span class="category-label">${escapeHtml(report.category)}</span>${status}</div><h3>${escapeHtml(report.name)}</h3><p class="report-description">${escapeHtml(report.description || 'No extra details provided.')}</p><div class="report-facts"><span class="report-fact">${icon('pin')}<span>${escapeHtml(report.location)}</span></span><span class="report-fact">${icon('clock')}<span>${prettyDate(report.date)}</span></span></div></div>
    <div class="card-actions">${match ? `<span class="match-score">${icon('spark')} ${match.score}% match</span>` : '<span></span>'}${action}</div>
  </article>`;
}

function visibleReports() {
  const reports = state.page === 'activity' ? state.activityReports : state.reports;
  return reports.filter(report => {
    const kindOk = state.kind === 'all' || state.kind === report.kind;
    const categoryOk = state.category === 'all' || state.category === report.category;
    const query = state.search.toLowerCase();
    const textOk = !query || `${report.name} ${report.description} ${report.location} ${report.category}`.toLowerCase().includes(query);
    const matchesOk = state.page !== 'matches' || getMatches(report).length > 0;
    return kindOk && categoryOk && textOk && matchesOk;
  });
}

function renderFeed() {
  const rows = visibleReports();
  $('#report-list').innerHTML = rows.map(renderCard).join('');
  $('#report-list').classList.toggle('view-compact', state.compact);
  $('#empty-state').classList.toggle('hidden', rows.length > 0);
  $('#report-list').classList.toggle('hidden', rows.length === 0);
  $('#all-count').textContent = state.reports.length;
  if (state.page === 'activity' && rows.length === 0) {
    $('#empty-state h3').textContent = state.activityEmail ? 'No reports or claims found.' : 'Look up your activity.';
    $('#empty-state p').textContent = state.activityEmail ? 'Try the email address you used when reporting or claiming an item.' : 'Enter the email address used on your report or claim.';
  }
  $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab.dataset.kind === state.kind));
}

async function refresh() {
  try {
    const reportsUrl = state.page === 'admin' && state.adminAuthenticated ? '/api/admin/reports' : '/api/reports';
    const [reportsResponse, statsResponse] = await Promise.all([fetch(reportsUrl), fetch('/api/stats')]);
    if (reportsResponse.status === 401 && state.page === 'admin') {
      state.adminAuthenticated = false;
      renderAdmin();
      return;
    }
    if (!reportsResponse.ok || !statsResponse.ok) throw new Error('Could not load campus reports.');
    state.reports = await reportsResponse.json();
    const stats = await statsResponse.json();
    $('#stat-open').textContent = stats.lost + stats.found;
    $('#stat-found').textContent = stats.found;
    $('#stat-resolved').textContent = stats.resolved;
    $('#nav-open-count').textContent = stats.lost + stats.found;
    renderFeed();
    if (state.page === 'admin') renderAdmin();
  } catch (error) {
    showToast(error.message);
  }
}

function setPage(page) {
  state.page = page;
  const titles = { feed: 'Browse items', matches: 'Smart matches', activity: 'My activity', admin: 'Admin review' };
  const headings = { feed: ['Things find their way ', 'back.', 'One campus, one shared board. Let\'s get your things home.'], matches: ['A few details. A ', 'possible reunion.', 'Likely pairs surfaced from the campus board.'], activity: ['Your campus ', 'footprint.', 'Reports and requests submitted by the community.'], admin: ['The careful part of ', 'getting it back.', 'Review reports and verify claim requests.'] };
  $('#breadcrumb-current').textContent = titles[page];
  $('#page-title').innerHTML = `${headings[page][0]}<em>${headings[page][1]}</em>`;
  $('#page-description').textContent = headings[page][2];
  $('#feed-page').classList.toggle('hidden', page === 'admin');
  $('#admin-page').classList.toggle('hidden', page !== 'admin');
  $('#activity-search-panel').classList.toggle('hidden', page !== 'activity');
  $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  if (page === 'matches') {
    state.kind = 'all';
    $('#board-title').textContent = 'Strongest potential pairs';
  } else if (page === 'activity') {
    $('#board-title').textContent = 'Community activity';
  } else {
    $('#board-title').textContent = 'Recently reported';
  }
  renderFeed();
  if (page === 'admin') {
    renderAdmin();
    checkAdminSession();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadActivity(email) {
  const response = await fetch(`/api/activity?email=${encodeURIComponent(email)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Activity could not be loaded.');
  state.activityEmail = email;
  state.activityReports = data;
  $('#activity-summary').textContent = `${data.length} saved report${data.length === 1 ? '' : 's'} or claim records.`;
  renderFeed();
}

async function checkAdminSession() {
  try {
    const response = await fetch('/api/admin/session');
    const sessionData = await response.json();
    state.adminAuthenticated = sessionData.authenticated;
    if (state.adminAuthenticated) await refresh();
    else renderAdmin();
  } catch (error) {
    showToast(error.message);
  }
}

async function loginAdmin(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values)
  });
  const result = await response.json();
  if (!response.ok) {
    $('#admin-login-error').textContent = result.error || 'Sign-in failed.';
    return;
  }
  state.adminAuthenticated = true;
  await refresh();
}

async function logoutAdmin() {
  const response = await fetch('/api/admin/logout', { method: 'POST' });
  if (!response.ok) throw new Error('Could not sign out.');
  state.adminAuthenticated = false;
  await refresh();
}

function renderAdmin() {
  if (!state.adminAuthenticated) {
    $('#admin-page').innerHTML = `<div class="admin-login-wrap"><p class="eyebrow"><span class="eyebrow-line"></span> RESTRICTED AREA</p><h2 id="dialog-title">Admin sign in</h2><p>Sign in with your administrator account to review reports and claims.</p><form id="admin-login-form"><label for="admin-username">Username</label><input id="admin-username" name="username" required autocomplete="username"><label for="admin-password">Password</label><input id="admin-password" name="password" type="password" required autocomplete="current-password"><p class="admin-login-error" id="admin-login-error" role="alert"></p><button class="form-submit" type="submit">Sign in</button></form></div>`;
    return;
  }
  const claims = [];
  state.reports.forEach(report => (report.claims || []).forEach((claim, index) => {
    if (claim.status === 'pending') claims.push({ report, claim, index });
  }));
  const open = state.reports.filter(report => report.status === 'open').length;
  $('#admin-page').innerHTML = `<div class="admin-intro"><div><p class="section-kicker">STAFF WORKSPACE</p><h2>Review queue</h2><p>Verify claims and keep the campus board accurate.</p></div><div class="admin-intro-actions"><button class="card-action secondary" id="admin-logout">Sign out</button><button class="report-button" id="admin-new-report">${icon('plus')} Add report</button></div></div>
    <div class="admin-stats"><div class="admin-stat"><span>OPEN REPORTS</span><strong>${open}</strong></div><div class="admin-stat"><span>PENDING CLAIMS</span><strong>${claims.length}</strong></div><div class="admin-stat"><span>ALL REPORTS</span><strong>${state.reports.length}</strong></div><div class="admin-stat"><span>RETURNED</span><strong>${state.reports.filter(report => report.status !== 'open').length}</strong></div></div>
    <h3 class="admin-subtitle">Claim requests <span class="nav-count">${claims.length}</span></h3>
    ${claims.length ? claims.map(({ report, claim, index }) => `<div class="admin-claim">${artwork(report, true)}<div class="admin-claim-copy"><strong>${escapeHtml(claim.name)} claims ${escapeHtml(report.name)}</strong><p>${escapeHtml(claim.email)}${claim.note ? ` · ${escapeHtml(claim.note)}` : ''}</p></div><div class="admin-claim-actions"><button data-claim-action="rejected" data-id="${escapeHtml(report._id)}" data-index="${index}" class="reject">Decline</button><button data-claim-action="approved" data-id="${escapeHtml(report._id)}" data-index="${index}">Approve claim</button></div></div>`).join('') : '<div class="admin-empty">No claims are waiting for review.</div>'}
    <h3 class="admin-subtitle" style="margin-top:24px">Recent reports</h3>
    ${state.reports.length ? state.reports.map(report => `<div class="admin-report">${artwork(report, true)}<div class="admin-report-copy"><strong>${escapeHtml(report.name)}</strong><span>${report.kind.toUpperCase()} · ${escapeHtml(report.location)} · ${prettyDate(report.date)}</span></div><select class="status-button" data-status-id="${escapeHtml(report._id)}" aria-label="Update ${escapeHtml(report.name)} status"><option value="open" ${report.status === 'open' ? 'selected' : ''}>Open</option><option value="claimed" ${report.status === 'claimed' ? 'selected' : ''}>Claimed</option><option value="resolved" ${report.status === 'resolved' ? 'selected' : ''}>Resolved</option></select></div>`).join('') : '<div class="admin-empty">No reports have been added yet.</div>'}`;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function openDialog(content) {
  $('#dialog-content').innerHTML = content;
  $('#modal-backdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('#dialog-close').focus();
}

function closeDialog() {
  $('#modal-backdrop').classList.add('hidden');
  document.body.style.overflow = '';
  state.imageData = '';
}

function reportForm(kind = 'lost') {
  state.imageData = '';
  openDialog(`<p class="eyebrow"><span class="eyebrow-line"></span> HELP IT FIND ITS WAY</p><h2 id="dialog-title">Report an item</h2><p class="dialog-intro">A few thoughtful details can make a match much more likely.</p>
    <form id="report-form" class="form-grid"><div class="type-switch"><button type="button" data-form-kind="lost" class="${kind === 'lost' ? 'active' : ''}">I lost something</button><button type="button" data-form-kind="found" class="${kind === 'found' ? 'active' : ''}">I found something</button></div>
    <input type="hidden" name="kind" value="${kind}"><div class="form-field"><label for="reporter-name">Your name</label><input id="reporter-name" name="reporter" required maxlength="80" autocomplete="name"></div><div class="form-field"><label for="reporter-email">College email</label><input id="reporter-email" name="reporterEmail" type="email" required maxlength="120" autocomplete="email"></div><div class="form-field full"><label for="item-name">What is it called?</label><input id="item-name" name="name" required maxlength="80" placeholder="e.g. Blue water bottle"></div>
    <div class="form-field"><label for="item-category">Category</label><select id="item-category" name="category" required><option value="">Choose one</option><option>Electronics</option><option>Bottles & cups</option><option>Books & stationery</option><option>Cards & documents</option><option>Clothing & accessories</option><option>Keys</option><option>Other</option></select></div>
    <div class="form-field"><label for="item-date">Date ${kind === 'lost' ? 'lost' : 'found'}</label><input id="item-date" name="date" type="date" required max="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}"></div>
    <div class="form-field full"><label for="item-location">Where on campus?</label><input id="item-location" name="location" required maxlength="100" placeholder="Building, floor or nearby landmark"></div>
    <div class="form-field full"><label for="item-description">Description and identifying details</label><textarea id="item-description" name="description" maxlength="500" placeholder="Color, brand, stickers, initials, distinguishing marks..."></textarea></div>
    <label class="upload-area" for="item-image">${icon('upload')}<span><strong id="upload-label">Add a photo (optional)</strong><small>JPG or PNG, up to 3 MB</small></span><input id="item-image" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <button class="form-submit" type="submit">Publish report</button></form>`);
}

function claimForm(report) {
  state.activeReportId = report._id;
  openDialog(`<p class="eyebrow"><span class="eyebrow-line"></span> CLAIM AN ITEM</p><h2 id="dialog-title">Could this be yours?</h2><p class="dialog-intro">A campus staff member will review your request before sharing any contact details.</p>
    <div class="claim-summary">${artwork(report, true)}<div><strong>${escapeHtml(report.name)}</strong><span>${escapeHtml(report.location)} · ${prettyDate(report.date)}</span></div></div>
    <form id="claim-form" class="form-grid"><div class="form-field"><label for="claim-name">Your name</label><input id="claim-name" name="name" required maxlength="80" autocomplete="name"></div><div class="form-field"><label for="claim-email">College email</label><input id="claim-email" name="email" type="email" required maxlength="120" autocomplete="email"></div><div class="form-field full"><label for="claim-note">What can you tell us about it?</label><textarea id="claim-note" name="note" maxlength="300" placeholder="A detail that helps verify it's yours."></textarea></div><button class="form-submit" type="submit">Send claim request</button></form>`);
}

async function submitReport(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  values.image = state.imageData;
  const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Report could not be published.');
  closeDialog();
  state.kind = 'all';
  await refresh();
  setPage('activity');
  $('#activity-email').value = values.reporterEmail;
  await loadActivity(values.reporterEmail);
  showToast('Your report is on the campus board.');
}

async function submitClaim(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const response = await fetch(`/api/reports/${encodeURIComponent(state.activeReportId)}/claims`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Claim request could not be sent.');
  closeDialog();
  await refresh();
  setPage('activity');
  $('#activity-email').value = values.email;
  await loadActivity(values.email);
  showToast(data.message);
}

async function openMatches(id) {
  const source = state.reports.find(report => report._id === id);
  if (!source) return;
  try {
    const response = await fetch(`/api/matches/${encodeURIComponent(id)}`);
    const matches = await response.json();
    const descriptions = matches.map(match => `<article class="match-result">${artwork(match.report, true)}<div><span class="match-score">${icon('spark')} ${match.score}% match</span><strong>${escapeHtml(match.report.name)}</strong><p>${escapeHtml(match.report.location)} · ${prettyDate(match.report.date)}</p><small>${escapeHtml(match.reasons.join(' · '))}</small></div></article>`).join('');
    openDialog(`<p class="eyebrow"><span class="eyebrow-line"></span> SMART MATCHES</p><h2 id="dialog-title">Possible matches</h2><p class="dialog-intro">For <strong>${escapeHtml(source.name)}</strong>. Scores compare category, shared details, location and date.</p><div class="match-results">${descriptions || '<div class="admin-empty">No likely matches yet. We will keep the report on the board.</div>'}</div>`);
  } catch (error) { showToast(error.message); }
}

async function updateClaim(id, index, status) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}/claims/${index}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Claim could not be updated.');
  await refresh();
  showToast(status === 'approved' ? 'Claim approved. Report marked claimed.' : 'Claim declined.');
}

async function updateStatus(id, status) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Status could not be updated.');
  await refresh();
  showToast('Report status updated.');
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-page]');
  if (nav) {
    if (window.innerWidth <= 640) $('.sidebar').classList.remove('mobile-open');
    return setPage(nav.dataset.page);
  }
  if (event.target.closest('#admin-logout')) {
    try { await logoutAdmin(); } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.closest('#top-report, #sidebar-report, #empty-report, #admin-new-report, #report-tip')) { event.preventDefault(); return reportForm(); }
  if (event.target.closest('#matches-cta')) return setPage('matches');
  if (event.target.closest('#dialog-close') || event.target === $('#modal-backdrop')) return closeDialog();
  const kindButton = event.target.closest('[data-kind]');
  if (kindButton) { state.kind = kindButton.dataset.kind; return renderFeed(); }
  const formKind = event.target.closest('[data-form-kind]');
  if (formKind) {
    $('#report-form [name="kind"]').value = formKind.dataset.formKind;
    $$('#report-form [data-form-kind]').forEach(button => button.classList.toggle('active', button === formKind));
    const dateLabel = document.querySelector('label[for="item-date"]');
    dateLabel.textContent = `Date ${formKind.dataset.formKind === 'lost' ? 'lost' : 'found'}`;
    return;
  }
  const claim = event.target.closest('.claim-button');
  if (claim) return claimForm(state.reports.find(report => report._id === claim.dataset.id));
  const match = event.target.closest('.match-button');
  if (match) return openMatches(match.dataset.id);
  const claimAction = event.target.closest('[data-claim-action]');
  if (claimAction) {
    try { await updateClaim(claimAction.dataset.id, claimAction.dataset.index, claimAction.dataset.claimAction); } catch (error) { showToast(error.message); }
  }
  if (event.target.closest('#mobile-menu')) {
    $('.sidebar').classList.toggle('mobile-open');
    return;
  }
  if (!event.target.closest('.sidebar') && window.innerWidth <= 640) $('.sidebar').classList.remove('mobile-open');
  if (event.target.closest('#view-toggle')) { state.compact = !state.compact; renderFeed(); }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'admin-login-form') {
    event.preventDefault();
    try { await loginAdmin(event.target); } catch (error) { $('#admin-login-error').textContent = error.message; }
  }
  if (event.target.id === 'activity-form') {
    event.preventDefault();
    const email = new FormData(event.target).get('email');
    try { await loadActivity(email); } catch (error) { showToast(error.message); }
  }
  if (event.target.id === 'report-form') {
    event.preventDefault();
    try { await submitReport(event.target); } catch (error) { showToast(error.message); }
  }
  if (event.target.id === 'claim-form') {
    event.preventDefault();
    try { await submitClaim(event.target); } catch (error) { showToast(error.message); }
  }
});

document.addEventListener('change', async event => {
  if (event.target.id === 'category-filter') { state.category = event.target.value; renderFeed(); }
  if (event.target.matches('[data-status-id]')) {
    try { await updateStatus(event.target.dataset.statusId, event.target.value); } catch (error) { showToast(error.message); }
  }
  if (event.target.id === 'item-image' && event.target.files[0]) {
    const file = event.target.files[0];
    if (file.size > 3 * 1024 * 1024) { showToast('Choose an image smaller than 3 MB.'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { state.imageData = reader.result; $('#upload-label').textContent = file.name; };
    reader.readAsDataURL(file);
  }
});

$('#search-input').addEventListener('input', event => { state.search = event.target.value; renderFeed(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeDialog();
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search-input').focus(); }
});

$('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
refresh();
