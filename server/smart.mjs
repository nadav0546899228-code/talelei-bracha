/**
 * ניהול חכם: כרטיס 360°, אישורים, אוטומציות, משפכים, בריאות סניפים,
 * איזון עומס טלפניות, פעולות מרוכזות ו-AI אופציונלי.
 */
import { randomUUID } from "node:crypto";
import { branchScope, loadOrg } from "./org.mjs";
import { FORM_VIEW, isPrivileged, normalizeRoles } from "./roles.mjs";
import { normalizePhone, validPhone } from "./phoneAuth.mjs";
import { dispatch } from "./broadcast.mjs";

const day = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+n); return day(d); };
const ageHours = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : Infinity;
const cleanText = (x, n=4000) => String(x || "").replace(/[\u0000-\u001f]/g," ").trim().slice(0,n);
const isOpen = (s) => !["done","archived","rejected"].includes(String(s || ""));
const managerRoles = new Set(["developer","ceo","chief_coordinator","bnot_city","bnot_branch","kollel_city","kollel_branch","isha_coordinator","office"]);

async function visibleData(user, store) {
  const org = await loadOrg(store);
  const kScope = branchScope(user, org, "kollel");
  const bScope = branchScope(user, org, "bnot");
  const sees = (domain, branchId) => {
    const scope = domain === "bnot" ? bScope : kScope;
    return scope === null || (branchId && scope.has(branchId));
  };
  return { org, kScope, bScope, sees };
}

function branchInfo(org, id) {
  const branch = org.branches.find((b)=>b.id===id);
  const city = org.cities.find((c)=>c.id===branch?.parentId);
  return { branch: branch?.name || "", city: city?.name || "", cityId: city?.id || null };
}

async function getApprovals(user, store) {
  const { org, sees } = await visibleData(user, store);
  const items = [];
  for (const u of await store.list("mitchUpdates", 5000)) {
    if (u.status !== "pending" || !sees(u.domain === "bnot" ? "bnot" : "kollel", u.branchId)) continue;
    const loc = branchInfo(org, u.branchId);
    items.push({
      id:u.id, kind:"mitchUpdate", title:`עדכון מ${u.mitchName || "מתחזק/ת"}`,
      sub:[loc.city,loc.branch].filter(Boolean).join(" · "), at:u.submittedAt || u.createdAt,
      text:cleanText(u.text,500), photos:Array.isArray(u.photos)?u.photos.length:0, domain:u.domain
    });
  }
  for (const s of await store.list("submissions", 5000)) {
    if (s.form === "ishaMentor" && s.status === "new" && user.views.includes("isha")) {
      items.push({
        id:s.id, kind:"mentor", title:`בקשת הצטרפות כמלווה: ${s.data?.fullName || s.data?.name || "ללא שם"}`,
        sub:[s.data?.city,s.data?.availability].flat().filter(Boolean).join(" · "), at:s.createdAt,
        text:cleanText(s.data?.experience || s.data?.note,500), photos:0, domain:"bnot"
      });
    }
  }
  items.sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  return items;
}

async function buildFunnel(user, store) {
  const { sees } = await visibleData(user, store);
  const mitch = (await store.list("mitchazkim", 20000)).filter((m)=>sees(m.domain,m.branchId) && m.status !== "left");
  const bMembers = user.views.includes("bnot") ? (await store.list("bnotMembers",20000)).filter((m)=>m.active!==false && sees("bnot",m.branchId)) : [];
  const subs = await store.list("submissions",5000);
  const bnotM = mitch.filter((m)=>m.domain==="bnot");
  const kollelM = mitch.filter((m)=>m.domain==="kollel");
  const countStages = (rows, stages) => stages.map((label)=>({ label, value:rows.filter((m)=>String(m.stage||"").includes(label)).length }));
  return {
    bnot: [
      {label:"משתתפות פעילות",value:bMembers.length},
      {label:"בקשר/מתחזקות",value:bnotM.length},
      {label:"בקשר קבוע",value:bnotM.filter((m)=>/קבוע|שומרת/.test(String(m.stage))).length},
      {label:"בקשות אישה לאישה",value:subs.filter((s)=>s.form==="ishaRequest").length},
      {label:"ליווי פעיל",value:subs.filter((s)=>s.form==="ishaRequest"&&s.assignedMentorId&&isOpen(s.status)).length},
    ],
    kollel: [
      {label:"מתחזקים",value:kollelM.length},
      ...countStages(kollelM,["לומד בחברותא","לומד בקביעות","מתקדם","שומר"]),
    ],
  };
}

