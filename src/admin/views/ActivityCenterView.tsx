import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IsraelMap3D } from "../IsraelMap3D";
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
  openCities?: { kollel: string[]; bnot: string[] };
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
/** מספר בגימטריה: 4 → ד׳, 15 → ט״ו, 786 → תשפ״ו */
const gem = (num:number) => {
  const ones=["","א","ב","ג","ד","ה","ו","ז","ח","ט"], tens=["","י","כ","ל","מ","נ","ס","ע","פ","צ"], hund=["","ק","ר","ש","ת","תק","תר","תש","תת","תתק"];
  let n=num%1000; let out=hund[Math.floor(n/100)]; n%=100;
  if(n===15) out+="טו"; else if(n===16) out+="טז"; else out+=tens[Math.floor(n/10)]+ones[n%10];
  return out.length>1?`${out.slice(0,-1)}״${out.slice(-1)}`:`${out}׳`;
};
const hebParts = (d:Date) => {
  const p=new Intl.DateTimeFormat("en-US-u-ca-hebrew",{day:"numeric",year:"numeric"}).formatToParts(d);
  return { day:Number(p.find((x)=>x.type==="day")?.value||1), year:Number(p.find((x)=>x.type==="year")?.value||0), month:new Intl.DateTimeFormat("he-IL-u-ca-hebrew",{month:"long"}).format(d) };
};
const weekday = (d:Date) => new Intl.DateTimeFormat("he-IL",{weekday:"long"}).format(d);
/** תאריך מלא - בעברי הכל באותיות (בלי מספרים), בלועזי הכל במספרים */
const heDay = (iso:string,system:CalendarSystem) => {
  const d=new Date(`${iso}T12:00:00`);
  if(system==="hebrew"){const h=hebParts(d);return `${weekday(d)}, ${gem(h.day)} ${h.month} ${gem(h.year)}`;}
  return new Intl.DateTimeFormat("he-IL",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);
};
const monthTitle = (d:Date,system:CalendarSystem) => system==="hebrew" ? `${hebParts(d).month} ${gem(hebParts(d).year)}` : new Intl.DateTimeFormat("he-IL",{month:"long",year:"numeric"}).format(d);
const yearTitle = (d:Date,system:CalendarSystem) => system==="hebrew" ? gem(hebParts(d).year) : String(d.getFullYear());
const dayLabelOf = (d:Date,system:CalendarSystem) => system==="hebrew" ? gem(hebParts(d).day) : String(d.getDate());
const calendarKey = (d:Date,system:CalendarSystem) => {
  const parts=new Intl.DateTimeFormat(calLocale(system,false),{year:"numeric",month:"long"}).formatToParts(d);
  return `${parts.find((p)=>p.type==="year")?.value||""}|${parts.find((p)=>p.type==="month")?.value||""}`;
};
const calendarYearKey = (d:Date,system:CalendarSystem) => new Intl.DateTimeFormat(calLocale(system,false),{year:"numeric"}).format(d);
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


