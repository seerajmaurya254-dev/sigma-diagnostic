# Sigma Diagnostic — Online Test Booking System

यह मोबाइल-फ्रेंडली WhatsApp-first वेबसाइट प्रोजेक्ट है। ग्राहक टेस्ट चुनकर अपनी जानकारी भरता है; वेबसाइट बुकिंग रिक्वेस्ट रिकॉर्ड करती है और WhatsApp में तैयार मैसेज खोलती है। ग्राहक को WhatsApp में Send दबाना होगा। Admin Panel से टेस्ट, कीमत, चार्ज, लैब का नाम/पता/फोन और बुकिंग स्टेटस बदले जा सकते हैं। अभी पेमेंट लैब पर होगा; Razorpay checkout डिफॉल्ट बुकिंग फ्लो में इस्तेमाल नहीं होता।

## जरूरी सच
- यह वेबसाइट प्रोजेक्ट है, अभी इंटरनेट पर लाइव नहीं है। इसे सभी ग्राहकों के फोन पर चलाने के लिए इसे होस्टिंग पर डिप्लॉय करना होगा।
- पहली बार वेबसाइट खोलने और पहली बार टेस्ट सूची लोड करने के लिए इंटरनेट चाहिए। पहली सफल विजिट के बाद PWA/service worker वेबसाइट का खोलने योग्य ढाँचा और पिछली बार लोड हुई टेस्ट सूची कैश कर सकते हैं। यह हर फोन पर अपने-आप पहले से उपलब्ध नहीं होगी; ऑफलाइन में नई बुकिंग सेव/WhatsApp पर भेजना संभव नहीं है। WhatsApp बुकिंग के लिए इंटरनेट और ग्राहक के फोन में WhatsApp/WhatsApp Web चाहिए।
- Google Search में आने के लिए साइट का सार्वजनिक URL चाहिए; Google पर दिखने में समय लग सकता है और इसकी गारंटी नहीं होती।
- ऑनलाइन पेमेंट बाद में अलग से चालू किया जा सकता है; उससे पहले Razorpay account, KYC, API keys और सुरक्षित payment verification/webhooks की जरूरत होगी।
- इस starter version में डेटा JSON फाइल में रखा जाता है और admin session मेमोरी में रहता है। वास्तविक सार्वजनिक उपयोग से पहले मजबूत database, persistent storage, durable sessions, payment webhooks/reconciliation, backups और सुरक्षा समीक्षा जरूरी है। Render की persistent disk डेटा फाइल बचाती है, लेकिन production database और webhook फिर भी बेहतर हैं।
- टेस्ट की कीमतें केवल उदाहरण हैं। ग्राहक को लिंक भेजने से पहले Admin Panel में अपनी सत्यापित कीमतें डालें।

## अपने कंप्यूटर पर चलाना
1. Node.js 18 या नया इंस्टॉल करें।
2. इस फ़ोल्डर में टर्मिनल खोलें और `npm install` चलाएँ।
3. `.env.example` की कॉपी बनाकर `.env` नाम दें।
4. `ADMIN_PASSWORD` को मजबूत पासवर्ड से बदलें। `SESSION_SECRET` में लंबी random value रखें।
5. Razorpay की Test Mode keys डालें।
6. `npm start` चलाएँ और `http://localhost:3000` खोलें।
7. ऊपर `Admin Login` दबाकर Admin Panel खोलें।

## ऑनलाइन डिप्लॉय करने का आसान रास्ता (Render)
1. GitHub पर अकाउंट बनाकर इस प्रोजेक्ट की फाइलें एक **private repository** में अपलोड करें। `.env` या API keys कभी अपलोड न करें।
2. Render पर अकाउंट खोलें और New → Blueprint चुनकर उस repository को कनेक्ट करें। `render.yaml` वेबसाइट सेवा और persistent disk सेट करने के लिए है।
3. Render के Environment settings में `ADMIN_PASSWORD` और `SESSION_SECRET` भरें। `PUBLIC_BASE_URL` में Render द्वारा दिया HTTPS URL डालें।
4. Deploy पूरा होने के बाद मोबाइल में वेबसाइट खोलें। पहले Admin Panel में सही फोन/WhatsApp नंबर और वास्तविक टेस्ट रेट सेट करें। फिर टेस्ट बुकिंग करें और WhatsApp नंबर सही खुल रहा है या नहीं जाँचें।
5. Live payment तभी चालू करें जब Razorpay account सक्रिय हो, KYC/settlement पूरे हों और webhook/production storage की समीक्षा हो जाए।

## Admin में
- Lab name, tagline, फोन/WhatsApp नंबर, address, logo text और accent color
- Booking fee और home collection fee
- Test add/edit/delete, category और price
- Booking list और status update

## ऑफलाइन और Google Search
- साइट को पहली बार इंटरनेट से खोलना जरूरी है। उसके बाद कुछ स्थिर फाइलें और पिछली बार लोड हुई टेस्ट सूची कैश हो सकती हैं; बुकिंग भेजने के लिए इंटरनेट चाहिए।
- `robots.txt` मौजूद है। लाइव URL मिलने के बाद Search Console में साइट जोड़ना और sitemap/canonical URL सेट करना अगला SEO कदम है। Google पर तुरंत दिखने की गारंटी नहीं है।

## अभी अतिरिक्त रूप से सेटअप/डेवलपमेंट चाहिए
WhatsApp मैसेज भेजना ग्राहक को स्वयं करना होगा। वास्तविक सार्वजनिक उपयोग से पहले robust production database, secure persistent admin sessions, backups और सुरक्षा समीक्षा जरूरी है। ऑनलाइन पेमेंट, refunds, appointment capacity, invoice/GST और lab/LIS integration अलग से विकसित/जाँचना होगा।
