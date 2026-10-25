
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let settings = {}, tests = [], selected = new Set();
let adminToken = '', adminData = null;
let patientQRRevealed = false;

const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

async function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };

  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (adminToken) headers.Authorization = 'Bearer ' + adminToken;

  const r = await fetch(url, { ...opts, headers });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) throw new Error(data.error || 'कुछ गड़बड़ हो गई');

  return data;
}

function showMessage(t, c) {
  const el = $('#message');
  if (!el) return;
  el.className = c || '';
  el.textContent = t;
}

function notice(t, c) {
  const el = $('#adminNotice');
  if (!el) return;
  el.textContent = t;
  el.className = c || '';
}

/* PUBLIC DATA */
async function loadPublic() {
  let d;

  try {
    d = await api('/api/public');
    settings = d.settings || {};
    tests = d.tests || [];

    try {
      localStorage.setItem('sigmaPublicCache', JSON.stringify(d));
    } catch {}
  } catch (err) {
    let cached = null;

    try {
      cached = JSON.parse(localStorage.getItem('sigmaPublicCache') || 'null');
    } catch {}

    if (!cached) throw err;

    d = cached;
    settings = d.settings || {};
    tests = d.tests || [];

    showMessage(
      'आप ऑफलाइन हैं। पिछली बार लोड हुई टेस्ट सूची दिखाई जा रही है; नई बुकिंग के लिए इंटरनेट जरूरी है।',
      'error'
    );
  }

  document.documentElement.style.setProperty(
    '--accent',
    settings.accent || '#087f8c'
  );

  $('#labName').textContent = settings.labName || 'Sigma Diagnostic';
  $('#footerName').textContent = settings.labName || 'Sigma Diagnostic';
  $('#tagline').textContent = settings.tagline || '';
  $('#logo').textContent = settings.logoText || 'SD';
  $('#addressText').textContent = settings.address || '';
  $('#year').textContent = new Date().getFullYear();

  $('#callLink').textContent = settings.phone
    ? 'कॉल करें: ' + settings.phone
    : 'संपर्क करें';

  $('#callLink').href = settings.phone
    ? 'tel:' + settings.phone.replace(/[^+\d]/g, '')
    : '#';

  const today = new Date();

  $('#date').min = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  renderTests();
  renderSelected();
  renderPatientQR();
}

/* PAYMENT NOW BUTTON */
function setupPaymentNowButton() {
  const payBtn = $('#payBtn');
  const section = $('#patientQrSection');

  if (!payBtn || !section) return;

  let paymentBtn = $('#paymentNowBtn');

  if (!paymentBtn) {
    paymentBtn = document.createElement('button');
    paymentBtn.id = 'paymentNowBtn';
    paymentBtn.type = 'button';
    paymentBtn.className = 'primary full';
    paymentBtn.textContent = 'Payment Now';
    paymentBtn.style.marginBottom = '12px';

    payBtn.parentNode.insertBefore(paymentBtn, payBtn);
  }

  paymentBtn.onclick = () => {
    if (!selected.size) {
      showMessage('पहले कम से कम एक टेस्ट चुनें।', 'error');
      return;
    }

    if (
      settings.upiQrEnabled !== true ||
      !settings.upiQrImage
    ) {
      showMessage(
        'अभी ऑनलाइन भुगतान QR उपलब्ध नहीं है। कृपया लैब से संपर्क करें।',
        'error'
      );
      return;
    }

    patientQRRevealed = true;
    renderPatientQR();

    section.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  };
}

/* QR केवल Payment Now दबाने पर दिखेगा */
function renderPatientQR() {
  const section = $('#patientQrSection');
  const image = $('#patientQrImage');
  const amount = $('#patientQrAmount');

  if (!section || !image) return;

  const qr = settings.upiQrImage;
  const enabled = settings.upiQrEnabled === true;

  if (enabled && qr && patientQRRevealed) {
    image.src = qr;
    image.alt = 'Sigma Diagnostic UPI Payment QR';
    section.classList.remove('hidden');

    if (amount) {
      amount.textContent =
        'बुकिंग की कुल राशि: ' + money(feeTotal().total);
    }
  } else {
    image.removeAttribute('src');
    section.classList.add('hidden');
  }
}