/** בורר תאריך בגלילה - שלוש עמודות: יום, חודש, שנה (עברי באותיות או לועזי) */
function DateWheel({ value, system, onPick, onClose }: { value: string; system: CalendarSystem; onPick: (d: Date) => void; onClose: () => void }) {
  const base = new Date(`${value}T12:00:00`);
  const years = useMemo(() => {
    const yearStart = (d: Date) => calendarYearMonths(d, system)[0];
    const cur = yearStart(base);
    const list: Date[] = [cur];
    let f = cur, b = cur;
    for (let i = 0; i < 5; i++) {
      const months = calendarYearMonths(f, system); f = nextCalendarMonth(months[months.length - 1], system, 1); list.push(f);
      const prev = new Date(b); prev.setDate(prev.getDate() - 1); b = yearStart(prev); list.unshift(b);
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, system]);
  const [yi, setYi] = useState(5);
  const months = useMemo(() => calendarYearMonths(years[yi], system), [years, yi, system]);
  const curMonthStart = startOfCalendarMonth(base, system).getTime();
  const [mi, setMi] = useState(() => Math.max(0, calendarYearMonths(years[5], system).findIndex((m) => m.getTime() === curMonthStart)));
  const mIdx = Math.min(mi, months.length - 1);
  const mStart = months[mIdx];
  const mLen = Math.round((nextCalendarMonth(mStart, system, 1).getTime() - mStart.getTime()) / 864e5);
  const [day, setDay] = useState(() => Math.round((base.getTime() - startOfCalendarMonth(base, system).getTime()) / 864e5) + 1);
  const dIdx = Math.min(day, mLen);
  const dateOf = (n: number) => { const d = new Date(mStart); d.setDate(d.getDate() + n - 1); return d; };
  const monthName = (d: Date) => system === "hebrew" ? hebParts(d).month : new Intl.DateTimeFormat("he-IL", { month: "long" }).format(d);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>(".is-on").forEach((el) => el.scrollIntoView({ block: "center" }));
  }, [yi, mIdx, dIdx]);
  const chosen = dateOf(dIdx);
  return (
    <div className="adm-wheel-back" onClick={onClose}>
      <div className="adm-wheel" ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="בחירת תאריך">
        <div className="adm-wheel__head">
          <strong>{system === "hebrew" ? `${weekday(chosen)}, ${gem(hebParts(chosen).day)} ${hebParts(chosen).month} ${gem(hebParts(chosen).year)}` : new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(chosen)}</strong>
        </div>
        <div className="adm-wheel__cols">
          <div className="adm-wheel__col" aria-label="יום">
            {Array.from({ length: mLen }, (_, i) => i + 1).map((n) => (
              <button type="button" key={n} className={n === dIdx ? "is-on" : ""} onClick={() => setDay(n)}>{dayLabelOf(dateOf(n), system)}</button>
            ))}
          </div>
          <div className="adm-wheel__col" aria-label="חודש">
            {months.map((m, i) => (
              <button type="button" key={m.getTime()} className={i === mIdx ? "is-on" : ""} onClick={() => setMi(i)}>{monthName(m)}</button>
            ))}
          </div>
          <div className="adm-wheel__col" aria-label="שנה">
            {years.map((y, i) => (
              <button type="button" key={y.getTime()} className={i === yi ? "is-on" : ""} onClick={() => setYi(i)}>{yearTitle(y, system)}</button>
            ))}
          </div>
        </div>
        <div className="adm-wheel__foot">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { onPick(new Date()); }}>היום</button>
          <button type="button" className="btn btn--sm" onClick={() => onPick(chosen)}>אישור</button>
        </div>
      </div>
    </div>
  );
}

