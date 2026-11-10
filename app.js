/* My Zikir PWA - IndexedDB persistence */
const DB_NAME = "MyZikirDB";
const DB_VERSION = 2;
const STORE = "dailyEntries"; // Version 1 legacy daily summaries; intentionally preserved.
const SETTINGS = "settings";
const SESSIONS = "sessions";
const ZIKIR_COLLECTION = "zikirCollection";
const GOALS = "goals";
const zikir = [
  {id:"subhanallah",name:"সুবহানাল্লাহ",en:"SubhanAllah",color:"#159B72"},
  {id:"alhamdulillah",name:"আলহামদুলিল্লাহ",en:"Alhamdulillah",color:"#4785D8"},
  {id:"allahuakbar",name:"আল্লাহু আকবার",en:"Allahu Akbar",color:"#D5A23B"},
  {id:"astaghfirullah",name:"আস্তাগফিরুল্লাহ",en:"Astaghfirullah",color:"#A47AC7"},
  {id:"durood",name:"দরুদ শরীফ",en:"Durood Sharif",color:"#E28A62"},
  {id:"kalima",name:"লা ইলাহা ইল্লাল্লাহ",en:"La ilaha illallah",color:"#4DA8B8"}
];
let db;
const $ = id => document.getElementById(id);
const bn = n => Number(n||0).toLocaleString("bn-BD");
const todayISO = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
function openDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=event=>{
   const d=req.result;
   const tx=req.transaction;
   // Keep the Version 1 store and its records unchanged. They are the source
   // of truth for historical daily totals until the later data-migration phase.
   if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"date"});
   const settingsStore=d.objectStoreNames.contains(SETTINGS)
    ? tx.objectStore(SETTINGS)
    : d.createObjectStore(SETTINGS,{keyPath:"key"});

   if(!d.objectStoreNames.contains(SESSIONS)){
    const sessions=d.createObjectStore(SESSIONS,{keyPath:"id"});
    sessions.createIndex("byDate","date",{unique:false});
    sessions.createIndex("byCreatedAt","createdAt",{unique:false});
   }
   if(!d.objectStoreNames.contains(ZIKIR_COLLECTION)){
    const collection=d.createObjectStore(ZIKIR_COLLECTION,{keyPath:"id"});
    zikir.forEach(item=>collection.put({...item,active:true,createdAt:new Date().toISOString()}));
   }
   if(!d.objectStoreNames.contains(GOALS)){
    const goals=d.createObjectStore(GOALS,{keyPath:"zikirId"});
    // Targets start unset (null); no arbitrary religious or personal target is imposed.
    zikir.forEach(item=>goals.put({zikirId:item.id,target:null,enabled:false,updatedAt:new Date().toISOString()}));
   }
   settingsStore.put({key:"databaseSchemaVersion",value:2});
   settingsStore.put({key:"databaseUpgradedAt",value:new Date().toISOString()});
   if(event.oldVersion<1){
    settingsStore.put({key:"legacyDailyEntriesPreserved",value:true});
   }
  };
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
  req.onerror=()=>reject(req.error);
  req.onblocked=()=>reject(new Error("অন্য একটি ট্যাবে My Zikir খোলা আছে। অন্য ট্যাব বন্ধ করে আবার চেষ্টা করুন।"));
 });
}
function request(store,mode,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const req=fn(tx.objectStore(store));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
const getEntry = date => request(STORE,"readonly",s=>s.get(date));
const getAllEntries = () => request(STORE,"readonly",s=>s.getAll());
const putEntry = entry => request(STORE,"readwrite",s=>s.put(entry));
const getSetting = async key => (await request(SETTINGS,"readonly",s=>s.get(key)))?.value;
const putSetting = (key,value) => request(SETTINGS,"readwrite",s=>s.put({key,value}));
function valuesFromForm(){return Object.fromEntries(zikir.map(x=>[x.id,Math.max(0,Math.floor(Number($("count_"+x.id).value)||0))]));}
function totalOf(entry){return zikir.reduce((sum,x)=>sum+Number(entry?.counts?.[x.id]||0),0);}
function buildEntryFields(){
 $("entryFields").innerHTML=zikir.map(x=>`<div class="entry-card"><label for="count_${x.id}"><span class="swatch" style="background:${x.color}"></span>${x.name}</label><input id="count_${x.id}" type="number" min="0" step="1" inputmode="numeric" placeholder="সংখ্যা লিখুন" value="0"></div>`).join("");
 zikir.forEach(x=>$("count_"+x.id).addEventListener("input",updatePreview));
}
function updatePreview(){$("entryTotal").textContent=bn(zikir.reduce((s,x)=>s+Math.max(0,Math.floor(Number($("count_"+x.id).value)||0)),0));}
async function loadEntry(date){
 const old=await getEntry(date);zikir.forEach(x=>$("count_"+x.id).value=old?.counts?.[x.id]??0);updatePreview();$("entryDate").value=date;
}
async function saveEntry(ev){
 ev.preventDefault();const date=$("entryDate").value;if(!date)return;
 const counts=valuesFromForm();const record={date,counts,total:zikir.reduce((s,x)=>s+counts[x.id],0),updatedAt:new Date().toISOString()};
 await putEntry(record);$("saveMessage").textContent=`${date} তারিখের ${bn(record.total)}টি জিকির সংরক্ষিত হয়েছে।`;await renderAll();showScreen("dashboard");
}

const getAllSessions = () => request(SESSIONS,"readonly",s=>s.getAll());
const getSession = id => request(SESSIONS,"readonly",s=>s.get(id));
const putSession = item => request(SESSIONS,"readwrite",s=>s.put(item));
const deleteSession = id => request(SESSIONS,"readwrite",s=>s.delete(id));
let editingSessionId = null;
function sessionValues(){return Object.fromEntries(zikir.map(x=>[x.id,Math.max(0,Math.floor(Number($("session_"+x.id).value)||0))]));}
function sessionTotal(counts){return zikir.reduce((sum,x)=>sum+Number(counts?.[x.id]||0),0);}
function buildSessionFields(){
 $("sessionFields").innerHTML=zikir.map(x=>`<div class="entry-card"><label for="session_${x.id}"><span class="swatch" style="background:${x.color}"></span>${x.name}</label><input id="session_${x.id}" type="number" min="0" step="1" inputmode="numeric" placeholder="সংখ্যা লিখুন" value="0"></div>`).join("");
 zikir.forEach(x=>$("session_"+x.id).addEventListener("input",updateSessionPreview));
}
function updateSessionPreview(){$("sessionTotal").textContent=bn(zikir.reduce((sum,x)=>sum+Math.max(0,Math.floor(Number($("session_"+x.id).value)||0)),0));}
function resetSessionForm(){editingSessionId=null;$("sessionForm").reset();$("sessionDate").value=todayISO();$("sessionTime").value=new Date().toTimeString().slice(0,5);zikir.forEach(x=>$("session_"+x.id).value=0);updateSessionPreview();$("sessionFormTitle").textContent="নতুন সেশন তৈরি করুন";$("saveSessionBtn").textContent="সেশন সংরক্ষণ";$("cancelSessionEdit").hidden=true;}
async function saveSession(ev){
 ev.preventDefault();const name=$("sessionName").value.trim(),date=$("sessionDate").value,time=$("sessionTime").value,counts=sessionValues(),total=sessionTotal(counts);
 if(!name||!date||!time){$("sessionMessage").textContent="সেশনের নাম, তারিখ ও সময় পূরণ করুন।";return;}
 if(!total){$("sessionMessage").textContent="অন্তত একটি জিকিরের সংখ্যা লিখুন।";return;}
 const old=editingSessionId?await getSession(editingSessionId):null;
 const item={id:editingSessionId||`session_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name,date,time,counts,total,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 await putSession(item);$("sessionMessage").textContent="সেশন সফলভাবে সংরক্ষণ হয়েছে।";resetSessionForm();await renderAll();await renderSessions();
}
async function editSession(id){const item=await getSession(id);if(!item)return;editingSessionId=id;$("sessionName").value=item.name;$("sessionDate").value=item.date;$("sessionTime").value=item.time;zikir.forEach(x=>$("session_"+x.id).value=item.counts?.[x.id]||0);updateSessionPreview();$("sessionFormTitle").textContent="সেশন এডিট করুন";$("saveSessionBtn").textContent="পরিবর্তন সংরক্ষণ";$("cancelSessionEdit").hidden=false;$("sessionMessage").textContent="";window.scrollTo({top:0,behavior:"smooth"});}
async function renderSessions(){
 const all=(await getAllSessions()).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
 $("sessionList").innerHTML=all.length?all.map(x=>{const details=zikir.filter(z=>Number(x.counts?.[z.id]||0)>0).map(z=>`${z.name}: ${bn(x.counts[z.id])}`).join(" · ");return `<div class="session-card"><div class="session-card-head"><div><strong>${escapeHTML(x.name)}</strong><small>${new Date(x.date+"T12:00:00").toLocaleDateString("bn-BD",{day:"numeric",month:"long",year:"numeric"})} · ${escapeHTML(x.time||"")}</small></div><strong>${bn(x.total)}টি</strong></div><div class="session-breakdown">${details}</div><div class="session-actions"><button data-session-edit="${escapeHTML(x.id)}">এডিট</button><button class="delete-session" data-session-delete="${escapeHTML(x.id)}">মুছুন</button></div></div>`;}).join(""):'<div class="empty">এখনো কোনো সেশন তৈরি করা হয়নি।</div>';
 $("sessionList").querySelectorAll("[data-session-edit]").forEach(b=>b.addEventListener("click",()=>editSession(b.dataset.sessionEdit)));
 $("sessionList").querySelectorAll("[data-session-delete]").forEach(b=>b.addEventListener("click",async()=>{if(confirm("এই সেশনটি মুছে ফেলতে চান?")){await deleteSession(b.dataset.sessionDelete);if(editingSessionId===b.dataset.sessionDelete)resetSessionForm();await renderAll();await renderSessions();}}));
}
function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
async function aggregateForDate(date){
 const legacy=await getEntry(date),sessions=(await getAllSessions()).filter(x=>x.date===date);const counts={};zikir.forEach(x=>counts[x.id]=Number(legacy?.counts?.[x.id]||0));
 sessions.forEach(s=>zikir.forEach(x=>counts[x.id]+=Number(s.counts?.[x.id]||0)));
 return {counts,total:sessionTotal(counts),sessions};
}

async function renderDashboard(){
 const date=todayISO();$("todayLabel").textContent=new Date(date+"T12:00:00").toLocaleDateString("bn-BD",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
 const entry=await aggregateForDate(date);const total=entry.total;const goal=Number(await getSetting("overallGoal")??5000);const pct=goal?Math.min(100,Math.round(total/goal*100)):0;
 $("todayTotal").textContent=bn(total);$("overallGoalLabel").textContent=bn(goal);$("overallPercent").textContent=bn(pct)+"%";$("overallBar").style.width=pct+"%";$("remainingLabel").textContent=total>=goal?"আলহামদুলিল্লাহ! দৈনিক লক্ষ্য পূরণ হয়েছে।":`লক্ষ্য পূরণে বাকি ${bn(goal-total)}`;$("goalCard").textContent=bn(goal);$("remainingCard").textContent=bn(Math.max(0,goal-total));
 $("zikirBreakdown").innerHTML=zikir.map(x=>{const n=Number(entry?.counts?.[x.id]||0),p=Math.min(100,n/10);return `<div class="break-row"><div class="break-top"><span>${x.name}</span><strong>${bn(n)}</strong></div><div class="mini-progress"><span style="width:${p}%;background:${x.color}"></span></div></div>`}).join("");
 drawDistribution(entry);await drawWeekly();
}
function drawDistribution(entry){
 const canvas=$("distribution"),ctx=canvas.getContext("2d"),w=canvas.width=canvas.clientWidth*devicePixelRatio,h=canvas.height=220*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);const cw=canvas.clientWidth,ch=220;ctx.clearRect(0,0,cw,ch);
 const vals=zikir.map(x=>Number(entry?.counts?.[x.id]||0)),sum=vals.reduce((a,b)=>a+b,0),cx=cw/2,cy=ch/2,r=Math.min(cw,ch)*.37,inner=r*.58;let start=-Math.PI/2;
 if(!sum){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle="#e7eee9";ctx.lineWidth=r-inner;ctx.stroke();ctx.fillStyle="#718278";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText("এখনো কোনো তথ্য নেই",cx,cy+4);}
 else {vals.forEach((v,i)=>{if(!v)return;const end=start+v/sum*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,start,end);ctx.strokeStyle=zikir[i].color;ctx.lineWidth=r-inner;ctx.lineCap="butt";ctx.stroke();start=end;});ctx.fillStyle="#176b4d";ctx.font="bold 19px sans-serif";ctx.textAlign="center";ctx.fillText(bn(sum),cx,cy+2);ctx.fillStyle="#718278";ctx.font="10px sans-serif";ctx.fillText("মোট জিকির",cx,cy+19);}
 $("chartLegend").innerHTML=zikir.map((x,i)=>`<div><span class="dot" style="background:${x.color}"></span><span>${x.name}</span></div>`).join("");
}
async function drawWeekly(){
 const days=[];
 for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const aggregate=await aggregateForDate(key);days.push({label:d.toLocaleDateString("bn-BD",{weekday:"short"}),value:aggregate.total});}
 const canvas=$("weekly"),ctx=canvas.getContext("2d"),w=canvas.width=canvas.clientWidth*devicePixelRatio,h=canvas.height=220*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);const cw=canvas.clientWidth,ch=220;ctx.clearRect(0,0,cw,ch);const max=Math.max(1,...days.map(x=>x.value)),left=28,bottom=ch-28,top=14,plotH=bottom-top,slot=(cw-left-8)/7,bw=Math.min(25,slot*.55);
 ctx.strokeStyle="#e7eee9";ctx.lineWidth=1;for(let j=0;j<4;j++){const y=top+j*plotH/3;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cw-4,y);ctx.stroke();}
 days.forEach((d,i)=>{const bh=d.value/max*(plotH-8),x=left+i*slot+(slot-bw)/2,y=bottom-bh;ctx.fillStyle="#159b72";ctx.beginPath();ctx.roundRect(x,y,bw,bh,5);ctx.fill();ctx.fillStyle="#718278";ctx.font="10px sans-serif";ctx.textAlign="center";ctx.fillText(d.label,x+bw/2,bottom+17);});
}
async function renderHistory(){
 const legacy=await getAllEntries(),sessions=await getAllSessions(),dates=[...new Set([...legacy.map(x=>x.date),...sessions.map(x=>x.date)])].sort().reverse();
 $("historyList").innerHTML=dates.length? (await Promise.all(dates.map(async date=>{const a=await aggregateForDate(date);return `<div class="history-item"><div><strong>${new Date(date+"T12:00:00").toLocaleDateString("bn-BD",{day:"numeric",month:"long",year:"numeric"})}</strong><small>${bn(a.total)}টি জিকির · ${a.sessions.length}টি সেশন</small></div><button data-edit="${date}">পুরোনো এন্ট্রি</button></div>`;}))).join(""):'<div class="empty">এখনো কোনো রেকর্ড সংরক্ষণ করা হয়নি।</div>';
 $("historyList").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",async()=>{showScreen("entry");await loadEntry(b.dataset.edit);}));
}
async function renderAll(){await renderDashboard();await renderHistory();}
function showScreen(id){document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id===id));document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));if(id==="entry"&&!$("entryDate").value)loadEntry(todayISO());if(id==="history")renderHistory();if(id==="sessions")renderSessions();}
function downloadJSON(data,name){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportBackup(){
 // Export every application store so sessions and future settings are not omitted.
 const [entries,sessions,collection,goals,settings]=await Promise.all([
  request(STORE,"readonly",s=>s.getAll()),getAllSessions(),
  request(ZIKIR_COLLECTION,"readonly",s=>s.getAll()),
  request(GOALS,"readonly",s=>s.getAll()),
  request(SETTINGS,"readonly",s=>s.getAll())
 ]);
 const payload={app:"My Zikir",version:2,exportedAt:new Date().toISOString(),zikir,entries,sessions,zikirCollection:collection,goals,settings};
 downloadJSON(payload,`my-zikir-backup-v2-${todayISO()}.json`);
 $("backupMessage").textContent=`সম্পূর্ণ Backup তৈরি হয়েছে: ${bn(entries.length)}টি দৈনিক রেকর্ড, ${bn(sessions.length)}টি সেশনসহ। ফাইলটি নিরাপদ স্থানে রাখুন।`;
}
function validDate(value){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split("-").map(Number);const date=new Date(y,m-1,d);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;}
function cleanCounts(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Backup-এ জিকিরের সংখ্যার তথ্য সঠিক নয়।");
 const counts={};zikir.forEach(item=>{const n=Number(raw[item.id]??0);if(!Number.isSafeInteger(n)||n<0)throw new Error("Backup-এ কোনো জিকিরের সংখ্যা ভুল রয়েছে।");counts[item.id]=n;});return counts;
}
async function importBackup(file){
 if(!file) return;
 const data=JSON.parse(await file.text());
 if(data.app!=="My Zikir"||![1,2].includes(Number(data.version))||!Array.isArray(data.entries))throw new Error("এটি My Zikir Version 1 বা Version 2-এর বৈধ Backup নয়।");
 // Validate the complete file before writing anything to IndexedDB.
 const entryMap=new Map();data.entries.forEach(e=>{if(!validDate(e.date))throw new Error("Backup-এ একটি তারিখ সঠিক নয়।");const counts=cleanCounts(e.counts);entryMap.set(e.date,{date:e.date,counts,total:sessionTotal(counts),updatedAt:e.updatedAt||new Date().toISOString()});});const entries=[...entryMap.values()];
 const sessionMap=new Map();const sessionsRaw=data.version>=2?(data.sessions||[]):[];sessionsRaw.forEach(x=>{
  if(!x||typeof x.id!=="string"||!x.id||typeof x.name!=="string"||!x.name.trim()||!validDate(x.date)||typeof x.time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time))throw new Error("Backup-এ একটি Session-এর তথ্য সঠিক নয়।");
  const counts=cleanCounts(x.counts);const total=sessionTotal(counts);if(!total)throw new Error("Backup-এ শূন্য সংখ্যার Session পাওয়া গেছে; Restore বাতিল করা হয়েছে।");
  sessionMap.set(x.id,{...x,name:x.name.trim(),counts,total,createdAt:x.createdAt||new Date().toISOString(),updatedAt:x.updatedAt||new Date().toISOString()});
 });const sessions=[...sessionMap.values()];
 const collection=(data.version>=2&&Array.isArray(data.zikirCollection)?data.zikirCollection:[]).filter(x=>x&&typeof x.id==="string");
 const goals=(data.version>=2&&Array.isArray(data.goals)?data.goals:[]).filter(x=>x&&typeof x.zikirId==="string");
 let settings=[];
 if(data.version===1&&data.settings&&data.settings.overallGoal!==undefined){settings=[{key:"overallGoal",value:Math.max(0,Math.floor(Number(data.settings.overallGoal)||0))}];}
 if(data.version>=2&&Array.isArray(data.settings))settings=data.settings.filter(x=>x&&typeof x.key==="string");
 // Merge policy: keep existing daily records and sessions; add only missing IDs.
 // Settings supplied by the backup are restored as their saved values.
 await new Promise((resolve,reject)=>{
  const names=[STORE,SESSIONS,ZIKIR_COLLECTION,GOALS,SETTINGS];const tx=db.transaction(names,"readwrite");
  const addIfMissing=(store,key,item)=>{const obj=tx.objectStore(store);const req=obj.get(key);req.onsuccess=()=>{if(req.result===undefined)obj.add(item);};};
  entries.forEach(x=>addIfMissing(STORE,x.date,x));
  sessions.forEach(x=>addIfMissing(SESSIONS,x.id,x));
  collection.forEach(x=>addIfMissing(ZIKIR_COLLECTION,x.id,x));
  goals.forEach(x=>addIfMissing(GOALS,x.zikirId,x));
  settings.forEach(x=>tx.objectStore(SETTINGS).put(x));
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Backup Restore সম্পন্ন হয়নি।"));tx.onabort=()=>reject(tx.error||new Error("Backup Restore বাতিল হয়েছে।"));
 });
 $("backupMessage").textContent=`Restore সম্পন্ন। নতুন যোগ হয়েছে: ${bn(entries.length)}টি দৈনিক রেকর্ড, ${bn(sessions.length)}টি Session। আগে থেকে থাকা একই ID-এর রেকর্ড অপরিবর্তিত রাখা হয়েছে।`;
 await renderAll();await renderSessions();$("overallGoal").value=await getSetting("overallGoal")??5000;
}
async function init(){
 db=await openDB();buildEntryFields();buildSessionFields();resetSessionForm();$("sessionForm").addEventListener("submit",saveSession);$("cancelSessionEdit").addEventListener("click",resetSessionForm);$("entryDate").value=todayISO();await loadEntry(todayISO());
 const goal=await getSetting("overallGoal");if(goal===undefined)await putSetting("overallGoal",5000);$("overallGoal").value=goal??5000;
 document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.screen)));
 $("entryForm").addEventListener("submit",saveEntry);
 $("clearEntry").addEventListener("click",()=>{zikir.forEach(x=>$("count_"+x.id).value=0);updatePreview();$("saveMessage").textContent="ইনপুট Clear করা হয়েছে।";});
 $("entryDate").addEventListener("change",e=>loadEntry(e.target.value));
 $("saveGoal").addEventListener("click",async()=>{await putSetting("overallGoal",Math.max(0,Math.floor(Number($("overallGoal").value)||0)));await renderDashboard();});
 $("exportBtn").addEventListener("click",exportBackup);
 $("importFile").addEventListener("change",async e=>{try{if(e.target.files[0])await importBackup(e.target.files[0]);}catch(err){$("backupMessage").textContent=err.message;}e.target.value="";});
 await renderAll();await renderSessions();if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
}
init().catch(err=>{console.error(err);document.body.insertAdjacentHTML("afterbegin",`<p style="padding:15px;color:#a22">ডেটাবেস চালু করা যায়নি: ${err.message}</p>`);});
window.addEventListener("resize",()=>{if(db)renderDashboard();});