/* TEST SEARCH */
function renderTests() {
  const q = $('#search').value.trim().toLowerCase();

  if (!q) {
    $('#tests').innerHTML =
      '<p class="muted">टेस्ट देखने के लिए ऊपर सर्च बॉक्स में टेस्ट का नाम लिखें, जैसे CBC, LFT या KFT।</p>';
    return;
  }

  const list = tests.filter(t =>
    (t.name + ' ' + t.category + ' ' + t.description)
      .toLowerCase()
      .includes(q)
  );

  $('#tests').innerHTML = list.length
    ? list.map(t => `
      <article class="test-card ${selected.has(t.id) ? 'chosen' : ''}">
        <div class="test-top">
          <h3>${esc(t.name)}</h3>
          <span class="category">${esc(t.category)}</span>
        </div>
        <p>${esc(t.description)}</p>
        <div class="test-bottom">
          <span class="price">${money(t.price)}</span>
          <button type="button" class="add" data-add="${esc(t.id)}">
            ${selected.has(t.id) ? '✓ चुना गया' : '+ जोड़ें'}
          </button>
        </div>
      </article>
    `).join('')
    : '<p class="muted">कोई टेस्ट नहीं मिला।</p>';

  $$('[data-add]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.add;

      if (selected.has(id)) {
        selected.delete(id);
      } else {
        selected.add(id);
      }

      renderTests();
      renderSelected();
    };
  });
}

/* TOTALS */
function feeTotal() {
  const chosen = tests.filter(t => selected.has(t.id));
  const subtotal = chosen.reduce((n, t) => n + Number(t.price), 0);
  const home = $('input[name="collection"]:checked').value === 'home';

  return {
    chosen,
    subtotal,
    booking: Number(settings.bookingFee || 0),
    collection: home ? Number(settings.homeCollectionFee || 0) : 0,
    total:
      subtotal +
      Number(settings.bookingFee || 0) +
      (home ? Number(settings.homeCollectionFee || 0) : 0)
  };
}

function renderSelected() {
  const x = feeTotal();

  $('#selected').innerHTML = x.chosen.length
    ? x.chosen.map(t => `
      <div class="selected-row">
        <span>${esc(t.name)}</span>
        <b>
          ${money(t.price)}
          <button type="button" data-remove="${esc(t.id)}">×</button>
        </b>
      </div>
    `).join('')
    : '<p class="muted">पहले टेस्ट चुनें।</p>';

  $$('[data-remove]').forEach(b => {
    b.onclick = () => {
      selected.delete(b.dataset.remove);
      renderTests();
      renderSelected();
    };
  });

  $('#totals').innerHTML = `
    <div class="total-row">
      <span>टेस्ट का कुल</span>
      <b>${money(x.subtotal)}</b>
    </div>
    <div class="total-row">
      <span>बुकिंग चार्ज</span>
      <b>${money(x.booking)}</b>
    </div>
    ${x.collection ? `
      <div class="total-row">
        <span>होम कलेक्शन</span>
        <b>${money(x.collection)}</b>
      </div>
    ` : ''}
    <div class="total-row grand">
      <span>कुल भुगतान</span>
      <b>${money(x.total)}</b>
    </div>
  `;

  const isHome =
    $('input[name="collection"]:checked').value === 'home';

  $('#addressWrap').classList.toggle('hidden', !isHome);
  $('#bookingForm [name="address"]').required = isHome;

  renderPatientQR();
}

$('#search').addEventListener('input', renderTests);

$$('input[name="collection"]').forEach(x => {
  x.addEventListener('change', renderSelected);
});

