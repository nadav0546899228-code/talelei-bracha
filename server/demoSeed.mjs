/**
 * נתוני דמה לאתר הפיתוח בלבד (לא נוגעים במסד האמיתי של האתר המפורסם).
 * כל הרשומות מסומנות demo: true ומזהה שמתחיל ב-"demo-".
 */
import { hashCode } from "./phoneAuth.mjs";

export async function seedDemo(store) {
  const P = "demo-";
  const day = 86_400_000;
  const dateAgo = (n) => new Date(Date.now() - n * day).toISOString().slice(0, 10);
  const put = (col, id, data) => store.put(col, P + id, { ...data, demo: true });
  const putBatch = async (jobs, size = 40) => {
    for (let i = 0; i < jobs.length; i += size) {
      await Promise.all(jobs.slice(i, i + size).map(([col, id, data]) => put(col, id, data)));
    }
  };

  const org = [
    ["k-city-zefat", { type: "city", domain: "kollel", name: "צפת", parentId: null }],
    ["k-city-jlm", { type: "city", domain: "kollel", name: "ירושלים", parentId: null }],
    ["k-city-bb", { type: "city", domain: "kollel", name: "בני ברק", parentId: null }],
    ["k-zefat-a", { type: "branch", domain: "kollel", name: "מרכז", parentId: P+"k-city-zefat" }],
    ["k-zefat-b", { type: "branch", domain: "kollel", name: "דרום", parentId: P+"k-city-zefat" }],
    ["k-jlm-a", { type: "branch", domain: "kollel", name: "צפון", parentId: P+"k-city-jlm" }],
    ["k-bb-a", { type: "branch", domain: "kollel", name: "מרכז", parentId: P+"k-city-bb" }],
    ["b-city-zefat", { type: "city", domain: "bnot", name: "צפת", parentId: null }],
    ["b-city-jlm", { type: "city", domain: "bnot", name: "ירושלים", parentId: null }],
    ["b-zefat-a", { type: "branch", domain: "bnot", name: "מרכז", parentId: P+"b-city-zefat" }],
    ["b-zefat-b", { type: "branch", domain: "bnot", name: "דרום", parentId: P+"b-city-zefat" }],
    ["b-jlm-a", { type: "branch", domain: "bnot", name: "צפון", parentId: P+"b-city-jlm" }],
  ];
  for (const [id, data] of org) await put("orgUnits", id, data);

  let kBranches = [P+"k-zefat-a", P+"k-zefat-b", P+"k-jlm-a", P+"k-bb-a"];
  const avNames = [
    "ישראל כהן","משה לוי","יעקב פרידמן","אברהם מזרחי","דוד ביטון","יוסף מלכה",
    "אליהו שלום","שמואל דיין","מאיר כהן","חיים לוי","בנימין אוחיון","נתנאל פרץ",
    "אהרן ישראלי","יצחק סגל","מרדכי חדד","שלמה בן דוד","יהודה אזולאי","רפאל אמסלם",
    "נחמן ועקנין","אריאל גבאי","עמיחי דיין","הלל כהן","אלחנן לוי","אבישי פרץ"
  ];
  const avIds = [];
  for (let i = 0; i < avNames.length; i++) {
    const raw = "av-"+String(i+1).padStart(2,"0");
    const id = P+raw;
    avIds.push(id);
    await put("avrechim", raw, {
      name: avNames[i]+" (דמה)",
      phone: i%7===0 ? "" : "050000"+String(i+1).padStart(4,"0"),
      email: "demo"+(i+1)+"@example.invalid",
      branchId: kBranches[i%kBranches.length],
      monthlyTravel: [0,80,120,150,200][i%5],
      inPayroll: true,
      simchaFund: i%6!==0,
      simchaExternal: false,
      active: i!==22,
      notes: i%8===0 ? "הערת דמה לצורך בדיקת תצוגה" : ""
    });
  }

  // הגדרות - רק אם עדיין אין (לא דורסים הגדרות אמיתיות)
  if (!(await store.get("kollelSettings", "main"))) {
    await store.put("kollelSettings", "main", { fullBase: 1500, simchaRates: { bat: 10, ben: 30, barmitzva: 50 }, absenceRate: 0 });
  }

  const rows = (rate) => Object.fromEntries(avIds.map((id,i)=>[id,{
    base: i%9===0 ? 1200 : null,
    travel: null,
    confirmed: i/avIds.length < rate,
    note: i%11===0 ? "בדיקה חודשית" : ""
  }]));

  const months = [
    ["cheshvan", "חשוון תשפ״ז", Date.now(), false, .65],
    ["tishrei", "תשרי תשפ״ז", Date.now()-31*day, true, 1],
    ["elul", "אלול תשפ״ו", Date.now()-62*day, true, 1],
  ];
  for (const [raw,label,order,locked,rate] of months) {
    await put("kollelMonths", raw, {
      label, order, rows: rows(rate), extraIds: [],
      simchas: raw==="cheshvan" ? [{ id:P+"simcha-1", celebrantId:avIds[3], type:"ben", note:"הולדת הבן" }] : [],
      locked, notes:""
    });
  }
  const monthId=P+"cheshvan";

  const entries = [
    [0,"travel",40,"נסיעה חריגה"],[1,"expense",85,"ציוד לשיעור"],[3,"bonus",120,"תוספת"],
    [4,"deduction",-50,"קיזוז"],[6,"expense",160,"כיבוד"],[9,"travel",75,"נסיעה נוספת"],[11,"grant",250,"מענק"]
  ];
  for (let i=0;i<entries.length;i++) {
    const [av,type,amount,description]=entries[i];
    await put("kollelEntries","entry-"+(i+1),{
      avrechId:avIds[av], month:monthId, type, amount, description,
      by:"demo", byName:"משתמש דמה"
    });
  }

  for (let b=0;b<kBranches.length;b++) {
    for (let m=0;m<4;m++) {
      const members=avIds.filter((_,i)=>i%kBranches.length===b);
      await put("kollelAttendance",`attendance-${b}-${m}`,{
        branchId:kBranches[b],
        date:dateAgo(3+m*7),
        month:monthId,
        present:members.filter((_,i)=>(i+m)%5!==0),
        by:"demo",
        byName:"משתמש דמה"
      });
    }
  }

  let bBranches=[P+"b-zefat-a",P+"b-zefat-b",P+"b-jlm-a"];
  // פריסה ארצית רחבה לדמו - ערים וסניפים בשני הארגונים
  const demoCities = [
    ["haifa","חיפה",32.7940,34.9896],["tiberias","טבריה",32.7959,35.5312],["afula","עפולה",32.6076,35.2896],
    ["netanya","נתניה",32.3215,34.8532],["petah","פתח תקווה",32.0840,34.8878],["telaviv","תל אביב",32.0853,34.7818],
    ["elad","אלעד",32.0522,34.9512],["modiin","מודיעין עילית",31.9322,35.0442],["beit-shemesh","בית שמש",31.7466,34.9888],
    ["beitar","ביתר עילית",31.6977,35.1158],["rehovot","רחובות",31.8948,34.8113],["ashdod","אשדוד",31.8014,34.6435],
    ["kiryat-malachi","קריית מלאכי",31.7308,34.7466],["ashkelon","אשקלון",31.6688,34.5743],["kiryat-gat","קריית גת",31.6100,34.7642],
    ["netivot","נתיבות",31.4232,34.5893],["beer-sheva","באר שבע",31.2520,34.7915],["arad","ערד",31.2589,35.2128],
  ];
  const branchNames = ["מרכז","צפון","דרום"];
  const geoJobs = [];
  const extraK = [], extraB = [];
  for (let ci = 0; ci < demoCities.length; ci++) {
    const [slug,name,lat,lng] = demoCities[ci];
    for (const domain of ["kollel","bnot"]) {
      const prefix = domain === "kollel" ? "k" : "b";
      const cityRaw = `${prefix}-city-${slug}`;
      geoJobs.push(["orgUnits", cityRaw, { type:"city", domain, name, parentId:null, lat, lng }]);
      for (let bi = 0; bi < branchNames.length; bi++) {
        const raw = `${prefix}-${slug}-${bi+1}`;
        const full = P + raw;
        geoJobs.push(["orgUnits", raw, {
          type:"branch", domain, name:branchNames[bi], parentId:P+cityRaw,
          lat:lat + (bi-1)*0.006, lng:lng + (bi-1)*0.006
        }]);
        (domain === "kollel" ? extraK : extraB).push(full);
      }
    }
  }
  await putBatch(geoJobs);
  kBranches = [...kBranches, ...extraK];
  bBranches = [...bBranches, ...extraB];

  const women=[
    "שרה לוי","רחל כהן","חני מזרחי","לאה פרץ","אסתר מלכה","מיכל ביטון",
    "תמר דיין","אביגיל חדד","נעמי ישראלי","מרים סגל","רבקה שלום","יעל גבאי",
    "שירה בן דוד","איילת אוחיון","הדסה ועקנין","אפרת אמסלם","רות פרידמן","מוריה אזולאי"
  ];
  const memberIds=[];
  for (let i=0;i<women.length;i++) {
    const raw="member-"+String(i+1).padStart(2,"0");
    memberIds.push(P+raw);
    await put("bnotMembers",raw,{
      name:women[i]+" (דמה)",
      phone:"052000"+String(i+1).padStart(4,"0"),
      branchId:bBranches[i%bBranches.length],
      active:i!==16,
      notes:i%6===0?"הערת דמה":""
    });
  }
  for (let i=0;i<6;i++) {
    const bi=i%bBranches.length;
    const mine=memberIds.filter((_,j)=>j%bBranches.length===bi);
    await put("bnotActivities","activity-"+(i+1),{
      branchId:bBranches[bi],
      date:dateAgo(i*7+2),
      title:["ערב נשים","שיעור שבועי","מפגש חיזוק"][i%3],
      present:mine.filter((_,j)=>j%4!==0),
      by:"demo",
      byName:"משתמשת דמה"
    });
  }

  const submissions=[
    ["contact","new",{name:"משפחת כהן (דמה)",phone:"0500000000",email:"contact@example.invalid",subject:"קרן טללי ברכה",message:"פניית דמה לצורך בדיקת המערכת."}],
    ["contact","in_progress",{name:"משפחת לוי (דמה)",phone:"0500000001",subject:"שיעורים ואירועים",message:"פנייה שנמצאת בטיפול."}],
    ["volunteer","new",{name:"מתנדב לדוגמה",phone:"0500000002",interest:["שיעורים ואירועים"],note:"מעוניין לסייע."}],
    ["updates","done",{name:"נרשמת לדוגמה",phone:"0500000003",topics:["שיעורים","תכני חיזוק"]}],
    ["ishaRequest","new",{name:"פונה א׳ (דמה)",phone:"0500000004",contactMethod:"שיחת טלפון",bestTime:"ערב",note:"פניית דמה בלבד."}],
    ["ishaRequest","in_progress",{name:"פונה ב׳ (דמה)",phone:"0500000005",contactMethod:"הודעת וואטסאפ",bestTime:"בוקר",note:""}],
    ["ishaMentor","approved",{fullName:"מלווה א׳ (דמה)",phone:"0500000006",community:"קהילה לדוגמה",availability:["ערב"],languages:["עברית"]}],
    ["ishaMentor","approved",{fullName:"מלווה ב׳ (דמה)",phone:"0500000007",community:"קהילה לדוגמה",availability:["בוקר","צהריים"],languages:["עברית","אנגלית"]}],
    ["ishaMentor","new",{fullName:"מלווה ג׳ (דמה)",phone:"0500000008",community:"קהילה לדוגמה",availability:["ערב"],languages:["עברית"]}]
  ];
  for (let i=0;i<submissions.length;i++) {
    const [form,status,data]=submissions[i];
    await put("submissions","submission-"+(i+1),{
      form,data,status,notes:[],assignedMentorId:null
    });
  }

  const tags=["תורם","מתנדב","קהילה","עדכונים"];
  for (let i=0;i<12;i++) {
    await put("contacts","contact-"+(i+1),{
      name:"איש קשר "+(i+1)+" (דמה)",
      phone:"053000"+String(i+1).padStart(4,"0"),
      email:"person"+(i+1)+"@example.invalid",
      tags:[tags[i%tags.length]],
      active:true
    });
  }


  // מתחזקים (כולל ערב) - כל אחד לומד עם אברך
  const kStages = ["היכרות", "לומד בחברותא", "לומד בקביעות", "מתקדם", "שומר תו״מ"];
  const men = ["אורי בן חיים", "טל אדרי", "רועי שושן", "עידן מור", "ליאור אלון", "גיא נחום", "אלון שפירא", "דור כהן", "ניר עמר", "בר גולן", "שחר טל", "עומר רז"];
  for (let i = 0; i < men.length; i++) {
    const av = avIds[i % 20];
    const bi = (i % 20) % kBranches.length;
    await put("mitchazkim", "mk-" + (i + 1), {
      domain: "kollel", name: men[i] + " (דמה)", phone: "054000" + String(i + 1).padStart(4, "0"), branchId: kBranches[bi], avrechId: av,
      mentor: "", stage: kStages[i % kStages.length], status: i === 11 ? "paused" : "active",
      nextFollowUp: i % 3 === 0 ? dateAgo(1) : null, source: ["חבר", "שיעור בבית כנסת", "שכן", "פעילות בשכונה"][i % 4], notes: "",
      startDate: dateAgo(30 + i * 9), lastContact: dateAgo(i + 2),
      log: [{ id: "l" + i, date: dateAgo(i + 2), type: "שיעור", note: "למדו גמרא, מסכת ברכות", by: "מנהל סניף (דמה)" }],
    });
  }
  // מתחזקות (בנות צילה) אחרי הפרשת חלה
  const bStages = ["השתתפה בהפרשת חלה", "בקשר", "משתתפת בפעילות", "בקשר קבוע", "שומרת תו״מ"];
  const ws = ["דנה לוי", "מורן כהן", "שני אברהם", "הילה דוד", "קרן מזרחי", "ספיר פרץ", "נועה ביטון", "רוני אלמוג", "גלית שרון", "לירון חן"];
  for (let i = 0; i < ws.length; i++) {
    await put("mitchazkim", "mb-" + (i + 1), {
      domain: "bnot", name: ws[i] + " (דמה)", phone: "055000" + String(i + 1).padStart(4, "0"), branchId: bBranches[i % bBranches.length], avrechId: null,
      mentor: ["רבקה שלום", "יעל גבאי", "שרה לוי"][i % 3] + " (דמה)", stage: bStages[i % bStages.length], status: "active",
      nextFollowUp: i % 3 === 1 ? dateAgo(2) : dateAgo(-5), source: "הפרשת חלה", notes: "",
      startDate: dateAgo(20 + i * 6), lastContact: dateAgo(i + 1),
      log: [{ id: "w" + i, date: dateAgo(i + 1), type: "שיחה", note: "שיחת המשך אחרי האירוע", by: "רכזת עיר (דמה)" }],
    });
  }
  // אירועי הפרשת חלה
  const dateAhead = (n) => new Date(Date.now() + n * day).toISOString().slice(0, 10);
  await put("challahEvents", "ch-1", {
    title: "הפרשת חלה - ערב נשים", date: dateAhead(4), time: "20:00", place: "אולם הקהילה", branchId: bBranches[0], capacity: 40, notes: "", summary: "", open: true, reminderSent: false,
    registrations: ws.slice(0, 7).map((w, i) => ({ id: "r" + i, name: w + " (דמה)", phone: "055000" + String(i + 1).padStart(4, "0"), arrived: false, at: new Date().toISOString(), mitchId: null })),
  });
  await put("challahEvents", "ch-2", {
    title: "הפרשת חלה לקראת שבת", date: dateAgo(10), time: "19:30", place: "בית משפחת כהן", branchId: bBranches[1], capacity: 0, notes: "", summary: "השתתפו 9 נשים, אווירה מרוממת. 3 ביקשו להמשיך בקשר.", open: false, reminderSent: true,
    registrations: ws.slice(3, 10).map((w, i) => ({ id: "s" + i, name: w + " (דמה)", phone: "055000" + String(i + 4).padStart(4, "0"), arrived: i < 5, at: new Date().toISOString(), mitchId: i < 3 ? P + "mb-" + (i + 4) : null })),
  });

  // -----------------------------------------------------------------
  // דמו בקנה מידה ארצי: 1000+ נשים ומתחזקים + מאות פעילויות.
  const femaleFirst = ["שרה","רחל","חני","לאה","אסתר","מיכל","תמר","אביגיל","נעמי","מרים","רבקה","יעל","שירה","איילת","הדסה","אפרת","רות","מוריה","חיה","ברכה","נחמה","אורית","תהילה","אלישבע"];
  const maleFirst = ["אורי","טל","רועי","עידן","ליאור","גיא","אלון","דור","ניר","בר","שחר","עומר","איתי","נועם","אילן","אביב","ערן","יוני","מאור","אופיר"];
  const lastNames = ["כהן","לוי","מזרחי","פרץ","מלכה","ביטון","דיין","חדד","ישראלי","סגל","שלום","גבאי","בן דוד","אוחיון","ועקנין","אמסלם","פרידמן","אזולאי","שרון","חן","אברהם","אלמקייס","דהן","בנימין","אטיאס"];
  const mkName = (firsts,i) => `${firsts[i%firsts.length]} ${lastNames[Math.floor(i/firsts.length)%lastNames.length]} (דמה ${i+1})`;
  const memberJobs = [];
  const bigMemberIds = [];
  const membersByBranch = new Map();
  for (let i=0;i<720;i++) {
    const raw=`mass-member-${String(i+1).padStart(4,"0")}`;
    const id=P+raw;
    const branchId=bBranches[(i*7+i%5)%bBranches.length];
    bigMemberIds.push(id);
    const arr=membersByBranch.get(branchId)||[];arr.push(id);membersByBranch.set(branchId,arr);
    memberJobs.push(["bnotMembers",raw,{
      name:mkName(femaleFirst,i),phone:"052"+String(7000000+i).slice(-7),branchId,active:i%37!==0,
      notes:i%19===0?"משתתפת קבועה בפעילות (דמה)":i%23===0?"הגיעה דרך חברה (דמה)":""
    }]);
  }
  await putBatch(memberJobs);

  const allAvIds=[...avIds];
  const avJobs=[];
  for(let i=0;i<180;i++){
    const raw=`mass-av-${String(i+1).padStart(4,"0")}`; const id=P+raw; allAvIds.push(id);
    avJobs.push(["avrechim",raw,{
      name:`${maleFirst[i%maleFirst.length]} ${lastNames[(i*3)%lastNames.length]} (אברך דמה)`,
      phone:"050"+String(6000000+i).slice(-7),email:`mass-av-${i+1}@example.invalid`,
      branchId:kBranches[i%kBranches.length],monthlyTravel:[0,80,120,150,200][i%5],inPayroll:true,simchaFund:i%7!==0,simchaExternal:false,active:true,notes:""
    }]);
  }
  await putBatch(avJobs);

  const massMitchJobs=[];
  const menStages=["היכרות","לומד בחברותא","לומד בקביעות","מתקדם","שומר תו״מ"];
  const womenStages=["השתתפה בהפרשת חלה","בקשר","משתתפת בפעילות","בקשר קבוע","שומרת תו״מ"];
  for(let i=0;i<210;i++){
    const branchId=kBranches[(i*5+3)%kBranches.length];
    massMitchJobs.push(["mitchazkim",`mass-mk-${String(i+1).padStart(4,"0")}`,{
      domain:"kollel",name:mkName(maleFirst,i),phone:"054"+String(5000000+i).slice(-7),branchId,avrechId:allAvIds[i%allAvIds.length],
      mentor:"",stage:menStages[i%menStages.length],status:i%29===0?"paused":"active",
      nextFollowUp:i%4===0?dateAgo(i%5):dateAhead(2+i%12),source:["חבר","שיעור בבית כנסת","שכן","פעילות שכונתית","מודעה"][i%5],notes:"",
      startDate:dateAgo(20+i%240),lastContact:dateAgo(i%17+1),
      log:[{id:`mm-${i}`,date:dateAgo(i%17+1),type:["שיחה","שיעור","וואטסאפ"][i%3],note:"מעקב דמה לצורך תמונת מצב",by:"צוות דמה"}]
    }]);
  }
  for(let i=0;i<210;i++){
    const branchId=bBranches[(i*11+2)%bBranches.length];
    massMitchJobs.push(["mitchazkim",`mass-mb-${String(i+1).padStart(4,"0")}`,{
      domain:"bnot",name:mkName(femaleFirst,i+800),phone:"055"+String(4000000+i).slice(-7),branchId,avrechId:null,
      mentor:mkName(femaleFirst,i%60),stage:womenStages[i%womenStages.length],status:i%31===0?"paused":"active",
      nextFollowUp:i%3===0?dateAgo(i%4):dateAhead(1+i%10),source:["הפרשת חלה","ערב נשים","חברה","שיעור","אישה לאישה"][i%5],notes:"",
      startDate:dateAgo(15+i%190),lastContact:dateAgo(i%13+1),
      log:[{id:`mw-${i}`,date:dateAgo(i%13+1),type:["שיחה","פעילות","וואטסאפ"][i%3],note:"עדכון המשך דמה",by:"רכזת דמה"}]
    }]);
  }
  await putBatch(massMitchJobs);

  const times=["09:30","11:00","17:30","18:30","19:30","20:00","20:30","21:00"];
  const places=["בית הכנסת המרכזי","אולם הקהילה","מרכז קהילתי","בית מדרש","בית משפחת כהן","מועדון נשים","אולם הסניף"];
  const titles=["שיעור שבועי","ערב נשים","מפגש חיזוק","סדנת בית יהודי","שיעור אמונה","מפגש קהילתי","ערב הפרשת חלה והכנה"];
  const actJobs=[];
  for(let i=0;i<260;i++){
    const branchId=bBranches[(i*13+7)%bBranches.length];
    const mine=membersByBranch.get(branchId)||bigMemberIds.filter((_,j)=>j%17===i%17).slice(0,18);
    const offset=(i%91)-35;
    actJobs.push(["bnotActivities",`mass-activity-${String(i+1).padStart(4,"0")}`,{
      branchId,date:dateAhead(offset),time:times[i%times.length],place:places[i%places.length],address:"",
      title:titles[i%titles.length],present:mine.filter((_,j)=>(j+i)%5!==0).slice(0,28),by:"demo",byName:"רכזת דמה"
    }]);
  }
  await putBatch(actJobs);

  const challahJobs=[];
  for(let i=0;i<90;i++){
    const branchId=bBranches[(i*9+4)%bBranches.length];
    const names=Array.from({length:8+(i%18)},(_,j)=>mkName(femaleFirst,i*7+j));
    challahJobs.push(["challahEvents",`mass-ch-${String(i+1).padStart(4,"0")}`,{
      title:["הפרשת חלה - ערב נשים","הפרשת חלה וחיזוק","הפרשת חלה קהילתית"][i%3],
      date:dateAhead((i%75)-20),time:times[(i+4)%times.length],place:places[(i+2)%places.length],address:"",
      branchId,capacity:20+(i%5)*10,notes:"",summary:i%4===0?"אירוע דמה עם השתתפות יפה.":"",open:i%3!==0,reminderSent:false,
      registrations:names.map((name,j)=>({id:`mr-${i}-${j}`,name,phone:"055"+String(3000000+i*30+j).slice(-7),arrived:j%5!==0,at:new Date().toISOString(),mitchId:null}))
    }]);
  }
  await putBatch(challahJobs);

  const attendanceJobs=[];
  for(let i=0;i<220;i++){
    const branchId=kBranches[(i*7+5)%kBranches.length];
    const mine=allAvIds.filter((_,j)=>j%kBranches.length===((i*7+5)%kBranches.length)).slice(0,20);
    attendanceJobs.push(["kollelAttendance",`mass-att-${String(i+1).padStart(4,"0")}`,{
      branchId,date:dateAgo(i%70),time:["19:45","20:00","20:15","20:30"][i%4],place:"בית המדרש",month:monthId,
      present:mine.filter((_,j)=>(j+i)%6!==0),by:"demo",byName:"מנהל סניף דמה"
    }]);
  }
  await putBatch(attendanceJobs);

  // אנשי צוות לדוגמה - כניסה בטלפון וקוד 1234
  const staff = [
    ["staff-chief", "רכז ראשי (דמה)", "0500000100", ["chief_coordinator"], {}],
    ["staff-kcity", "רכז עיר צפת (דמה)", "0500000101", ["kollel_city"], { kollel: { cityId: P + "k-city-zefat" } }],
    ["staff-kbranch", "מנהל סניף מרכז צפת (דמה)", "0500000102", ["kollel_branch"], { kollel: { branchId: P + "k-zefat-a" } }],
    ["staff-bcity", "רכזת עיר צפת (דמה)", "0500000103", ["bnot_city"], { bnot: { cityId: P + "b-city-zefat" } }],
    ["staff-bbranch", "מנהלת סניף מרכז צפת (דמה)", "0500000104", ["bnot_branch"], { bnot: { branchId: P + "b-zefat-a" } }],
  ];
  for (const [raw, name, phone, roles, scope] of staff) {
    await put("phoneUsers", raw, { name, phone, roles, scope, active: true, codeHash: hashCode("1234"), mustChangeCode: false });
  }
  await put("messages", "msg-1", {
    from: "phone:" + P + "staff-kbranch",
    fromName: "מנהל סניף מרכז צפת (דמה)",
    to: ["0542577001c@gmail.com", "nadav0546899228@gmail.com"],
    toNames: ["מנכ״ל", "מתכנת"],
    text: "שלום, השבוע היו 2 אברכים חסרים במפגש של יום שלישי. הודעת דמה לבדיקה.",
    replyTo: null,
    readBy: [],
    deletedBy: [],
  });
}

/** מחיקת נתוני הדמה בלבד (כל מזהה שמתחיל ב-demo-). נתונים אמיתיים לא נמחקים */
export async function clearDemo(store, collections) {
  let n = 0;
  for (const c of collections) {
    for (const d of await store.list(c, 100000)) {
      if (String(d.id).startsWith("demo-") || d.demo === true) {
        await store.del(c, d.id);
        n++;
      }
    }
  }
  return n;
}