async function branchHealth(user, store) {
  const { org, sees } = await visibleData(user, store);
  const today = day();
  const from30 = addDays(today,-30);
  const from14 = addDays(today,-14);
  const acts = await store.list("bnotActivities",10000);
  const challah = await store.list("challahEvents",5000);
  const attendance = await store.list("kollelAttendance",10000);
  const mitch = await store.list("mitchazkim",20000);
  const members = await store.list("bnotMembers",20000);
  const av = await store.list("avrechim",20000);
  const phoneUsers = await store.list("phoneUsers",5000);
  const users = await store.list("users",5000);
  const staff = [...phoneUsers,...users].filter((x)=>x.active!==false).map((x)=>({...x,roles:normalizeRoles(x.roles)}));

  return org.branches.filter((b)=>sees(b.domain,b.id)).map((b)=>{
    const recentActivities = b.domain==="bnot"
      ? acts.filter((a)=>a.branchId===b.id && a.date>=from30).length + challah.filter((e)=>e.branchId===b.id && e.date>=from30).length
      : attendance.filter((a)=>a.branchId===b.id && a.date>=from30).length;
    const last14 = b.domain==="bnot"
      ? acts.some((a)=>a.branchId===b.id && a.date>=from14) || challah.some((e)=>e.branchId===b.id && e.date>=from14)
      : attendance.some((a)=>a.branchId===b.id && a.date>=from14);
    const due = mitch.filter((m)=>m.branchId===b.id&&m.status==="active"&&m.nextFollowUp&&m.nextFollowUp<=today).length;
    const people = b.domain==="bnot" ? members.filter((m)=>m.branchId===b.id&&m.active!==false).length : av.filter((a)=>a.branchId===b.id&&a.active!==false).length;
    const role = `${b.domain}_branch`;
    const hasManager = staff.some((p)=>p.roles.includes(role)&&p.scope?.[b.domain]?.branchId===b.id);
    let score=100; const reasons=[];
    if(!hasManager){score-=25;reasons.push("אין מנהל/ת סניף");}
    if(!last14){score-=25;reasons.push("אין פעילות ב-14 ימים");}
    else if(recentActivities<3){score-=10;reasons.push("מעט פעילות בחודש");}
    if(due>8){score-=20;reasons.push(`${due} מעקבים באיחור`);}
    else if(due>2){score-=10;reasons.push(`${due} מעקבים באיחור`);}
    if(people===0){score-=20;reasons.push("אין אנשים פעילים");}
    const city=org.cities.find((c)=>c.id===b.parentId);
    return {id:b.id,name:b.name,city:city?.name||"",domain:b.domain,score:Math.max(0,score),activities30:recentActivities,due,people,hasManager,reasons};
  }).sort((a,b)=>a.score-b.score);
}

async function callerWorkload(user, store) {
  const { org, sees } = await visibleData(user, store);
  const callers = (await store.list("phoneUsers",5000))
    .filter((u)=>u.active!==false && normalizeRoles(u.roles).includes("bnot_caller"))
    .map((u)=>({id:u.id,name:u.name||u.phone,phone:u.phone,branchId:u.scope?.bnot?.branchId||null}));
  const assignments=(await store.list("callerAssignments",30000)).filter((a)=>a.active!==false);
  const members=(await store.list("bnotMembers",30000)).filter((m)=>m.active!==false&&sees("bnot",m.branchId));
  const rows=callers.map((c)=>{
    const mine=assignments.filter((a)=>a.callerId===c.id&&members.some((m)=>m.id===a.memberId));
    return {...c,load:mine.length};
  }).sort((a,b)=>a.load-b.load);
  const assigned=new Set(assignments.map((a)=>a.memberId));
  const unassigned=members.filter((m)=>m.phone&&!assigned.has(m.id));
  return {callers:rows,unassigned:unassigned.length,total:members.length};
}

