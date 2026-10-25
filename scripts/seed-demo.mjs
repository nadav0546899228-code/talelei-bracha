import { rm } from "node:fs/promises";

const file = "data/demo.json";
await rm(file, { force: true });

process.env.DATABASE_URL = "";
process.env.DATA_FILE = file;

const { createStore } = await import("../server/store.mjs");
const store = await createStore();

const P = "demo-";
const day = 86_400_000;
const dateAgo = (n) => new Date(Date.now() - n * day).toISOString().slice(0, 10);
const put = (col, id, data) => store.put(col, P + id, { ...data, demo: true });

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

const kBranches = [P+"k-zefat-a", P+"k-zefat-b", P+"k-jlm-a", P+"k-bb-a"];
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

await store.put("kollelSettings", "main", {
  fullBase: 1500,
  simchaRates: { bat: 10, ben: 30, barmitzva: 50 },
  absenceRate: 25
});

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

const bBranches=[P+"b-zefat-a",P+"b-zefat-b",P+"b-jlm-a"];
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

console.log("✅ מצב הדמו מוכן בקובץ data/demo.json");
console.log("הנתונים מבודדים ואינם נוגעים במסד הנתונים האמיתי.");
