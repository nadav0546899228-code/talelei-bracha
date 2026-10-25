import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { api, type View } from "../api";
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
const heDay = (iso:string) => new Intl.DateTimeFormat("he-IL",{weekday:"long",day:"numeric",month:"long"}).format(new Date(`${iso}T12:00:00`));
const monthTitle = (d:Date) => new Intl.DateTimeFormat("he-IL",{month:"long",year:"numeric"}).format(d);
const sourceIcon = (s:ActivityItem["source"]): IconName => s==="challah" ? "wheat" : s==="kollelStudy" || s==="scheduledLesson" ? "book" : s==="siteEvent" ? "globe" : "users";
const sourceClass = (s:ActivityItem["source"]) => s==="challah" ? "challah" : s==="kollelStudy" || s==="scheduledLesson" ? "kollel" : s==="siteEvent" ? "site" : "bnot";

function monthCells(cursor: Date) {
  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1,12);
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
  const [range,setRange]=useState<"month"|"week"|"today">("month");

  const load=useCallback(()=>{
    const from=addDays(todayIso(),-75);
    const to=addDays(todayIso(),120);
    return api<Data>(`/api/activity-center?from=${from}&to=${to}`).then(setData).catch((e)=>setErr(e.message));
  },[]);
  useEffect(()=>{load();},[load]);
  useLive(["bnotActivities","challahEvents","kollelAttendance","content","orgUnits"],load);

  const filtered=useMemo(()=>{
    if(!data) return [];
    const today=todayIso();
    const weekEnd=addDays(today,6);
    const monthPrefix=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}`;
    return data.items.filter((x)=>{
      if(domain!=="all"&&x.domain!==domain) return false;
      if(source!=="all"&&x.source!==source) return false;
      if(city!=="all"&&x.city!==city) return false;
      if(range==="today"&&x.date!==today) return false;
      if(range==="week"&&(x.date<today||x.date>weekEnd)) return false;
      if(range==="month"&&!x.date.startsWith(monthPrefix)) return false;
      return true;
    });
  },[data,domain,source,city,range,cursor]);

  const dayItems=useMemo(()=>filtered.filter((x)=>x.date===selectedDate).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99")), [filtered,selectedDate]);
  const cells=useMemo(()=>monthCells(cursor),[cursor]);
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

  const moveMonth=(n:number)=>{
    const d=new Date(cursor);d.setMonth(d.getMonth()+n);setCursor(d);
    const first=dayIso(new Date(d.getFullYear(),d.getMonth(),1,12));setSelectedDate(first);setRange("month");
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

      <div className="adm-activity-filters">
        <div className="adm-segmented">
          <button type="button" aria-pressed={range==="today"} onClick={()=>{setRange("today");setSelectedDate(todayIso());}}>היום</button>
          <button type="button" aria-pressed={range==="week"} onClick={()=>{setRange("week");setSelectedDate(todayIso());}}>השבוע</button>
          <button type="button" aria-pressed={range==="month"} onClick={()=>setRange("month")}>חודש</button>
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
          <div className="adm-panel__head">
            <button type="button" className="adm-icon-btn" onClick={()=>moveMonth(-1)} aria-label="חודש קודם"><Icon name="arrowRight"/></button>
            <h2>{monthTitle(cursor)}</h2>
            <button type="button" className="adm-icon-btn" onClick={()=>moveMonth(1)} aria-label="חודש הבא"><Icon name="arrowLeft"/></button>
          </div>
          <div className="adm-calendar-weekdays">{["א","ב","ג","ד","ה","ו","ש"].map((x)=><span key={x}>{x}</span>)}</div>
          <div className="adm-calendar-grid">
            {cells.map((d)=>{
              const iso=dayIso(d);const items=dayCounts.get(iso)||[];const inMonth=d.getMonth()===cursor.getMonth();
              return <button type="button" key={iso} className={`adm-calendar-day${selectedDate===iso?" is-selected":""}${iso===todayIso()?" is-today":""}${!inMonth?" is-out":""}`} onClick={()=>setSelectedDate(iso)}>
                <span>{d.getDate()}</span>
                {items.length?<strong>{items.length}</strong>:null}
                {items.length?<i className={items.some((x)=>x.domain==="bnot")&&items.some((x)=>x.domain==="kollel")?"is-mixed":items[0].domain==="bnot"?"is-bnot":"is-kollel"}/>:null}
              </button>;
            })}
          </div>
        </section>

        <section className="adm-panel adm-day-panel">
          <div className="adm-panel__head"><div><span className="adm-eyebrow">ציר שעות</span><h2>{heDay(selectedDate)}</h2></div><span className="adm-section-count">{dayItems.length}</span></div>
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
