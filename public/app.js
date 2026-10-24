const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let settings={},tests=[],selected=new Set(),adminToken='',adminData=null;

const money=n=>'₹'+Number(n||0).toLocaleString('en-IN');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(url,opts={}){
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  if(adminToken)headers.Authorization='Bearer '+adminToken;
  const r=await fetch(url,{...opts,headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'कुछ गड़बड़ हो गई');
  return data;
}

async function loadPublic(){
  let d;
  try{
    d=await api('/api/public');
    settings=d.settings;
    tests=d.tests;
    try{localStorage.setItem('sigmaPublicCache',JSON.stringify(d));}catch{}
  }catch(err){
    let cached=null;
    try{cached=JSON.parse(localStorage.getItem('sigmaPublicCache')||'null');}catch{}
    if(!cached)throw err;
    d=cached;
    settings=d.settings;
    tests=d.tests;
    showMessage('आप ऑफलाइन हैं। पिछली बार लोड हुई टेस्ट सूची दिखाई जा रही है; नई बुकिंग भेजने के लिए इंटरनेट जरूरी है।','error');
  }

  document.documentElement.style.setProperty('--accent',settings.accent||'#087f8c');
  $('#labName').textContent=settings.labName;
  $('#footerName').textContent=settings.labName;
  $('#tagline').textContent=settings.tagline||'';
  $('#logo').textContent=settings.logoText||'SD';
  $('#addressText').textContent=settings.address||'';
  $('#year').textContent=new Date().getFullYear();
  $('#callLink').textContent=settings.phone?'कॉल करें: '+settings.phone:'संपर्क करें';
  $('#callLink').href=settings.phone?'tel:'+settings.phone.replace(/[^+\d]/g,''):'#';

  const today=new Date();
  $('#date').min=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);

  renderTests();
  renderSelected();
}

/* TEST SEARCH: बिना सर्च के टेस्ट नहीं दिखेंगे */
function renderTests(){
  const q=$('#search').value.trim().toLowerCase();

  if(!q){
    $('#tests').innerHTML='<p class="muted">टेस्ट देखने के लिए ऊपर सर्च बॉक्स में टेस्ट का नाम लिखें, जैसे CBC, LFT या KFT।</p>';
    return;
  }

  const list=tests.filter(t=>
    (t.name+' '+t.category+' '+t.description).toLowerCase().includes(q)
  );

  $('#tests').innerHTML=list.length
    ?list.map(t=>`<article class="test-card ${selected.has(t.id)?'chosen':''}">
      <div class="test-top">
        <h3>${esc(t.name)}</h3>
        <span class="category">${esc(t.category)}</span>
      </div>
      <p>${esc(t.description)}</p>
      <div class="test-bottom">
        <span class="price">${money(t.price)}</span>
        <button class="add" data-add="${esc(t.id)}">${selected.has(t.id)?'✓ चुना गया':'+ जोड़ें'}</button>
      </div>
    </article>`).join('')
    :'<p class="muted">कोई टेस्ट नहीं मिला।</p>';

  $$('[data-add]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.add;
    selected.has(id)?selected.delete(id):selected.add(id);
    renderTests();
    renderSelected();
  });
}

function feeTotal(){
  const chosen=tests.filter(t=>selected.has(t.id));
  const subtotal=chosen.reduce((n,t)=>n+Number(t.price),0);
  const home=$('input[name="collection"]:checked').value==='home';

  return {
    chosen,
    subtotal,
    booking:Number(settings.bookingFee||0),
    collection:home?Number(settings.homeCollectionFee||0):0,
    total:subtotal+Number(settings.bookingFee||0)+(home?Number(settings.homeCollectionFee||0):0)
  };
}

function renderSelected(){
  const x=feeTotal();

  $('#selected').innerHTML=x.chosen.length
    ?x.chosen.map(t=>`<div class="selected-row">
      <span>${esc(t.name)}</span>
      <b>${money(t.price)} <button type="button" data-remove="${esc(t.id)}">×</button></b>
    </div>`).join('')
    :'<p class="muted">पहले टेस्ट चुनें।</p>';

  $$('[data-remove]').forEach(b=>b.onclick=()=>{
    selected.delete(b.dataset.remove);
    renderTests();
    renderSelected();
  });

  $('#totals').innerHTML=`
    <div class="total-row"><span>टेस्ट का कुल</span><b>${money(x.subtotal)}</b></div>
    <div class="total-row"><span>बुकिंग चार्ज</span><b>${money(x.booking)}</b></div>
    ${x.collection?`<div class="total-row"><span>होम कलेक्शन</span><b>${money(x.collection)}</b></div>`:''}
    <div class="total-row grand"><span>कुल भुगतान</span><b>${money(x.total)}</b></div>`;

  $('#addressWrap').classList.toggle('hidden',$('input[name="collection"]:checked').value!=='home');
  $('#bookingForm [name="address"]').required=$('input[name="collection"]:checked').value==='home';
}

