import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { apiCached, del, post, type View } from "../api";
import { useLive } from "../live";

type ActivityItem = {
  id: string;
  source: "bnotActivity" | "challah" | "kollelStudy" | "siteEvent" | "scheduledLesson";
  sourceLabel: string;
  domain: "kollel" | "bnot";
  title: string;
  date: string;
  time: string;
  place: string;
  address: string;
  branchId: string | null;
  branch: string;
  city: string;
  lat: number | null;
  lng: number | null;
  participants: number | null;
  open?: boolean;
  demo?: boolean;
};
type LocationSummary = { city: string; lat: number; lng: number; count: number; boys: number; girls: number; participants: number };
type Data = {
  items: ActivityItem[];
  locations: LocationSummary[];
  totals: { activities: number; boys: number; girls: number; participants: number; cities: number };
};
type WallEntry = {
  id: string;
  domain: "kollel" | "bnot";
  branchId: string;
  date: string;
  title: string;
  note: string;
  photos: string[];
  shareApproved: boolean;
  createdAt: string;
  byName: string;
  canDelete: boolean;
};
type WallData = {
  entries: WallEntry[];
  branches: { id: string; name: string; domain: "kollel" | "bnot"; parentId?: string }[];
  cities: { id: string; name: string }[];
  canPostDomains: ("kollel" | "bnot")[];
};

const readWallPhoto = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return reject(new Error("אפשר לצרף JPG, PNG או WebP בלבד"));
    if (file.size > 1_000_000) return reject(new Error("כל תמונה יכולה להיות עד 1MB"));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("לא ניתן לקרוא את התמונה"));
    reader.readAsDataURL(file);
  });

const dayIso = (d: Date) => {
  const p=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};
const todayIso = () => dayIso(new Date());
const addDays = (iso:string,n:number) => {
  const d=new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate()+n);
  return dayIso(d);
};
type CalendarSystem = "hebrew" | "gregorian";
type CalendarView = "day" | "month" | "year" | "list";

const calLocale = (system:CalendarSystem, hebrewLabels=true) =>
  system==="hebrew" ? (hebrewLabels ? "he-IL-u-ca-hebrew" : "en-US-u-ca-hebrew") : "he-IL-u-ca-gregory";