/* BOOKING AND WHATSAPP */
$('#bookingForm').addEventListener('submit', async e => {
  e.preventDefault();

  const f = new FormData(e.target);
  const x = feeTotal();

  if (!x.chosen.length) {
    showMessage('कम से कम एक टेस्ट चुनें।', 'error');
    return;
  }

  const body = {
    name: f.get('name'),
    phone: f.get('phone'),
    collection: f.get('collection'),
    address: f.get('address'),
    date: f.get('date'),
    time: f.get('time'),
    testIds: [...selected]
  };

  const btn = $('#payBtn');
  btn.disabled = true;
  btn.textContent = 'बुकिंग तैयार हो रही है…';
  showMessage('', '');

  try {
    const result = await api('/api/whatsapp-booking', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const b = result.booking;

    const testsText = b.tests
      .map(t => `• ${t.name} — ${money(t.price)}`)
      .join('\n');

    const msg = `नमस्ते ${result.labName}, मुझे टेस्ट बुक करना है।
बुकिंग ID: ${result.bookingId}
नाम: ${b.name}
मोबाइल: ${b.phone}
टेस्ट:
${testsText}
टेस्ट कुल: ${money(b.subtotal)}
बुकिंग चार्ज: ${money(b.bookingFee)}
होम कलेक्शन: ${money(b.collectionFee)}
कुल अनुमानित राशि: ${money(b.total)}
कलेक्शन: ${b.collection === 'home' ? 'होम कलेक्शन' : 'लैब विजिट'}
पता: ${b.address || 'लागू नहीं'}
तारीख: ${b.date || 'बाद में तय करेंगे'}
समय: ${b.time || 'कोई पसंद नहीं'}
कृपया बुकिंग कन्फर्म करें।`;

    const raw = result.whatsapp || settings.phone || '';
    const number = raw.replace(/\D/g, '');

    if (number.length < 10) {
      throw new Error('Admin Panel में सही WhatsApp नंबर सेट करें।');
    }

    const url =
      'https://wa.me/' +
      (number.length === 10 ? '91' + number : number) +
      '?text=' + encodeURIComponent(msg);

    showMessage(
      'बुकिंग रिक्वेस्ट सेव हो गई। WhatsApp खुलेगा—मैसेज भेजने के बाद लैब की पुष्टि का इंतज़ार करें।',
      'success'
    );

    window.location.href = url;
  } catch (err) {
    showMessage(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'WhatsApp से बुकिंग करें';
  }
});

/* ADMIN LOGIN */
$('#adminOpen').onclick = () => {
  $('#adminModal').classList.remove('hidden');
  $('#loginPane').classList.remove('hidden');
  $('#adminPane').classList.add('hidden');
  $('#loginError').textContent = '';
};

$('#closeAdmin').onclick = () =>
  $('#adminModal').classList.add('hidden');

$('#adminModal').addEventListener('click', e => {
  if (e.target.id === 'adminModal') {
    $('#adminModal').classList.add('hidden');
  }
});

$('#loginForm').onsubmit = async e => {
  e.preventDefault();

  try {
    const d = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        password: new FormData(e.target).get('password')
      })
    });

    adminToken = d.token;

    $('#loginPane').classList.add('hidden');
    $('#adminPane').classList.remove('hidden');

    await loadAdmin();
  } catch (err) {
    $('#loginError').textContent = err.message;
  }
};

async function loadAdmin() {
  adminData = await api('/api/admin/data');

  const f = $('#settingsForm');

  for (const [k, v] of Object.entries(adminData.settings || {})) {
    if (f.elements[k]) f.elements[k].value = v ?? '';
  }

  renderAdminTests();
  renderBookings();
  renderAdminQR();
}

/* ADMIN QR PREVIEW */
function renderAdminQR() {
  const preview = $('#upiQrPreview');
  const wrap = $('#upiQrPreviewWrap');
  const noticeEl = $('#upiQrNotice');
  const deleteBtn = $('#upiQrDeleteBtn');

  if (!preview || !wrap) return;

  const qr = adminData?.settings?.upiQrImage;

  if (qr) {
    preview.src = qr;
    preview.alt = 'Uploaded UPI QR';
    wrap.classList.remove('hidden');

    if (deleteBtn) deleteBtn.classList.remove('hidden');
    if (noticeEl) noticeEl.textContent = 'UPI QR अपलोड है।';
  } else {
    preview.removeAttribute('src');
    wrap.classList.add('hidden');

    if (deleteBtn) deleteBtn.classList.add('hidden');
    if (noticeEl) noticeEl.textContent = 'अभी कोई QR अपलोड नहीं है।';
  }
}