async function smartTasks(user, store) {
  const { org, sees } = await visibleData(user, store);
  const today=day();
  const tasks=[];
  for(const m of await store.list("mitchazkim",20000)){
    if(!sees(m.domain,m.branchId)||m.status!=="active"||!m.nextFollowUp||m.nextFollowUp>today) continue;
    const loc=branchInfo(org,m.branchId);
    tasks.push({id:`due:${m.id}`,type:"followup",priority:m.nextFollowUp<addDays(today,-3)?"high":"normal",title:`מעקב: ${m.name}`,sub:[loc.city,loc.branch,m.stage].filter(Boolean).join(" · "),view:m.domain==="bnot"?"bnot":"kollel",tab:`mitch:q:${m.name}`});
  }
  for(const s of await store.list("submissions",5000)){
    if(s.form==="ishaRequest"&&user.views.includes("isha")&&!s.assignedMentorId&&isOpen(s.status)){
      tasks.push({id:`isha:${s.id}`,type:"assignment",priority:ageHours(s.createdAt)>24?"high":"normal",title:`אישה לאישה: ${s.data?.fullName||s.data?.name||"בקשה"} ללא מלווה`,sub:ageHours(s.createdAt)>24?"ממתינה מעל 24 שעות":"ממתינה לשיבוץ",view:"isha",tab:"ishaRequest"});
    }
  }
  const approvals=await getApprovals(user,store);
  if(approvals.length) tasks.push({id:"approvals",type:"approval",priority:approvals.some((x)=>ageHours(x.at)>24)?"high":"normal",title:`${approvals.length} פריטים ממתינים לאישור`,sub:"מרכז האישורים",view:"smart",tab:"approvals"});
  return tasks.sort((a,b)=>(a.priority==="high"?0:1)-(b.priority==="high"?0:1)).slice(0,100);
}

async function person360(user, store, kind, id) {
  const { org, sees } = await visibleData(user, store);
  let person=null, domain=null, branchId=null;
  if(kind==="mitch"){person=await store.get("mitchazkim",id); domain=person?.domain;branchId=person?.branchId;}
  if(kind==="member"){person=await store.get("bnotMembers",id);domain="bnot";branchId=person?.branchId;}
  if(kind==="avrech"){person=await store.get("avrechim",id);domain="kollel";branchId=person?.branchId;}
  if(kind==="submission"){person=await store.get("submissions",id);domain=person?.form?.startsWith("isha")?"bnot":null;}
  if(!person) return null;
  // פניות מהאתר: רק מי שמורשה למסך של אותו טופס
  if(kind==="submission"){ const v=FORM_VIEW[person.form]; if(!v||!user.views.includes(v)) return null; }
  // אנשים: רק בסניפים שבאחריות המשתמש (גם כשאין סניף - רק מי שרואה הכל)
  else if(!domain || !sees(domain,branchId)) return null;
  const loc=branchId?branchInfo(org,branchId):{branch:"",city:""};
  const phone=normalizePhone(person.phone||person.data?.phone);
  const timeline=[];
  if(kind==="mitch"){
    for(const x of person.log||[]) timeline.push({at:x.date,type:x.type||"קשר",title:x.note||x.type,by:x.by||""});
    for(const u of await store.list("mitchUpdates",5000)) if(u.mitchId===id&&u.status==="approved") timeline.push({at:u.submittedAt,type:"עדכון עצמי",title:u.cleanText||u.text||"עדכון",by:u.reviewedBy||""});
  }
  if(kind==="member"){
    for(const a of await store.list("bnotActivities",10000)) if((a.present||[]).includes(id)) timeline.push({at:a.date,type:"פעילות",title:a.title||"פעילות",by:a.byName||""});
    for(const e of await store.list("challahEvents",5000)){
      const hit=(e.registrations||[]).find((r)=>normalizePhone(r.phone)===phone);
      if(hit) timeline.push({at:e.date,type:"הפרשת חלה",title:e.title||"הפרשת חלה",by:hit.arrived?"הגיעה":"נרשמה"});
    }
  }
  if(kind==="avrech"){
    for(const a of await store.list("kollelAttendance",10000)) if((a.present||[]).includes(id)) timeline.push({at:a.date,type:"ערב לימוד",title:a.place||"ערב לימוד",by:a.byName||""});
    for(const m of await store.list("mitchazkim",20000)) if(m.avrechId===id) timeline.push({at:m.startDate||m.createdAt,type:"חברותא",title:`מתחזק: ${m.name} · ${m.stage}`,by:""});
  }
  if(phone){
    for(const s of await store.list("submissions",5000)){
      if(normalizePhone(s.data?.phone)!==phone) continue;
      timeline.push({at:s.createdAt,type:"פנייה",title:s.form,by:s.status});
    }
  }
  timeline.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return {
    kind,id,name:person.name||person.data?.fullName||person.data?.name||"ללא שם",phone:person.phone||person.data?.phone||"",
    email:person.email||person.data?.email||"",domain,branchId,branch:loc.branch,city:loc.city,status:person.status|| (person.active===false?"לא פעיל":"פעיל"),
    stage:person.stage||"",source:person.source||"",notes:person.notes||person.data?.notes||person.data?.experience||"",
    tags:person.tags||[],nextFollowUp:person.nextFollowUp||null,stats:{timeline:timeline.length},timeline:timeline.slice(0,100)
  };
}

