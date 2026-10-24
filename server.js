require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const Razorpay = require('razorpay');
const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, 'data', 'db.json');
app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api/', rateLimit({windowMs: 60*1000, max: 100}));
const sessions = new Map();
function readDB(){ return JSON.parse(fs.readFileSync(DB,'utf8')); }
function writeDB(db){ fs.writeFileSync(DB, JSON.stringify(db,null,2)); }
function admin(req,res,next){ const token=(req.headers.authorization||'').replace(/^Bearer\s+/,''); if(!token || !sessions.has(token)) return res.status(401).json({error:'Admin login required'}); next(); }
function razorpay(){ if(!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_ID.includes('your_key')) return null; return new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET}); }
app.get('/api/public', (req,res)=>{const db=readDB();res.json({settings:{...db.settings,gatewayEnabled:!!razorpay()},tests:db.tests.filter(t=>t.active)});});
app.post('/api/admin/login', (req,res)=>{if(!process.env.ADMIN_PASSWORD) return res.status(500).json({error:'पहले .env में ADMIN_PASSWORD सेट करें'}); if(!req.body.password || !crypto.timingSafeEqual(Buffer.from(String(req.body.password).padEnd(256,' ').slice(0,256)),Buffer.from(String(process.env.ADMIN_PASSWORD).padEnd(256,' ').slice(0,256)))) return res.status(401).json({error:'पासवर्ड गलत है'}); const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,true);res.json({token});});
app.post('/api/admin/logout', admin,(req,res)=>{sessions.delete((req.headers.authorization||'').replace(/^Bearer\s+/,''));res.json({ok:true});});
app.get('/api/admin/data',admin,(req,res)=>res.json(readDB()));
app.put('/api/admin/settings',admin,(req,res)=>{const db=readDB(); const s=req.body||{}; const allowed=['labName','tagline','phone','address','bookingFee','homeCollectionFee','logoText','accent','upiId']; for(const k of allowed){if(s[k]!==undefined) db.settings[k]=['bookingFee','homeCollectionFee'].includes(k)?Math.max(0,Number(s[k])||0):String(s[k]).slice(0,500);} writeDB(db);res.json({settings:db.settings});});
app.post('/api/admin/tests',admin,(req,res)=>{const db=readDB();const t=req.body||{};if(!t.name||!Number.isFinite(Number(t.price))||Number(t.price)<0)return res.status(400).json({error:'टेस्ट का नाम और सही कीमत भरें'});const item={id:t.id||crypto.randomUUID(),name:String(t.name).slice(0,120),category:String(t.category||'Other').slice(0,80),price:Number(t.price),description:String(t.description||'').slice(0,300),active:t.active!==false};const i=db.tests.findIndex(x=>x.id===item.id);if(i>=0)db.tests[i]=item;else db.tests.push(item);writeDB(db);res.json({test:item});});
app.delete('/api/admin/tests/:id',admin,(req,res)=>{const db=readDB();db.tests=db.tests.filter(t=>t.id!==req.params.id);writeDB(db);res.json({ok:true});});
app.patch('/api/admin/bookings/:id',admin,(req,res)=>{const db=readDB();const b=db.bookings.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:'बुकिंग नहीं मिली'});if(['Confirmed','Sample Collected','Completed','Cancelled','WhatsApp Pending','Payment Pending'].includes(req.body.status))b.status=req.body.status;writeDB(db);res.json({booking:b});});
function buildBooking(body,db){
 if(!body.name||!body.phone||!Array.isArray(body.testIds)||!body.testIds.length) throw new Error('नाम, मोबाइल नंबर और कम से कम एक टेस्ट जरूरी है');
 const phone=String(body.phone).replace(/\D/g,'');if(phone.length<10||phone.length>13)throw new Error('सही मोबाइल नंबर भरें');
 const tests=body.testIds.map(id=>db.tests.find(t=>t.id===id&&t.active));if(tests.some(t=>!t))throw new Error('किसी टेस्ट की जानकारी बदल गई है; पेज रीफ्रेश करें');
 const collection=body.collection==='home'?'home':'lab';const subtotal=tests.reduce((n,t)=>n+t.price,0);const bookingFee=Number(db.settings.bookingFee)||0;const collectionFee=collection==='home'?(Number(db.settings.homeCollectionFee)||0):0;
 return {id:'SD'+Date.now().toString().slice(-8)+crypto.randomBytes(2).toString('hex').toUpperCase(),name:String(body.name).slice(0,100),phone,address:String(body.address||'').slice(0,400),date:String(body.date||'').slice(0,20),time:String(body.time||'').slice(0,30),collection,tests:tests.map(t=>({id:t.id,name:t.name,price:t.price})),subtotal,bookingFee,collectionFee,total:subtotal+bookingFee+collectionFee,status:'Payment Pending',paymentStatus:'Pending',createdAt:new Date().toISOString()};
}
app.post('/api/whatsapp-booking',(req,res)=>{try{const db=readDB();const booking=buildBooking(req.body,db);booking.status='WhatsApp Pending';booking.paymentStatus='Pay at lab';db.bookings.push(booking);writeDB(db);res.json({ok:true,bookingId:booking.id,booking,labName:db.settings.labName,whatsapp:db.settings.phone||''});}catch(e){res.status(400).json({error:e.message||'बुकिंग सेव नहीं हो सकी'});}});
app.post('/api/checkout',async(req,res)=>{try{const db=readDB();const booking=buildBooking(req.body,db);const rp=razorpay();if(!rp)return res.status(503).json({error:'ऑनलाइन पेमेंट चालू नहीं है। Admin/owner को Razorpay keys सेट करनी होंगी।'});const order=await rp.orders.create({amount:Math.round(booking.total*100),currency:'INR',receipt:booking.id,notes:{bookingId:booking.id,lab:db.settings.labName}});booking.orderId=order.id;db.bookings.push(booking);writeDB(db);res.json({keyId:process.env.RAZORPAY_KEY_ID,orderId:order.id,amount:order.amount,currency:order.currency,bookingId:booking.id,labName:db.settings.labName,customerName:booking.name,customerPhone:booking.phone});}catch(e){res.status(400).json({error:e.message||'Checkout शुरू नहीं हो सका'});}});
app.post('/api/payment/verify',async(req,res)=>{try{const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body;const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET||'').update(razorpay_order_id+'|'+razorpay_payment_id).digest('hex');if(!razorpay_signature||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(razorpay_signature))))return res.status(400).json({error:'पेमेंट सिग्नेचर की पुष्टि नहीं हुई'});const db=readDB();const b=db.bookings.find(x=>x.orderId===razorpay_order_id);if(!b)return res.status(404).json({error:'बुकिंग नहीं मिली'});b.paymentId=razorpay_payment_id;b.paymentStatus='Paid';b.status='Confirmed';b.paidAt=new Date().toISOString();writeDB(db);res.json({ok:true,bookingId:b.id,status:b.status});}catch(e){res.status(400).json({error:'पेमेंट सत्यापित नहीं हो सका'});}});
app.get('/api/booking/:id',(req,res)=>{const b=readDB().bookings.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:'बुकिंग नहीं मिली'});res.json({id:b.id,name:b.name,tests:b.tests,total:b.total,status:b.status,paymentStatus:b.paymentStatus,collection:b.collection,date:b.date});});
app.listen(PORT,()=>console.log(`Sigma Diagnostic running on http://localhost:${PORT}`));