/* QR UPLOAD */
const qrUploadForm = $('#upiQrUploadForm');

if (qrUploadForm) {
  qrUploadForm.addEventListener('submit', async e => {
    e.preventDefault();

    const fileInput = $('#upiQrFile');
    const file = fileInput?.files?.[0];

    if (!file) {
      qrNotice('पहले QR की इमेज चुनें।', 'error');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      qrNotice('केवल PNG, JPG या WebP इमेज अपलोड करें।', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      qrNotice('QR इमेज 2 MB से छोटी होनी चाहिए।', 'error');
      return;
    }

    const btn = $('#upiQrUploadBtn');
    btn.disabled = true;
    btn.textContent = 'अपलोड हो रहा है…';

    try {
      const formData = new FormData();
      formData.append('qr', file);

      await api('/api/admin/upi-qr', {
        method: 'POST',
        body: formData
      });

      await loadAdmin();
      await loadPublic();

      fileInput.value = '';
      qrNotice('UPI QR सफलतापूर्वक अपलोड हो गया।', 'success');
    } catch (err) {
      qrNotice(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'QR अपलोड करें';
    }
  });
}

function qrNotice(t, c) {
  const el = $('#upiQrNotice');

  if (el) {
    el.textContent = t;
    el.className = c || '';
  }
}

/* QR DELETE */
const qrDeleteBtn = $('#upiQrDeleteBtn');

if (qrDeleteBtn) {
  qrDeleteBtn.addEventListener('click', async () => {
    if (!confirm('क्या आप अपलोड किया हुआ UPI QR हटाना चाहते हैं?')) return;

    qrDeleteBtn.disabled = true;

    try {
      await api('/api/admin/upi-qr', { method: 'DELETE' });

      patientQRRevealed = false;

      await loadAdmin();
      await loadPublic();

      qrNotice('UPI QR हटा दिया गया।', 'success');
    } catch (err) {
      qrNotice(err.message, 'error');
    } finally {
      qrDeleteBtn.disabled = false;
    }
  });
}

/* SETTINGS SAVE */
$('#settingsForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);
  const data = {};

  [
    'labName', 'tagline', 'phone', 'address',
    'bookingFee', 'homeCollectionFee', 'logoText', 'accent'
  ].forEach(k => data[k] = f.get(k));

  if (f.has('upiId')) data.upiId = f.get('upiId');

  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    await loadPublic();
    await loadAdmin();

    notice('सेटिंग्स सेव हो गईं।', 'success');
  } catch (err) {
    notice(err.message, 'error');
  }
};

/* ADMIN TEST FORM */
$('#testForm').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  const data = {
    id: f.get('id') || undefined,
    name: f.get('name'),
    category: f.get('category'),
    price: Number(f.get('price')),
    description: f.get('description'),
    active: true
  };

  try {
    await api('/api/admin/tests', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    e.target.reset();
    $('#cancelEdit').classList.add('hidden');

    await loadPublic();
    await loadAdmin();

    notice('टेस्ट सेव हो गया।', 'success');
  } catch (err) {
    notice(err.message, 'error');
  }
};

$('#cancelEdit').onclick = () => {
  $('#testForm').reset();
  $('#cancelEdit').classList.add('hidden');
};

function renderAdminTests() {
  const list = adminData?.tests || [];

  $('#adminTestsList').innerHTML = list.map(t => `
    <div class="admin-item">
      <div>
        <b>${esc(t.name)}</b>
        <p>${esc(t.category)} · ${money(t.price)}</p>
      </div>
      <div class="small-actions">
        <button type="button" class="outline" data-edit="${esc(t.id)}">एडिट</button>
        <button type="button" class="outline" data-delete="${esc(t.id)}">हटाएँ</button>
      </div>
    </div>
  `).join('');

  $$('[data-edit]').forEach(b => {
    b.onclick = () => {
      const t = adminData.tests.find(x => String(x.id) === b.dataset.edit);
      if (!t) return;

      const f = $('#testForm');

      Object.keys(t).forEach(k => {
        if (f.elements[k]) f.elements[k].value = t[k];
      });

      $('#cancelEdit').classList.remove('hidden');
      $('#testsAdmin').scrollIntoView({ behavior: 'smooth' });
    };
  });

  $$('[data-delete]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('इस टेस्ट को हटाएँ?')) return;

      try {
        await api('/api/admin/tests/' + encodeURIComponent(b.dataset.delete), {
          method: 'DELETE'
        });

        await loadPublic();
        await loadAdmin();

        notice('टेस्ट हटा दिया गया।', 'success');
      } catch (err) {
        notice(err.message, 'error');
      }
    };
  });
}