function fallbackAi(card) {
  const suggestions=[];
  if(card.nextFollowUp&&card.nextFollowUp<=day()) suggestions.push("לבצע מעקב היום ולעדכן את תוצאת השיחה.");
  if(card.kind==="mitch"&&!card.stage) suggestions.push("להגדיר שלב ברור במעקב.");
  if(card.timeline.length===0) suggestions.push("אין היסטוריה מספקת — מומלץ ליצור קשר ראשוני ולתעד.");
  if(card.timeline.length>=3) suggestions.push("יש מספיק היסטוריה כדי לבדוק מגמה ולהגדיר פעולה הבאה.");
  return {provider:"rules",summary:`${card.name}: ${card.stage||card.status}. קיימים ${card.timeline.length} אירועים מתועדים.`,suggestions:suggestions.length?suggestions:["אין כרגע פעולה חריגה; להמשיך מעקב שוטף."],cleanText:cleanText(card.notes,900)};
}

async function aiAssist(card) {
  const key=process.env.OPENAI_API_KEY;
  if(!key) return fallbackAi(card);
  const safe={
    kind:card.kind,domain:card.domain,city:card.city,branch:card.branch,status:card.status,stage:card.stage,source:card.source,
    notes:cleanText(card.notes,1800),nextFollowUp:card.nextFollowUp,
    timeline:card.timeline.slice(0,20).map((x)=>({at:x.at,type:x.type,title:cleanText(x.title,300)}))
  };
  try{
    const resp=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-6-luna",
        input:[{role:"system",content:"אתה עוזר תפעולי לעמותה. החזר JSON בלבד עם summary בעברית, suggestions מערך של עד 4 פעולות קצרות, cleanText טקסט נקי. אל תנחש עובדות ואל תכלול פרטי זיהוי."},{role:"user",content:JSON.stringify(safe)}],
        text:{format:{type:"json_schema",name:"person_assist",schema:{type:"object",properties:{summary:{type:"string"},suggestions:{type:"array",items:{type:"string"}},cleanText:{type:"string"}},required:["summary","suggestions","cleanText"],additionalProperties:false},strict:true}}
      })
    });
    if(!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const j=await resp.json();
    const txt=(j.output||[]).flatMap((o)=>o.content||[]).find((c)=>c.type==="output_text")?.text;
    if(!txt) throw new Error("no output");
    return {provider:"openai",...JSON.parse(txt)};
  }catch(e){
    return {...fallbackAi(card),provider:"rules",warning:"AI לא זמין כרגע; הוצגו המלצות חוקים."};
  }
}