export function ActivityCenterView({ go, mode }: { go: (view: View, tab?: string) => void; mode: "boys" | "girls" }) {
  const [data,setData]=useState<Data|null>(null);
  const [err,setErr]=useState("");
  const [selectedDate,setSelectedDate]=useState(todayIso());
  const [cursor,setCursor]=useState(()=>new Date());
  // הארגון נקבע לפי המצב שממנו נכנסו (טללי ברכה / בנות צילה) - בלי ערבוב
  const domain: "kollel" | "bnot" = mode === "girls" ? "bnot" : "kollel";
  const [source,setSource]=useState("all");
  const [city,setCity]=useState("all");
  const [pickOpen,setPickOpen]=useState(false);
  const [denied,setDenied]=useState("");
  const [calendarSystem,setCalendarSystem]=useState<CalendarSystem>(()=>(localStorage.getItem("tb-calendar-system")==="gregorian"?"gregorian":"hebrew"));
  const [calendarView,setCalendarView]=useState<CalendarView>("month");
  const [wall,setWall]=useState<WallData|null>(null);
  const [wallOpen,setWallOpen]=useState(false);
  const [wallErr,setWallErr]=useState("");
  const [wallForm,setWallForm]=useState({ domain:(mode === "girls" ? "bnot" : "kollel") as "kollel"|"bnot", branchId:"", date:todayIso(), title:"", note:"", photos:[] as string[], shareApproved:false });

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
    if(wallForm.domain!==domain) {
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
      if(x.domain!==domain) return false;
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
  // לחיצה על עיר במפה: נפתחת רק אם יש הרשאה לעיר הזאת
  const canOpenCity=(c:string)=>Boolean(data?.openCities?.[domain]?.includes(c));
  const pickCity=(c:string)=>{
    if(city===c){setCity("all");setDenied("");return;}
    if(!canOpenCity(c)){setDenied(c);return;}
    setDenied("");setCity(c);
  };
  const cityItems=useMemo(()=>city==="all"?[]:(data?.items||[]).filter((x)=>x.domain===domain&&x.city===city).sort((a,b)=>a.date.localeCompare(b.date)),[data,city,domain]);
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
      {pickOpen ? <DateWheel value={selectedDate} system={calendarSystem} onClose={()=>setPickOpen(false)} onPick={(d)=>{d.setHours(12,0,0,0);setSelectedDate(dayIso(d));setCursor(d);setPickOpen(false);}}/> : null}
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
          {wall?.canPostDomains.includes(domain) ? <button type="button" className="btn btn--sm" onClick={()=>setWallOpen(!wallOpen)}><Icon name={wallOpen?"close":"plus"}/> {wallOpen?"סגירה":"הוספת תיעוד"}</button>:null}
        </div>
        {wallErr?<div className="adm-alert adm-alert--error">{wallErr}</div>:null}
        {wallOpen&&wall?(
          <div className="adm-panel adm-field-wall__form">
            <div className="adm-fields adm-fields--2">
              
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
          {(wall?.entries||[]).filter((x)=>x.domain===domain).slice(0,9).map((x)=>(
            <article className="adm-field-wall__card" key={x.id}>
              {x.photos?.[0]?<div className="adm-field-wall__cover"><img src={x.photos[0]} alt={x.title}/>{x.photos.length>1?<span>+{x.photos.length-1}</span>:null}</div>:<div className="adm-field-wall__cover is-empty"><Icon name="image"/></div>}
              <div className="adm-field-wall__body">
                <div className="adm-field-wall__meta"><span>{x.domain==="bnot"?"בנות צילה":"טללי ברכה"}</span><span>{wallBranchLabel(x.branchId)}</span><span>{new Intl.DateTimeFormat("he-IL",{day:"numeric",month:"short"}).format(new Date(`${x.date}T12:00:00`))}</span></div>
                <h3>{x.title}</h3>{x.note?<p>{x.note}</p>:null}
                <div className="adm-field-wall__foot"><span className={x.shareApproved?"is-approved":""}>{x.shareApproved?"✓ מאושר לשיתוף":"פנימי בלבד"}</span><small>{x.byName}</small>{x.canDelete?<button type="button" className="adm-icon-btn" onClick={()=>removeWall(x.id)} aria-label="מחיקה"><Icon name="trash"/></button>:null}</div>
              </div>
            </article>
          ))}
          {wall&&!wall.entries.some((x)=>x.domain===domain)?<div className="adm-panel adm-empty">עדיין אין תיעוד מהשטח.</div>:null}
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
        <select className="select" value={source} onChange={(e)=>setSource(e.target.value)} aria-label="סוג פעילות">
          <option value="all">כל סוגי הפעילות</option>{domain==="bnot"?<><option value="bnotActivity">פעילות בסניף</option><option value="challah">הפרשת חלה</option></>:<option value="kollelStudy">ערב לימוד</option>}<option value="scheduledLesson">שיעור</option><option value="siteEvent">אירוע האתר</option>
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
            <button type="button" className="adm-calendar-nav__title" onClick={()=>setPickOpen(true)}>
              <strong>{calendarView==="day"?heDay(selectedDate,calendarSystem):calendarView==="year"?yearTitle(cursor,calendarSystem):monthTitle(cursor,calendarSystem)}</strong>
              <small>לחיצה לבחירת יום, חודש ושנה</small>
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
                  <span>{dayLabelOf(d,calendarSystem)}</span>
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
                if(x.domain!==domain) return false;
                if(source!=="all"&&x.source!==source) return false;
                if(city!=="all"&&x.city!==city) return false;
                return true;
              }).length;
              return <button type="button" key={key} onClick={()=>{setCursor(m);setSelectedDate(dayIso(m));setCalendarView("month");}}>
                <span>{calendarSystem==="hebrew"?hebParts(m).month:new Intl.DateTimeFormat("he-IL",{month:"long"}).format(m)}</span><strong>{count}</strong><small>פעילויות</small>
              </button>;
            })}
          </div> : null}

          {calendarView==="day" ? <div className="adm-calendar-day-focus">
            <span>{weekday(new Date(`${selectedDate}T12:00:00`))}</span>
            <button type="button" className="adm-cal-pickbtn" onClick={()=>setPickOpen(true)} aria-label="בחירת תאריך בגלילה">
              <strong>{dayLabelOf(new Date(`${selectedDate}T12:00:00`),calendarSystem)}</strong>
              <h3>{monthTitle(new Date(`${selectedDate}T12:00:00`),calendarSystem)}</h3>
            </button>
            <small>{dayItems.length} פעילויות ביום זה</small>
          </div> : null}

          {calendarView==="list" ? <div className="adm-calendar-list">
            {filtered.slice().sort((a,b)=>`${a.date}T${a.time||"99:99"}`.localeCompare(`${b.date}T${b.time||"99:99"}`)).map((x)=><button type="button" key={x.id} onClick={()=>{setSelectedDate(x.date);setCalendarView("day");}}>
              <span className="adm-calendar-list__date">{calendarSystem==="hebrew"?`${gem(hebParts(new Date(`${x.date}T12:00:00`)).day)} ${hebParts(new Date(`${x.date}T12:00:00`)).month}`:new Intl.DateTimeFormat("he-IL",{day:"numeric",month:"short"}).format(new Date(`${x.date}T12:00:00`))}</span>
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
          <div className="adm-israel-map adm-israel-map--3d" aria-label="מפת פעילות בישראל">
            <div className="adm-israel-map__caption">
              <strong>{mapPins.length} מוקדי פעילות בולטים</strong>
              <span>לחיצה על נעיצה מסננת את כל הלוח</span>
            </div>
            <IsraelMap3D pins={mapPins} active={city} onPick={pickCity} />
          </div>
          <div className="adm-map-legend"><span><i className="is-kollel"/> טללי ברכה</span><span><i className="is-bnot"/> בנות צילה</span><span>מוצגים מוקדי הפעילות הבולטים</span></div>
          {denied?<div className="adm-alert adm-alert--error" role="alert">אין לך הרשאה לנתוני {denied}.</div>:null}
          {city!=="all"&&canOpenCity(city)?(
            <div className="adm-citybox">
              <div className="adm-citybox__head"><strong>{city}</strong><span>{cityItems.length} פעילויות · {cityItems.reduce((n,x)=>n+Number(x.participants||0),0)} משתתפים</span><button type="button" className="adm-icon-btn" aria-label="סגירה" onClick={()=>setCity("all")}><Icon name="close"/></button></div>
              {cityItems.length?cityItems.slice(-12).reverse().map((x)=><button type="button" key={x.id} className="adm-citybox__row" onClick={()=>{setSelectedDate(x.date);setCursor(new Date(`${x.date}T12:00:00`));setCalendarView("day");}}><span>{x.title}{x.branch?` · ${x.branch}`:""}</span><small>{x.date}{x.time?` · ${x.time}`:""}</small></button>):<p className="muted">אין פעילות בעיר הזאת.</p>}
            </div>
          ):null}
          <div className="adm-city-ranking">
            <div className="adm-city-ranking__head"><strong>פעילות לפי עיר</strong><span>{mapLocations.length} ערים בטווח הנבחר</span></div>
            {mapLocations.slice(0,10).map((l)=><button type="button" className={city===l.city?"is-active":""} key={l.city} onClick={()=>pickCity(l.city)}><span>{canOpenCity(l.city)?"":"🔒 "}{l.city}</span><strong>{l.count}</strong><small>{l.participants} משתתפים</small></button>)}
          </div>
        </section>
      </div>
    </div>
  );
}