const heDay = (iso:string,system:CalendarSystem) => new Intl.DateTimeFormat(calLocale(system),{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(`${iso}T12:00:00`));
const monthTitle = (d:Date,system:CalendarSystem) => new Intl.DateTimeFormat(calLocale(system),{month:"long",year:"numeric"}).format(d);
const yearTitle = (d:Date,system:CalendarSystem) => new Intl.DateTimeFormat(calLocale(system),{year:"numeric"}).format(d);
const calendarKey = (d:Date,system:CalendarSystem) => {
  const parts=new Intl.DateTimeFormat(calLocale(system,false),{year:"numeric",month:"long"}).formatToParts(d);
  return `${parts.find((p)=>p.type==="year")?.value||""}|${parts.find((p)=>p.type==="month")?.value||""}`;
};
const calendarYearKey = (d:Date,system:CalendarSystem) => new Intl.DateTimeFormat(calLocale(system,false),{year:"numeric"}).format(d);
const calendarDayNum = (d:Date,system:CalendarSystem) => new Intl.DateTimeFormat(calLocale(system,false),{day:"numeric"}).format(d);
const startOfCalendarMonth = (cursor:Date,system:CalendarSystem) => {
  const key=calendarKey(cursor,system); const d=new Date(cursor); d.setHours(12,0,0,0);
  for(let i=0;i<40;i++){const prev=new Date(d);prev.setDate(d.getDate()-1);if(calendarKey(prev,system)!==key)break;d.setDate(d.getDate()-1);}
  return d;
};
const nextCalendarMonth = (cursor:Date,system:CalendarSystem,dir:1|-1) => {
  const start=startOfCalendarMonth(cursor,system);
  if(dir===1){const key=calendarKey(start,system);const d=new Date(start);for(let i=0;i<40;i++){d.setDate(d.getDate()+1);if(calendarKey(d,system)!==key)return d;}return d;}
  const d=new Date(start);d.setDate(d.getDate()-1);return startOfCalendarMonth(d,system);
};
const calendarYearMonths = (cursor:Date,system:CalendarSystem) => {
  const y=calendarYearKey(cursor,system);
  const first=new Date(cursor);first.setHours(12,0,0,0);
  for(let i=0;i<390;i++){const p=new Date(first);p.setDate(first.getDate()-1);if(calendarYearKey(p,system)!==y)break;first.setDate(first.getDate()-1);}
  const out:Date[]=[];let d=startOfCalendarMonth(first,system);
  for(let i=0;i<14&&calendarYearKey(d,system)===y;i++){out.push(new Date(d));d=nextCalendarMonth(d,system,1);}
  return out;
};
const sourceIcon = (s:ActivityItem["source"]): IconName => s==="challah" ? "wheat" : s==="kollelStudy" || s==="scheduledLesson" ? "book" : s==="siteEvent" ? "globe" : "users";
const sourceClass = (s:ActivityItem["source"]) => s==="challah" ? "challah" : s==="kollelStudy" || s==="scheduledLesson" ? "kollel" : s==="siteEvent" ? "site" : "bnot";

function monthCells(cursor: Date, system: CalendarSystem) {
  const first=startOfCalendarMonth(cursor,system);
  const start=new Date(first);
  start.setDate(first.getDate()-first.getDay());
  return Array.from({length:42},(_,i)=>{
    const d=new Date(start); d.setDate(start.getDate()+i); return d;
  });
}

function pinPos(lat:number,lng:number){
  // ההקרנה מותאמת לצללית הצרה של ישראל בתוך כרטיס המפה,
  // ולא לכל רוחב הכרטיס - כך שהנעיצות נשארות על גבי הארץ.
  const lon=Math.max(0,Math.min(1,(lng-34.25)/(35.7-34.25)));
  const latNorm=Math.max(0,Math.min(1,(33.35-lat)/(33.35-29.45)));
  const left=34 + lon*31;
  const top=14 + latNorm*75;
  return {left:`${left}%`,top:`${top}%`};
}

export function ActivityCenterView({ go }: { go: (view: View, tab?: string) => void }) {
  const [data,setData]=useState<Data|null>(null);
  const [err,setErr]=useState("");
  const [selectedDate,setSelectedDate]=useState(todayIso());
  const [cursor,setCursor]=useState(()=>new Date());
  const [domain,setDomain]=useState<"all"|"kollel"|"bnot">("all");
  const [source,setSource]=useState("all");
  const [city,setCity]=useState("all");
  const [calendarSystem,setCalendarSystem]=useState<CalendarSystem>(()=>(localStorage.getItem("tb-calendar-system")==="gregorian"?"gregorian":"hebrew"));
  const [calendarView,setCalendarView]=useState<CalendarView>("month");
  const [wall,setWall]=useState<WallData|null>(null);
  const [wallOpen,setWallOpen]=useState(false);
  const [wallErr,setWallErr]=useState("");
  const [wallForm,setWallForm]=useState({ domain:"kollel" as "kollel"|"bnot", branchId:"", date:todayIso(), title:"", note:"", photos:[] as string[], shareApproved:false });

  const loadWall=useCallback(() =>
    apiCached<WallData>("/api/activity-wall", setWall).catch((e)=>setWallErr(e instanceof Error ? e.message : "שגיאה בטעינת התיעוד")), []);
  const load=useCallback(()=>{
    const from=addDays(todayIso(),-400);
    const to=addDays(todayIso(),730);
    return apiCached<Data>(`/api/activity-center?from=${from}&to=${to}`, setData).catch((e)=>setErr(e.message));
  },[]);
  useEffect(()=>{load();loadWall();},[load,loadWall]);
  useLive(["bnotActivities","challahEvents","kollelAttendance","content","orgUnits"],load);
  useLive(["activityWall"],loadWall);
  useEffect(()=>{
    if(!wall?.canPostDomains.length) return;
    if(!wall.canPostDomains.includes(wallForm.domain)) {
      const domain=wall.canPostDomains[0];
      const branchId=wall.branches.find((b)=>b.domain===domain)?.id||"";
      setWallForm((x)=>({...x,domain,branchId}));
    } else if(!wallForm.branchId || !wall.branches.some((b)=>b.id===wallForm.branchId&&b.domain===wallForm.domain)) {
      const branchId=wall.branches.find((b)=>b.domain===wallForm.domain)?.id||"";
      setWallForm((x)=>({...x,branchId}));
    }
  },[wall,wallForm.domain,wallForm.branchId]);

  const filtered=useMemo(()=>{
    if(!data) return [];
    const monthKey=calendarKey(cursor,calendarSystem);
    const yearKey=calendarYearKey(cursor,calendarSystem);
    return data.items.filter((x)=>{
      if(domain!=="all"&&x.domain!==domain) return false;
      if(source!=="all"&&x.source!==source) return false;
      if(city!=="all"&&x.city!==city) return false;
      const d=new Date(`${x.date}T12:00:00`);
      if(calendarView==="day"&&x.date!==selectedDate) return false;
      if((calendarView==="month"||calendarView==="list")&&calendarKey(d,calendarSystem)!==monthKey) return false;
      if(calendarView==="year"&&calendarYearKey(d,calendarSystem)!==yearKey) return false;
      return true;
    });
  },[data,domain,source,city,calendarView,cursor,selectedDate,calendarSystem]);

  const dayItems=useMemo(()=>filtered.filter((x)=>x.date===selectedDate).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99")), [filtered,selectedDate]);
  const cells=useMemo(()=>monthCells(cursor,calendarSystem),[cursor,calendarSystem]);
  const dayCounts=useMemo(()=>{
    const m=new Map<string,ActivityItem[]>();
    for(const x of filtered){const a=m.get(x.date)||[];a.push(x);m.set(x.date,a);}
    return m;
  },[filtered]);
  const mapLocations=useMemo(()=>{
    if(!data) return [];
    return data.locations.map((l)=>{
      const items=filtered.filter((x)=>x.city===l.city);
      return {...l,count:items.length,boys:items.filter((x)=>x.domain==="kollel").length,girls:items.filter((x)=>x.domain==="bnot").length,participants:items.reduce((n,x)=>n+Number(x.participants||0),0)};
    }).filter((x)=>x.count>0).sort((a,b)=>b.count-a.count);
  },[data,filtered]);
  const mapPins = useMemo(() => {
    const top = mapLocations.slice(0, 12);
    if (city !== "all" && !top.some((x) => x.city === city)) {
      const selected = mapLocations.find((x) => x.city === city);
      return selected ? [...top.slice(0, 11), selected] : top;
    }
    return top;
  }, [mapLocations, city]);
  const totalParticipants=filtered.reduce((n,x)=>n+Number(x.participants||0),0);
  const activeCities=new Set(filtered.map((x)=>x.city).filter(Boolean)).size;
  const todayCount=filtered.filter((x)=>x.date===todayIso()).length;
  const upcoming=filtered.filter((x)=>x.date>=todayIso()).length;

  const movePeriod=(dir:1|-1)=>{
    if(calendarView==="day"){
      const d=new Date(`${selectedDate}T12:00:00`);d.setDate(d.getDate()+dir);setSelectedDate(dayIso(d));setCursor(d);return;
    }
    if(calendarView==="year"){
      const y=calendarYearKey(cursor,calendarSystem);const d=new Date(cursor);const step=dir>0?1:-1;
      for(let i=0;i<420;i++){d.setDate(d.getDate()+step);if(calendarYearKey(d,calendarSystem)!==y){setCursor(d);setSelectedDate(dayIso(d));return;}}
      return;
    }
    const d=nextCalendarMonth(cursor,calendarSystem,dir);setCursor(d);setSelectedDate(dayIso(d));
  };
  const jumpToday=()=>{const d=new Date();setCursor(d);setSelectedDate(todayIso());};
  const setSystem=(v:CalendarSystem)=>{setCalendarSystem(v);localStorage.setItem("tb-calendar-system",v);};

  const wallBranchLabel=(id:string)=>{
    const b=wall?.branches.find((x)=>x.id===id);
    const city=wall?.cities.find((x)=>x.id===b?.parentId);
    return [b?.name,city?.name].filter(Boolean).join(" · ");
  };
  const pickWallPhotos=async(files:FileList|null)=>{
    if(!files) return;
    try{
      const selected=[...files].slice(0,3);
      const photos=await Promise.all(selected.map(readWallPhoto));
      setWallForm((x)=>({...x,photos}));
      setWallErr("");
    }catch(e){setWallErr(e instanceof Error?e.message:"לא ניתן לצרף תמונות");}
  };
  const saveWall=async()=>{
    setWallErr("");
    try{
      await post("/api/activity-wall",wallForm);
      setWallForm((x)=>({...x,title:"",note:"",photos:[],shareApproved:false,date:todayIso()}));
      setWallOpen(false);
      await loadWall();
    }catch(e){setWallErr(e instanceof Error?e.message:"השמירה נכשלה");}
  };
  const removeWall=async(id:string)=>{
    if(!window.confirm("למחוק את התיעוד הזה?")) return;
    try{await del(`/api/activity-wall/${id}`);await loadWall();}catch(e){setWallErr(e instanceof Error?e.message:"המחיקה נכשלה");}
  };

  if(err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if(!data) return <p className="muted">טוען את מרכז הפעילות…</p>;

  return (
    <div className="adm-activity-center">
      <div className="adm-head">
        <div>
          <span className="adm-eyebrow">תמונת מצב ארצית</span>
          <h1>לוח פעילות ארצי</h1>
          <p>כל מה שמתקיים במערכת — לפי יום, שעה, סניף ומיקום — מתעדכן אוטומטית מכל מקורות ההזנה.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load}><Icon name="refresh"/> רענון</button>
      </div>

      <section className="adm-activity-kpis">
        <div><Icon name="calendar"/><strong>{filtered.length}</strong><span>פעילויות בטווח</span></div>
        <div><Icon name="clock"/><strong>{todayCount}</strong><span>מתקיימות היום</span></div>
        <div><Icon name="pin"/><strong>{activeCities}</strong><span>ערים פעילות</span></div>
        <div><Icon name="users"/><strong>{totalParticipants}</strong><span>נוכחות/נרשמים</span></div>
        <div><Icon name="sparkle"/><strong>{upcoming}</strong><span>פעילויות קדימה</span></div>
      </section>

      <section className="adm-field-wall">
        <div className="adm-field-wall__head">
          <div><span className="adm-eyebrow">מהשטח</span><h2>קיר תיעוד חי</h2><p>תמונות ועדכונים מהפעילות, לפי סניף. חומר שמסומן לשיתוף עדיין נשאר פנימי עד שמחליטים לפרסם אותו.</p></div>
          {wall?.canPostDomains.length ? <button type="button" className="btn btn--sm" onClick={()=>setWallOpen(!wallOpen)}><Icon name={wallOpen?"close":"plus"}/> {wallOpen?"סגירה":"הוספת תיעוד"}</button>:null}
        </div>
        {wallErr?<div className="adm-alert adm-alert--error">{wallErr}</div>:null}
        {wallOpen&&wall?(
          <div className="adm-panel adm-field-wall__form">
            <div className="adm-fields adm-fields--2">
              {wall.canPostDomains.length>1?<label className="field"><span className="field__label">תחום</span><select className="select" value={wallForm.domain} onChange={(e)=>{const domain=e.target.value as "kollel"|"bnot";setWallForm({...wallForm,domain,branchId:wall.branches.find((b)=>b.domain===domain)?.id||""});}}><option value="kollel">טללי ברכה</option><option value="bnot">בנות צילה</option></select></label>:null}
              <label className="field"><span className="field__label">סניף</span><select className="select" value={wallForm.branchId} onChange={(e)=>setWallForm({...wallForm,branchId:e.target.value})}><option value="">בחירת סניף</option>{wall.branches.filter((b)=>b.domain===wallForm.domain).map((b)=><option key={b.id} value={b.id}>{wallBranchLabel(b.id)}</option>)}</select></label>
              <label className="field"><span className="field__label">תאריך</span><input className="input" type="date" value={wallForm.date} onChange={(e)=>setWallForm({...wallForm,date:e.target.value})}/></label>
              <label className="field"><span className="field__label">כותרת</span><input className="input" value={wallForm.title} onChange={(e)=>setWallForm({...wallForm,title:e.target.value})} placeholder="לדוגמה: ערב לימוד בסניף"/></label>
              <label className="field span-2"><span className="field__label">מה היה?</span><textarea className="textarea" rows={3} value={wallForm.note} onChange={(e)=>setWallForm({...wallForm,note:e.target.value})}/></label>
              <label className="field span-2"><span className="field__label">תמונות — עד 3, עד 1MB כל אחת</span><input className="input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e)=>pickWallPhotos(e.target.files)}/></label>
              <label className="field span-2 adm-checkline"><input type="checkbox" checked={wallForm.shareApproved} onChange={(e)=>setWallForm({...wallForm,shareApproved:e.target.checked})}/><span>מאושר לשיתוף רחב (לא מתפרסם אוטומטית)</span></label>
            </div>
            {wallForm.photos.length?<div className="adm-field-wall__previews">{wallForm.photos.map((p,i)=><img src={p} alt={`תצוגה מקדימה ${i+1}`} key={i}/>)}</div>:null}
            <div className="btn-row"><button type="button" className="btn btn--sm" disabled={!wallForm.branchId||(!wallForm.title.trim()&&!wallForm.note.trim()&&!wallForm.photos.length)} onClick={saveWall}><Icon name="check"/> שמירת תיעוד</button></div>
          </div>
        ):null}
        <div className="adm-field-wall__grid">
          {(wall?.entries||[]).slice(0,9).map((x)=>(
            <article className="adm-field-wall__card" key={x.id}>
              {x.photos?.[0]?<div className="adm-field-wall__cover"><img src={x.photos[0]} alt={x.title}/>{x.photos.length>1?<span>+{x.photos.length-1}</span>:null}</div>:<div className="adm-field-wall__cover is-empty"><Icon name="image"/></div>}
              <div className="adm-field-wall__body">
                <div className="adm-field-wall__meta"><span>{x.domain==="bnot"?"בנות צילה":"טללי ברכה"}</span><span>{wallBranchLabel(x.branchId)}</span><span>{new Intl.DateTimeFormat("he-IL",{day:"numeric",month:"short"}).format(new Date(`${x.date}T12:00:00`))}</span></div>
                <h3>{x.title}</h3>{x.note?<p>{x.note}</p>:null}
                <div className="adm-field-wall__foot"><span className={x.shareApproved?"is-approved":""}>{x.shareApproved?"✓ מאושר לשיתוף":"פנימי בלבד"}</span><small>{x.byName}</small>{x.canDelete?<button type="button" className="adm-icon-btn" onClick={()=>removeWall(x.id)} aria-label="מחיקה"><Icon name="trash"/></button>:null}</div>
              </div>
            </article>
          ))}
          {wall&&!wall.entries.length?<div className="adm-panel adm-empty">עדיין אין תיעוד מהשטח.</div>:null}
        </div>
      </section>

      <div className="adm-activity-filters">
        <div className="adm-calendar-view-controls">
          <div className="adm-segmented">
            <button type="button" aria-pressed={calendarView==="day"} onClick={()=>{setCalendarView("day");jumpToday();}}>היום</button>
            <button type="button" aria-pressed={calendarView==="month"} onClick={()=>setCalendarView("month")}>חודש</button>
            <button type="button" aria-pressed={calendarView==="year"} onClick={()=>setCalendarView("year")}>שנה</button>
            <button type="button" aria-pressed={calendarView==="list"} onClick={()=>setCalendarView("list")}><Icon name="list"/> רשימה</button>
          </div>
          <div className="adm-segmented">
            <button type="button" aria-pressed={calendarSystem==="hebrew"} onClick={()=>setSystem("hebrew")}>עברי</button>
            <button type="button" aria-pressed={calendarSystem==="gregorian"} onClick={()=>setSystem("gregorian")}>לועזי</button>
          </div>
        </div>
        <select className="select" value={domain} onChange={(e)=>setDomain(e.target.value as typeof domain)} aria-label="תחום">
          <option value="all">שני הארגונים</option><option value="kollel">טללי ברכה</option><option value="bnot">בנות צילה</option>
        </select>
        <select className="select" value={source} onChange={(e)=>setSource(e.target.value)} aria-label="סוג פעילות">
          <option value="all">כל סוגי הפעילות</option><option value="bnotActivity">פעילות בנות צילה</option><option value="challah">הפרשת חלה</option><option value="kollelStudy">ערב לימוד</option><option value="scheduledLesson">שיעור</option><option value="siteEvent">אירוע האתר</option>
        </select>
        <select className="select" value={city} onChange={(e)=>setCity(e.target.value)} aria-label="עיר">
          <option value="all">כל הארץ</option>
          {[...new Set(data.items.map((x)=>x.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"he")).map((c)=><option value={c} key={c}>{c}</option>)}
        </select>
      </div>

      <div className="adm-activity-layout">
        <section className="adm-panel adm-calendar-panel">
          <div className="adm-calendar-nav">
            <button type="button" className="adm-icon-btn" onClick={()=>movePeriod(-1)} aria-label="תקופה קודמת"><Icon name="arrowRight"/></button>
            <button type="button" className="adm-calendar-nav__title" onClick={()=>calendarView==="day"?setCalendarView("month"):calendarView==="month"?setCalendarView("year"):jumpToday()}>
              <strong>{calendarView==="day"?heDay(selectedDate,calendarSystem):calendarView==="year"?yearTitle(cursor,calendarSystem):monthTitle(cursor,calendarSystem)}</strong>
              <small>{calendarView==="day"?"לחיצה למעבר לחודש":calendarView==="month"||calendarView==="list"?"לחיצה למעבר לשנה":"לחיצה לחזרה להיום"}</small>
            </button>
            <button type="button" className="adm-icon-btn" onClick={()=>movePeriod(1)} aria-label="תקופה הבאה"><Icon name="arrowLeft"/></button>
            <button type="button" className="btn btn--ghost btn--sm adm-calendar-today" onClick={jumpToday}>היום</button>
          </div>

          {calendarView==="month" ? <>
            <div className="adm-calendar-weekdays">{["א","ב","ג","ד","ה","ו","ש"].map((x)=><span key={x}>{x}</span>)}</div>
            <div className="adm-calendar-grid">
              {cells.map((d)=>{
                const iso=dayIso(d);const items=dayCounts.get(iso)||[];const inMonth=calendarKey(d,calendarSystem)===calendarKey(cursor,calendarSystem);
                return <button type="button" key={iso} className={`adm-calendar-day${selectedDate===iso?" is-selected":""}${iso===todayIso()?" is-today":""}${!inMonth?" is-out":""}`} onClick={()=>{setSelectedDate(iso);setCursor(d);setCalendarView("day");}}>
                  <span>{calendarDayNum(d,calendarSystem)}</span>
                  {items.length?<strong>{items.length}</strong>:null}
                  {items.length?<i className={items.some((x)=>x.domain==="bnot")&&items.some((x)=>x.domain==="kollel")?"is-mixed":items[0].domain==="bnot"?"is-bnot":"is-kollel"}/>:null}
                </button>;
              })}
            </div>
          </> : null}

          {calendarView==="year" ? <div className="adm-year-grid">
            {calendarYearMonths(cursor,calendarSystem).map((m)=>{
              const key=calendarKey(m,calendarSystem);
              const count=data.items.filter((x)=>{
                const d=new Date(`${x.date}T12:00:00`);
                if(calendarKey(d,calendarSystem)!==key) return false;
                if(domain!=="all"&&x.domain!==domain) return false;
                if(source!=="all"&&x.source!==source) return false;
                if(city!=="all"&&x.city!==city) return false;
                return true;
              }).length;
              return <button type="button" key={key} onClick={()=>{setCursor(m);setSelectedDate(dayIso(m));setCalendarView("month");}}>
                <span>{new Intl.DateTimeFormat(calLocale(calendarSystem),{month:"long"}).format(m)}</span><strong>{count}</strong><small>פעילויות</small>
              </button>;
            })}
          </div> : null}

          {calendarView==="day" ? <div className="adm-calendar-day-focus">
            <span>{new Intl.DateTimeFormat(calLocale(calendarSystem),{weekday:"long"}).format(new Date(`${selectedDate}T12:00:00`))}</span>
            <strong>{new Intl.DateTimeFormat(calLocale(calendarSystem),{day:"numeric"}).format(new Date(`${selectedDate}T12:00:00`))}</strong>
            <h3>{new Intl.DateTimeFormat(calLocale(calendarSystem),{month:"long",year:"numeric"}).format(new Date(`${selectedDate}T12:00:00`))}</h3>
            <small>{dayItems.length} פעילויות ביום זה</small>
          </div> : null}

          {calendarView==="list" ? <div className="adm-calendar-list">
            {filtered.slice().sort((a,b)=>`${a.date}T${a.time||"99:99"}`.localeCompare(`${b.date}T${b.time||"99:99"}`)).map((x)=><button type="button" key={x.id} onClick={()=>{setSelectedDate(x.date);setCalendarView("day");}}>
              <span className="adm-calendar-list__date">{new Intl.DateTimeFormat(calLocale(calendarSystem),{day:"numeric",month:"short"}).format(new Date(`${x.date}T12:00:00`))}</span>
              <span><strong>{x.title}</strong><small>{[x.time,x.city,x.branch,x.place].filter(Boolean).join(" · ")}</small></span>
              <span className="adm-calendar-list__kind">{x.sourceLabel}</span>
              <Icon name="arrowLeft"/>
            </button>)}
            {!filtered.length?<div className="adm-empty">אין פעילות בתקופה שנבחרה.</div>:null}
          </div> : null}
        </section>

        <section className="adm-panel adm-day-panel">
          <div className="adm-panel__head"><div><span className="adm-eyebrow">ציר שעות</span><h2>{heDay(selectedDate,calendarSystem)}</h2></div><span className="adm-section-count">{dayItems.length}</span></div>
          {dayItems.length?(
            <div className="adm-day-timeline">
              {dayItems.map((x)=><article
                className={`adm-time-event adm-time-event--${sourceClass(x.source)}`}
                key={x.id}
                role="button"
                tabIndex={0}
                onClick={() => x.source === "challah" ? go("bnot","challah") : x.source === "bnotActivity" ? go("bnot","activities") : x.source === "kollelStudy" ? go("kollel","attendance") : go("content", x.source === "scheduledLesson" ? "lessons" : "events")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
              >
                <div className="adm-time-event__time">{x.time||"—"}</div>
                <div className="adm-time-event__dot"><Icon name={sourceIcon(x.source)}/></div>
                <div className="adm-time-event__body">
                  <div><strong>{x.title}</strong>{x.demo?<span className="flag">דמה</span>:null}</div>
                  <span>{x.sourceLabel} · {x.city||"ללא עיר"}{x.branch?` · ${x.branch}`:""}</span>
                  <small>{x.place||x.address||"המיקום לפי הסניף"}{x.participants!=null?` · ${x.participants} משתתפים/נרשמים`:""} · לחיצה לניהול</small>
                </div>
              </article>)}
            </div>
          ):<div className="adm-empty-state"><Icon name="calendar"/><strong>אין פעילות ביום הזה</strong><span>בחרו יום אחר בלוח.</span></div>}
        </section>

        <section className="adm-panel adm-israel-map-panel">
          <div className="adm-panel__head"><div><span className="adm-eyebrow">פריסה ארצית</span><h2>מפת הפעילות</h2></div><span className="adm-section-count">{mapLocations.length}</span></div>
          <div className="adm-israel-map" aria-label="מפת פעילות בישראל">
            <div className="adm-israel-map__caption">
              <strong>{mapPins.length} מוקדי פעילות בולטים</strong>
              <span>לחיצה על נעיצה מסננת את כל הלוח</span>
            </div>
            <svg viewBox="0 0 320 700" role="img" aria-label="מפת ישראל">
              <defs>
                <linearGradient id="israelFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="currentColor" stopOpacity=".18"/>
                  <stop offset="1" stopColor="currentColor" stopOpacity=".05"/>
                </linearGradient>
              </defs>
              <path className="adm-israel-shape" d="M164 22 L187 48 L184 79 L199 103 L194 137 L210 168 L201 203 L215 239 L204 275 L211 312 L198 347 L201 386 L188 425 L181 465 L168 507 L159 550 L148 596 L138 642 L124 680 L111 650 L115 607 L105 566 L112 525 L102 485 L111 446 L101 405 L112 370 L103 333 L115 299 L107 263 L119 229 L112 194 L125 162 L120 128 L137 99 L136 69 L151 43 Z"/>
              <path className="adm-israel-coast" d="M151 43 C145 86 140 131 137 177 C134 222 132 270 130 316 C128 365 126 417 123 470 C121 525 119 574 115 607"/>
              <ellipse className="adm-israel-water" cx="185" cy="168" rx="8" ry="15"/>
              <path className="adm-israel-deadsea" d="M185 360 C194 377 193 407 184 426 C177 413 177 380 185 360 Z"/>
            </svg>
            {mapPins.map((l)=>{
              const pos=pinPos(l.lat,l.lng);
              const size=Math.min(34,20+Math.sqrt(l.count)*2.6);
              return <button type="button" key={l.city} className={`adm-map-pin${city===l.city?" is-active":""}`} style={{...pos,width:size,height:size}} title={`${l.city}: ${l.count} פעילויות`} onClick={()=>setCity(city===l.city?"all":l.city)}>
                <span>{l.count}</span><small>{l.city}</small>
              </button>;
            })}
          </div>
          <div className="adm-map-legend"><span><i className="is-kollel"/> טללי ברכה</span><span><i className="is-bnot"/> בנות צילה</span><span>מוצגים מוקדי הפעילות הבולטים</span></div>
          <div className="adm-city-ranking">
            <div className="adm-city-ranking__head"><strong>פעילות לפי עיר</strong><span>{mapLocations.length} ערים בטווח הנבחר</span></div>
            {mapLocations.slice(0,10).map((l)=><button type="button" className={city===l.city?"is-active":""} key={l.city} onClick={()=>setCity(city===l.city?"all":l.city)}><span>{l.city}</span><strong>{l.count}</strong><small>{l.participants} משתתפים</small></button>)}
          </div>
        </section>
      </div>
    </div>
  );
}