export async function runSmartAutomationSweep(store, notify) {
  const today=day();
  const created=[];
  const putTask=async(id,doc,filter,pushData)=>{
    const prev=await store.get("smartTasks",id);
    if(prev?.resolved) return;
    if(!prev){
      await store.put("smartTasks",id,{...doc,createdAt:new Date().toISOString(),resolved:false});
      created.push(id);
      if(filter&&pushData) notify(filter,pushData);
    }
  };
  for(const m of await store.list("mitchazkim",20000)){
    if(m.status!=="active"||!m.nextFollowUp||m.nextFollowUp>today) continue;
    const id=`followup:${m.id}:${m.nextFollowUp}`;
    await putTask(id,{type:"followup",domain:m.domain,branchId:m.branchId,targetId:m.id,title:`מעקב ל${m.name}`},
      (u)=>u.views.includes(m.domain==="bnot"?"bnot":"kollel"),
      {title:"מעקב שממתין",body:`${m.name} הגיע/ה למועד המעקב`,url:`/admin?v=${m.domain==="bnot"?"bnot":"kollel"}&t=mitch:q:${encodeURIComponent(m.name)}`});
  }
  for(const s of await store.list("submissions",5000)){
    if(s.form!=="ishaRequest"||s.assignedMentorId||!isOpen(s.status)||ageHours(s.createdAt)<24) continue;
    await putTask(`isha-unassigned:${s.id}`,{type:"isha_unassigned",domain:"bnot",targetId:s.id,title:"בקשת אישה לאישה ללא שיבוץ מעל 24 שעות"},
      (u)=>u.views.includes("isha"),{title:"אישה לאישה",body:"בקשה ממתינה לשיבוץ מעל 24 שעות",url:"/admin?v=isha&t=ishaRequest"});
  }
  for(const u of await store.list("mitchUpdates",5000)){
    if(u.status!=="pending"||ageHours(u.submittedAt)<24) continue;
    await putTask(`approval:${u.id}`,{type:"approval",domain:u.domain,branchId:u.branchId,targetId:u.id,title:"עדכון מתחזק/ת ממתין לאישור מעל 24 שעות"},
      (x)=>x.views.includes(u.domain==="bnot"?"bnot":"kollel"),{title:"ממתין לאישור",body:"עדכון אישי ממתין לאישור מעל 24 שעות",url:"/admin?v=smart&t=approvals"});
  }
  return created.length;
}

export async function smartSearch(user, store, q) {
  const text=String(q||"").trim();
  if(!text) return [];
  const results=[];
  const { sees }=await visibleData(user,store);
  const today=day();
  if(/לא.*(שיחה|קשר).*שבוע|בלי.*(שיחה|קשר).*שבוע/.test(text)){
    const cutoff=addDays(today,-7);
    for(const m of await store.list("mitchazkim",20000)){
      if(!sees(m.domain,m.branchId)||m.status!=="active") continue;
      if(!m.lastContact||m.lastContact<cutoff) results.push({kind:"smart",id:m.id,title:`${m.name} — ללא קשר השבוע`,sub:m.stage||"",view:m.domain==="bnot"?"bnot":"kollel",tab:`mitch:q:${m.name}`});
    }
  }
  if(/מחר/.test(text)){
    const tomorrow=addDays(today,1);
    for(const e of await store.list("challahEvents",5000)){
      if(e.date===tomorrow&&sees("bnot",e.branchId)) results.push({kind:"activity",id:e.id,title:e.title||"הפרשת חלה מחר",sub:[e.time,e.place].filter(Boolean).join(" · "),view:"activity"});
    }
    for(const a of await store.list("bnotActivities",10000)){
      if(a.date===tomorrow&&sees("bnot",a.branchId)) results.push({kind:"activity",id:a.id,title:a.title||"פעילות מחר",sub:[a.time,a.place].filter(Boolean).join(" · "),view:"activity"});
    }
  }
  return results.slice(0,40);
}

export async function publicImpact(store) {
  const org=await loadOrg(store);
  const today=day(), from30=addDays(today,-30);
  const activities=(await store.list("bnotActivities",10000)).filter((x)=>x.date>=from30)
    .concat((await store.list("challahEvents",5000)).filter((x)=>x.date>=from30))
    .concat((await store.list("kollelAttendance",10000)).filter((x)=>x.date>=from30));
  const participants=activities.reduce((n,x)=>n+(Array.isArray(x.present)?x.present.length:Array.isArray(x.registrations)?x.registrations.length:0),0);
  return {
    cities:new Set(org.cities.map((x)=>x.name)).size,
    branches:org.branches.length,
    activities30:activities.length,
    today:activities.filter((x)=>x.date===today).length,
    participants30:participants,
  };
}

