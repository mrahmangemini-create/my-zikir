/* My Zikir PWA - IndexedDB persistence */
const DB_NAME = "MyZikirDB";
const DB_VERSION = 1;
const STORE = "dailyEntries";
const SETTINGS = "settings";
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
  req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"date"});if(!d.objectStoreNames.contains(SETTINGS))d.createObjectStore(SETTINGS,{keyPath:"key"});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
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
async function renderDashboard(){
 const date=todayISO();$("todayLabel").textContent=new Date(date+"T12:00:00").toLocaleDateString("bn-BD",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
 const entry=await getEntry(date);const total=totalOf(entry);const goal=Number(await getSetting("overallGoal")??5000);const pct=goal?Math.min(100,Math.round(total/goal*100)):0;
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
 const all=await getAllEntries(),map=new Map(all.map(x=>[x.date,totalOf(x)])),days=[];
 for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;days.push({label:d.toLocaleDateString("bn-BD",{weekday:"short"}),value:map.get(key)||0});}
 const canvas=$("weekly"),ctx=canvas.getContext("2d"),w=canvas.width=canvas.clientWidth*devicePixelRatio,h=canvas.height=220*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);const cw=canvas.clientWidth,ch=220;ctx.clearRect(0,0,cw,ch);const max=Math.max(1,...days.map(x=>x.value)),left=28,bottom=ch-28,top=14,plotH=bottom-top,slot=(cw-left-8)/7,bw=Math.min(25,slot*.55);
 ctx.strokeStyle="#e7eee9";ctx.lineWidth=1;for(let j=0;j<4;j++){const y=top+j*plotH/3;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cw-4,y);ctx.stroke();}
 days.forEach((d,i)=>{const bh=d.value/max*(plotH-8),x=left+i*slot+(slot-bw)/2,y=bottom-bh;ctx.fillStyle="#159b72";ctx.beginPath();ctx.roundRect(x,y,bw,bh,5);ctx.fill();ctx.fillStyle="#718278";ctx.font="10px sans-serif";ctx.textAlign="center";ctx.fillText(d.label,x+bw/2,bottom+17);});
}
async function renderHistory(){
 const all=(await getAllEntries()).sort((a,b)=>b.date.localeCompare(a.date));
 $("historyList").innerHTML=all.length?all.map(x=>`<div class="history-item"><div><strong>${new Date(x.date+"T12:00:00").toLocaleDateString("bn-BD",{day:"numeric",month:"long",year:"numeric"})}</strong><small>${bn(x.total)}টি জিকির</small></div><button data-edit="${x.date}">এডিট করুন</button></div>`).join(""):'<div class="empty">এখনো কোনো রেকর্ড সংরক্ষণ করা হয়নি।</div>';
 $("historyList").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",async()=>{showScreen("entry");await loadEntry(b.dataset.edit);}));
}
async function renderAll(){await renderDashboard();await renderHistory();}
function showScreen(id){document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id===id));document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));if(id==="entry"&&!$("entryDate").value)loadEntry(todayISO());if(id==="history")renderHistory();}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
async function exportBackup(){const payload={app:"My Zikir",version:1,exportedAt:new Date().toISOString(),zikir,entries:await getAllEntries(),settings:{overallGoal:await getSetting("overallGoal")??5000}};downloadJSON(payload,`my-zikir-backup-${todayISO()}.json`);$("backupMessage").textContent="Backup ফাইল তৈরি হয়েছে। ফোনের নিরাপদ Folder-এ রাখুন।";}
async function importBackup(file){
 const data=JSON.parse(await file.text());if(data.app!=="My Zikir"||!Array.isArray(data.entries))throw new Error("এটি My Zikir-এর বৈধ Backup ফাইল নয়।");
 for(const e of data.entries){if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!e.counts||typeof e.counts!=="object")continue;const counts={};zikir.forEach(x=>counts[x.id]=Math.max(0,Math.floor(Number(e.counts[x.id])||0)));await putEntry({date:e.date,counts,total:totalOf({counts}),updatedAt:new Date().toISOString()});}
 if(data.settings?.overallGoal!==undefined)await putSetting("overallGoal",Math.max(0,Number(data.settings.overallGoal)||0));
 $("backupMessage").textContent="Backup Restore সম্পন্ন হয়েছে।";await renderAll();$("overallGoal").value=await getSetting("overallGoal")??5000;
}
async function init(){
 db=await openDB();buildEntryFields();$("entryDate").value=todayISO();await loadEntry(todayISO());
 const goal=await getSetting("overallGoal");if(goal===undefined)await putSetting("overallGoal",5000);$("overallGoal").value=goal??5000;
 document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.screen)));
 $("entryForm").addEventListener("submit",saveEntry);
 $("clearEntry").addEventListener("click",()=>{zikir.forEach(x=>$("count_"+x.id).value=0);updatePreview();$("saveMessage").textContent="ইনপুট Clear করা হয়েছে।";});
 $("entryDate").addEventListener("change",e=>loadEntry(e.target.value));
 $("saveGoal").addEventListener("click",async()=>{await putSetting("overallGoal",Math.max(0,Math.floor(Number($("overallGoal").value)||0)));await renderDashboard();});
 $("exportBtn").addEventListener("click",exportBackup);
 $("importFile").addEventListener("change",async e=>{try{if(e.target.files[0])await importBackup(e.target.files[0]);}catch(err){$("backupMessage").textContent=err.message;}e.target.value="";});
 await renderAll();if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
}
init().catch(err=>{console.error(err);document.body.insertAdjacentHTML("afterbegin",`<p style="padding:15px;color:#a22">ডেটাবেস চালু করা যায়নি: ${err.message}</p>`);});
window.addEventListener("resize",()=>{if(db)renderDashboard();});