/* BOOKINGS */
function renderBookings() {
  const list = [...(adminData?.bookings || [])].reverse();

  $('#bookingsList').innerHTML = list.length
    ? list.map(b => `
      <div class="booking-item">
        <b>${esc(b.name)} · ${esc(b.id)}</b>
        <p>
          ${esc(b.phone)} ·
          ${esc(b.collection === 'home' ? 'होम कलेक्शन' : 'लैब विजिट')} ·
          ${new Date(b.createdAt).toLocaleString('en-IN')}
        </p>
        <p>${(b.tests || []).map(t => esc(t.name)).join(', ')}</p>
        <p>
          <b>${money(b.total)}</b> ·
          पेमेंट: ${esc(b.paymentStatus)} ·
          <span class="status">${esc(b.status)}</span>
        </p>
        <div class="small-actions">
          <select data-status="${esc(b.id)}">
            <option ${b.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option ${b.status === 'Sample Collected' ? 'selected' : ''}>Sample Collected</option>
            <option ${b.status === 'Completed' ? 'selected' : ''}>Completed</option>
            <option ${b.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            <option ${b.status === 'Payment Pending' ? 'selected' : ''}>Payment Pending</option>
            <option ${b.status === 'WhatsApp Pending' ? 'selected' : ''}>WhatsApp Pending</option>
          </select>
          <button type="button" class="outline" data-save-status="${esc(b.id)}">
            स्थिति सेव करें
          </button>
        </div>
      </div>
    `).join('')
    : '<p class="muted">अभी कोई बुकिंग नहीं है।</p>';

  $$('[data-save-status]').forEach(b => {
    b.onclick = async () => {
      const status = $(`[data-status="${b.dataset.saveStatus}"]`).value;

      try {
        await api(
          '/api/admin/bookings/' + encodeURIComponent(b.dataset.saveStatus),
          {
            method: 'PATCH',
            body: JSON.stringify({ status })
          }
        );

        await loadAdmin();
        notice('बुकिंग की स्थिति अपडेट हो गई।', 'success');
      } catch (err) {
        notice(err.message, 'error');
      }
    };
  });
}

/* ADMIN TABS */
$$('.tab').forEach(b => {
  b.onclick = () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === b));

    $$('.admin-section').forEach(s => {
      s.classList.toggle('hidden', s.id !== b.dataset.tab);
    });
  };
});

/* LOGOUT */
$('#logout').onclick = async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } catch {}

  adminToken = '';
  adminData = null;

  $('#adminPane').classList.add('hidden');
  $('#loginPane').classList.remove('hidden');
};

/* SERVICE WORKER */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* INITIAL LOAD */
setupPaymentNowButton();

loadPublic().catch(err => {
  showMessage(
    navigator.onLine
      ? 'वेबसाइट डेटा लोड नहीं हुआ: ' + err.message
      : 'इंटरनेट नहीं है। पहले इंटरनेट से वेबसाइट खोलें; ऑफलाइन में बुकिंग/WhatsApp काम नहीं करेगा।',
    'error'
  );
});

window.addEventListener('offline', () => {
  showMessage(
    'आप ऑफलाइन हैं। वेबसाइट का कुछ हिस्सा खुल सकता है, लेकिन बुकिंग भेजने के लिए इंटरनेट जरूरी है।',
    'error'
  );
});

window.addEventListener('online', () => {
  loadPublic().catch(() => {});
});