export async function handleSmart(req,res,url,ctx){
  const {pathname}=url;
  if(!pathname.startsWith("/api/smart")&&!pathname.startsWith("/api/person")) return false;
  const {user,send,store,readBody,audit,notify}=ctx;
  const method=req.method||"GET";
  if(pathname.startsWith("/api/person/")){
    const m=pathname.match(/^\/api\/person\/([\w-]+)\/([\w-]+)$/);
    if(!m||method!=="GET") return send(404,{error:"לא נמצא"}),true;
    const card=await person360(user,store,m[1],m[2]);
    return card ? (send(200,{person:card}),true) : (send(404,{error:"לא נמצא"}),true);
  }
  if(!user.views.includes("smart")) return send(403,{error:"אין הרשאה"}),true;

  if(pathname==="/api/smart/overview"&&method==="GET"){
    const [approvals,funnel,health,callers,tasks]=await Promise.all([getApprovals(user,store),buildFunnel(user,store),branchHealth(user,store),callerWorkload(user,store),smartTasks(user,store)]);
    return send(200,{approvals:approvals.slice(0,20),funnel,health,callers,tasks}),true;
  }
  if(pathname==="/api/smart/approvals"&&method==="GET") return send(200,{approvals:await getApprovals(user,store)}),true;

  const ap=pathname.match(/^\/api\/smart\/approvals\/([\w-]+)\/([\w-]+)\/(approve|reject)$/);
  if(ap&&method==="POST"){
    const [,kind,id,action]=ap;
    if(kind==="mitchUpdate"){
      const u=await store.get("mitchUpdates",id);
      const uDomain=u?.domain==="bnot"?"bnot":"kollel";
      if(!u||u.status!=="pending") return send(404,{error:"לא נמצא"}),true;
      const {sees}=await visibleData(user,store);
      if(!user.views.includes(uDomain)||!sees(uDomain,u.branchId)) return send(404,{error:"לא נמצא"}),true;
      if(action==="approve"){
        const m=await store.get("mitchazkim",u.mitchId);
        if(!m) return send(404,{error:"לא נמצא"}),true;
        const entry={id:randomUUID().slice(0,8),date:day(new Date(u.submittedAt||Date.now())),type:"דיווח עצמי",note:u.cleanText||u.text||"",by:`אושר ע״י ${user.name||"צוות"}`,updateId:u.id};
        await store.put("mitchazkim",m.id,{...m,log:[entry,...(m.log||[])].slice(0,300),lastContact:entry.date});
        await store.put("mitchUpdates",u.id,{...u,status:"approved",reviewedAt:new Date().toISOString(),reviewedBy:user.name||user.email});
      } else await store.put("mitchUpdates",u.id,{...u,status:"rejected",reviewedAt:new Date().toISOString(),reviewedBy:user.name||user.email});
    } else if(kind==="mentor"){
      const s=await store.get("submissions",id);
      if(!s||s.form!=="ishaMentor"||!user.views.includes("isha")) return send(404,{error:"לא נמצא"}),true;
      await store.put("submissions",s.id,{...s,status:action==="approve"?"approved":"rejected"});
    } else return send(400,{error:"סוג אישור לא מוכר"}),true;
    await audit(user,action==="approve"?"אישור במרכז האישורים":"דחייה במרכז האישורים",id);
    return send(200,{ok:true}),true;
  }

  if(pathname==="/api/smart/ai"&&method==="POST"){
    const b=await readBody(req);
    const card=await person360(user,store,String(b.kind||""),String(b.id||""));
    if(!card) return send(404,{error:"לא נמצא"}),true;
    const result=await aiAssist(card);
    return send(200,result),true;
  }

  if(pathname==="/api/smart/callers/auto-assign"&&method==="POST"){
    const work=await callerWorkload(user,store);
    if(!work.callers.length) return send(400,{error:"אין טלפניות פעילות במערכת"}),true;
    const { sees }=await visibleData(user,store);
    const members=(await store.list("bnotMembers",30000)).filter((m)=>m.active!==false&&m.phone&&sees("bnot",m.branchId));
    const existing=(await store.list("callerAssignments",30000)).filter((a)=>a.active!==false);
    const assigned=new Set(existing.map((x)=>x.memberId));
    const loads=new Map(work.callers.map((c)=>[c.id,c.load]));
    let n=0;
    for(const m of members.filter((x)=>!assigned.has(x.id))){
      const candidates=work.callers.filter((c)=>!c.branchId||c.branchId===m.branchId);
      const pool=candidates.length?candidates:work.callers;
      pool.sort((a,b)=>(loads.get(a.id)||0)-(loads.get(b.id)||0));
      const c=pool[0];
      await store.put("callerAssignments",randomUUID(),{callerId:c.id,memberId:m.id,branchId:m.branchId,active:true,assignedAt:new Date().toISOString(),by:user.id});
      loads.set(c.id,(loads.get(c.id)||0)+1); n++;
    }
    await audit(user,"חלוקה אוטומטית לטלפניות",`${n} משתתפות`);
    return send(200,{ok:true,assigned:n}),true;
  }

  if(pathname==="/api/smart/bulk"&&method==="GET"){
    const kind=url.searchParams.get("kind")==="mitch"?"mitch":"member";
    const {sees,org}=await visibleData(user,store);
    const rows=kind==="mitch"
      ? (await store.list("mitchazkim",30000)).filter((x)=>sees(x.domain,x.branchId)&&x.status!=="left").map((x)=>({id:x.id,name:x.name,phone:x.phone,branchId:x.branchId,domain:x.domain,tags:x.tags||[],nextFollowUp:x.nextFollowUp||null}))
      : (await store.list("bnotMembers",30000)).filter((x)=>x.active!==false&&sees("bnot",x.branchId)).map((x)=>({id:x.id,name:x.name,phone:x.phone,branchId:x.branchId,domain:"bnot",tags:x.tags||[]}));
    return send(200,{rows,branches:org.branches.filter((b)=>rows.some((x)=>x.branchId===b.id||x.domain===b.domain))}),true;
  }
  if(pathname==="/api/smart/bulk"&&method==="POST"){
    const b=await readBody(req,256*1024);
    const kind=b.kind==="mitch"?"mitch":"member"; const col=kind==="mitch"?"mitchazkim":"bnotMembers";
    const ids=(Array.isArray(b.ids)?b.ids:[]).map(String).slice(0,500);
    if(!ids.length) return send(400,{error:"לא נבחרו אנשים"}),true;
    const {sees,org}=await visibleData(user,store); let changed=0; const recipients=[];
    for(const id of ids){
      const x=await store.get(col,id); if(!x) continue;
      const domain=kind==="mitch"?x.domain:"bnot"; if(!sees(domain,x.branchId)) continue;
      let next={...x};
      if(b.action==="tag"){const tag=cleanText(b.value,30); if(tag) next.tags=[...new Set([...(x.tags||[]),tag])];}
      else if(b.action==="followup"&&kind==="mitch"){next.nextFollowUp=String(b.value||"").slice(0,10)||null;}
      else if(b.action==="branch"){
        const target=org.branches.find((br)=>br.id===String(b.value)&&br.domain===domain);
        if(!target||!sees(domain,target.id)) continue; next.branchId=target.id;
      } else if(b.action==="message"){if(validPhone(normalizePhone(x.phone))) recipients.push({name:x.name||"",phone:normalizePhone(x.phone)}); continue;}
      else continue;
      await store.put(col,id,next); changed++;
    }
    if(b.action==="message"){
      const text=cleanText(b.text,1000); const channel=String(b.channel||"whatsapp");
      if(channel==="whatsapp") return send(200,{ok:true,recipients,text}),true;
      if(channel!=="sms") return send(400,{error:"ערוץ לא נתמך בפעולה מרוכזת"}),true;
      if(!user.views.includes("broadcast")) return send(403,{error:"אין הרשאה לשליחת תפוצה"}),true;
      const settings=(await store.get("settings","broadcast"))||{};
      const result=await dispatch("sms",text,null,settings,recipients);
      await audit(user,"שליחה מרוכזת",`${recipients.length} נמענים`);
      return send(200,{ok:true,sent:recipients.length,result}),true;
    }
    await audit(user,"פעולה מרוכזת",`${changed} רשומות · ${b.action}`);
    return send(200,{ok:true,changed}),true;
  }

  if(pathname==="/api/smart/run"&&method==="POST"){
    if(!isPrivileged(user.roles)&&!user.roles.includes("chief_coordinator")) return send(403,{error:"אין הרשאה"}),true;
    const n=await runSmartAutomationSweep(store,notify);
    await audit(user,"הרצת אוטומציות חכמות",`${n} משימות חדשות`);
    return send(200,{ok:true,created:n}),true;
  }

  return send(404,{error:"לא נמצא"}),true;
}