$('#search').addEventListener('input',renderTests);
$$('input[name="collection"]').forEach(x=>x.addEventListener('change',renderSelected));

$('#bookingForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const f=new FormData(e.target),x=feeTotal();

  if(!x.chosen.length){
    showMessage('कम से कम एक टेस्ट चुनें।','error');
    return;
  }

  const body={
    name:f.get('name'),
    phone:f.get('phone'),
    collection:f.get('collection'),
    address:f.get('address'),
    date:f.get('date'),
    time:f.get('time'),
    testIds:[...selected]
  };

  const btn=$('#payBtn');
  btn.disabled=true;
  btn.textContent='बुकिंग तैयार हो रही है…';
  showMessage('','');

  try{
    const result=await api('/api/whatsapp-booking',{
      method:'POST',
      body:JSON.stringify(body)
    });

    const b=result.booking;
    const testsText=b.tests.map(t=>`• ${t.name} — ${money(t.price)}`).join('\n');

    const msg=`नमस्ते ${result.labName}, मुझे टेस्ट बुक करना है।
बुकिंग ID: ${result.bookingId}
नाम: ${b.name}
मोबाइल: ${b.phone}
टेस्ट:
${testsText}
टेस्ट कुल: ${money(b.subtotal)}
बुकिंग चार्ज: ${money(b.bookingFee)}
होम कलेक्शन: ${money(b.collectionFee)}
कुल अनुमानित राशि: ${money(b.total)}
कलेक्शन: ${b.collection==='home'?'होम कलेक्शन':'लैब विजिट'}
पता: ${b.address||'लागू नहीं'}
तारीख: ${b.date||'बाद में तय करेंगे'}
समय: ${b.time||'कोई पसंद नहीं'}
कृपया बुकिंग कन्फर्म करें।`;

    const raw=result.whatsapp||settings.phone||'';
    const number=raw.replace(/\D/g,'');

    if(number.length<10)throw new Error('Admin Panel में सही WhatsApp नंबर सेट करें।');

    const url='https://wa.me/'+(number.length===10?'91'+number:number)+'?text='+encodeURIComponent(msg);

    showMessage('बुकिंग रिक्वेस्ट सेव हो गई। WhatsApp खुलेगा—मैसेज भेजने के बाद लैब की पुष्टि का इंतज़ार करें।','success');
    window.location.href=url;

  }catch(err){
    showMessage(err.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='WhatsApp से बुकिंग करें';
  }
});

function showMessage(t,c){
  $('#message').className=c||'';
  $('#message').textContent=t;
}

$('#adminOpen').onclick=()=>{
  $('#adminModal').classList.remove('hidden');
  $('#loginPane').classList.remove('hidden');
  $('#adminPane').classList.add('hidden');
  $('#loginError').textContent='';
};

$('#closeAdmin').onclick=()=>$('#adminModal').classList.add('hidden');

$('#adminModal').addEventListener('click',e=>{
  if(e.target.id==='adminModal')$('#adminModal').classList.add('hidden');
});

$('#loginForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    const d=await api('/api/admin/login',{
      method:'POST',
      body:JSON.stringify({password:new FormData(e.target).get('password')})
    });

    adminToken=d.token;
    $('#loginPane').classList.add('hidden');
    $('#adminPane').classList.remove('hidden');
    await loadAdmin();

  }catch(err){
    $('#loginError').textContent=err.message;
  }
};

async function loadAdmin(){
  adminData=await api('/api/admin/data');
  const f=$('#settingsForm');

  for(const [k,v] of Object.entries(adminData.settings)){
    if(f.elements[k])f.elements[k].value=v;
  }

  renderAdminTests();
  renderBookings();
}

$('#settingsForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target),data={};

  ['labName','tagline','phone','address','bookingFee','homeCollectionFee','logoText','accent'].forEach(k=>data[k]=f.get(k));

  try{
    await api('/api/admin/settings',{
      method:'PUT',
      body:JSON.stringify(data)
    });

    await loadPublic();
    await loadAdmin();
    notice('सेटिंग्स सेव हो गईं।','success');

  }catch(err){
    notice(err.message,'error');
  }
};

$('#testForm').onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target);

  const data={
    id:f.get('id')||undefined,
    name:f.get('name'),
    category:f.get('category'),
    price:Number(f.get('price')),
    description:f.get('description'),
    active:true
  };

  try{
    await api('/api/admin/tests',{
      method:'POST',
      body:JSON.stringify(data)
    });

    e.target.reset();
    $('#cancelEdit').classList.add('hidden');
    await loadPublic();
    await loadAdmin();
    notice('टेस्ट सेव हो गया।','success');

  }catch(err){
    notice(err.message,'error');
  }
};

$('#cancelEdit').onclick=()=>{
  $('#testForm').reset();
  $('#cancelEdit').classList.add('hidden');
};

function renderAdminTests(){
  $('#adminTestsList').innerHTML=adminData.tests.map(t=>`
    <div class="admin-item">
      <div><b>${esc(t.name)}</b><p>${esc(t.category)} · ${money(t.price)}</p></div>
      <div class="small-actions">
        <button class="outline" data-edit="${esc(t.id)}">एडिट</button>
        <button class="outline" data-delete="${esc(t.id)}">हटाएँ</button>
      </div>
    </div>`).join('');

  $$('[data-edit]').forEach(b=>b.onclick=()=>{
    const t=adminData.tests.find(x=>x.id===b.dataset.edit);
    const f=$('#testForm');

    Object.keys(t).forEach(k=>{
      if(f.elements[k])f.elements[k].value=t[k];
    });

    $('#cancelEdit').classList.remove('hidden');
    $('#testsAdmin').scrollIntoView({behavior:'smooth'});
  });

  $$('[data-delete]').forEach(b=>b.onclick=async()=>{
    if(!confirm('इस टेस्ट को हटाएँ?'))return;

    try{
      await api('/api/admin/tests/'+encodeURIComponent(b.dataset.delete),{method:'DELETE'});
      await loadPublic();
      await loadAdmin();
      notice('टेस्ट हटा दिया गया।','success');
    }catch(e){
      notice(e.message,'error');
    }
  });
}

function renderBookings(){
  const list=[...adminData.bookings].reverse();

  $('#bookingsList').innerHTML=list.length
    ?list.map(b=>`<div class="booking-item">
      <b>${esc(b.name)} · ${esc(b.id)}</b>
      <p>${esc(b.phone)} · ${esc(b.collection==='home'?'होम कलेक्शन':'लैब विजिट')} · ${new Date(b.createdAt).toLocaleString('en-IN')}</p>
      <p>${b.tests.map(t=>esc(t.name)).join(', ')}</p>
      <p><b>${money(b.total)}</b> · पेमेंट: ${esc(b.paymentStatus)} · <span class="status">${esc(b.status)}</span></p>
      <div class="small-actions">
        <select data-status="${esc(b.id)}">
          <option ${b.status==='Confirmed'?'selected':''}>Confirmed</option>
          <option ${b.status==='Sample Collected'?'selected':''}>Sample Collected</option>
          <option ${b.status==='Completed'?'selected':''}>Completed</option>
          <option ${b.status==='Cancelled'?'selected':''}>Cancelled</option>
          <option ${b.status==='Payment Pending'?'selected':''}>Payment Pending</option>
          <option ${b.status==='WhatsApp Pending'?'selected':''}>WhatsApp Pending</option>
        </select>
        <button class="outline" data-save-status="${esc(b.id)}">स्थिति सेव करें</button>
      </div>
    </div>`).join('')
    :'<p class="muted">अभी कोई बुकिंग नहीं है।</p>';

  $$('[data-save-status]').forEach(b=>b.onclick=async()=>{
    const status=$(`[data-status="${b.dataset.saveStatus}"]`).value;

    try{
      await api('/api/admin/bookings/'+encodeURIComponent(b.dataset.saveStatus),{
        method:'PATCH',
        body:JSON.stringify({status})
      });

      await loadAdmin();
      notice('बुकिंग की स्थिति अपडेट हो गई।','success');

    }catch(e){
      notice(e.message,'error');
    }
  });
}

$$('.tab').forEach(b=>b.onclick=()=>{
  $$('.tab').forEach(x=>x.classList.toggle('active',x===b));
  $$('.admin-section').forEach(s=>s.classList.toggle('hidden',s.id!==b.dataset.tab));
});

function notice(t,c){
  $('#adminNotice').textContent=t;
  $('#adminNotice').className=c||'';
}

$('#logout').onclick=async()=>{
  try{
    await api('/api/admin/logout',{method:'POST'});
  }catch{}

  adminToken='';
  $('#adminPane').classList.add('hidden');
  $('#loginPane').classList.remove('hidden');
};

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

loadPublic().catch(e=>{
  showMessage(
    navigator.onLine
      ?'वेबसाइट डेटा लोड नहीं हुआ: '+e.message
      :'इंटरनेट नहीं है। पहले इंटरनेट से वेबसाइट खोलें; ऑफलाइन में बुकिंग/WhatsApp काम नहीं करेगा।',
    'error'
  );
});

window.addEventListener('offline',()=>{
  showMessage('आप ऑफलाइन हैं। वेबसाइट का कुछ हिस्सा खुल सकता है, लेकिन बुकिंग भेजने के लिए इंटरनेट जरूरी है।','error');
});

window.addEventListener('online',()=>{
  loadPublic().catch(()=>{});
});
