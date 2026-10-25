/**
 * היררכיה ארגונית:
 * ארצי -> אזור -> עיר -> סניף.
 * ההרשאות מגדירות את המקסימום שהמשתמש רשאי לראות;
 * activeOrgScope רק מצמצם את התצוגה בתוך ההרשאה הקיימת.
 */
import { randomUUID } from "node:crypto";
import { isPrivileged, normalizeRoles, ROLE_SCOPE } from "./roles.mjs";

export const DOMAINS = { kollel: "כולל ערב", bnot: "בנות צילה" };
const seesAll = (user) => isPrivileged(user.roles) || user.roles.includes("chief_coordinator");

export async function loadOrg(store) {
  const units = await store.list("orgUnits", 10000);
  const sort = (a,b) => String(a.name).localeCompare(String(b.name),"he");
  return {
    regions: units.filter((u)=>u.type==="region").sort(sort),
    cities: units.filter((u)=>u.type==="city").sort(sort),
    branches: units.filter((u)=>u.type==="branch").sort(sort),
  };
}

const childrenOfRegion = (org, regionId, domain) => {
  const cityIds = new Set(org.cities.filter((c)=>c.domain===domain && c.parentId===regionId).map((c)=>c.id));
  return org.branches.filter((b)=>b.domain===domain && cityIds.has(b.parentId));
};
const childrenOfCity = (org, cityId, domain) => org.branches.filter((b)=>b.domain===domain && b.parentId===cityId);

export function regionScope(user, org, domain) {
  if (seesAll(user)) return null;
  const out = new Set();
  const s = user.scope?.[domain] || {};
  if (user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain && ROLE_SCOPE[r]?.level==="region") && s.regionId) out.add(s.regionId);
  if (user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain && ROLE_SCOPE[r]?.level==="city") && s.cityId) {
    const c=org.cities.find((x)=>x.id===s.cityId&&x.domain===domain);
    if(c?.parentId) out.add(c.parentId);
  }
  if (user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain && ROLE_SCOPE[r]?.level==="branch") && s.branchId) {
    const b=org.branches.find((x)=>x.id===s.branchId&&x.domain===domain);
    const c=b?org.cities.find((x)=>x.id===b.parentId):null;
    if(c?.parentId) out.add(c.parentId);
  }
  return out;
}

export function cityScope(user, orgOrDomain, maybeDomain) {
  // תאימות לקריאות הישנות cityScope(user, domain) כאשר אין org.
  if (typeof orgOrDomain === "string") {
    const domain=orgOrDomain;
    if (seesAll(user)) return null;
    const s=user.scope?.[domain]||{};
    return new Set(user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain&&ROLE_SCOPE[r]?.level==="city")&&s.cityId?[s.cityId]:[]);
  }
  const org=orgOrDomain, domain=maybeDomain;
  if (seesAll(user)) return null;
  const out=new Set();
  const s=user.scope?.[domain]||{};
  if(user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain&&ROLE_SCOPE[r]?.level==="region")&&s.regionId){
    for(const c of org.cities) if(c.domain===domain&&c.parentId===s.regionId) out.add(c.id);
  }
  if(user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain&&ROLE_SCOPE[r]?.level==="city")&&s.cityId) out.add(s.cityId);
  if(user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain&&ROLE_SCOPE[r]?.level==="branch")&&s.branchId){
    const b=org.branches.find((x)=>x.id===s.branchId&&x.domain===domain); if(b) out.add(b.parentId);
  }
  return out;
}

export function baseBranchScope(user, org, domain) {
  if (seesAll(user)) return null;
  const out=new Set();
  const s=user.scope?.[domain]||{};
  if(user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain&&ROLE_SCOPE[r]?.level==="region")&&s.regionId){
    for(const b of childrenOfRegion(org,s.regionId,domain)) out.add(b.id);
  }
  if(user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain&&ROLE_SCOPE[r]?.level==="city")&&s.cityId){
    for(const b of childrenOfCity(org,s.cityId,domain)) out.add(b.id);
  }
  if(user.roles.some((r)=>ROLE_SCOPE[r]?.domain===domain&&ROLE_SCOPE[r]?.level==="branch")&&s.branchId) out.add(s.branchId);
  return out;
}

function selectedBranchScope(user,org,domain){
  const sel=user.activeOrgScope?.[domain];
  if(!sel?.id||!["region","city","branch"].includes(sel.level)) return null;
  let rows=[];
  if(sel.level==="region") rows=childrenOfRegion(org,sel.id,domain);
  if(sel.level==="city") rows=childrenOfCity(org,sel.id,domain);
  if(sel.level==="branch"){
    const b=org.branches.find((x)=>x.id===sel.id&&x.domain===domain); rows=b?[b]:[];
  }
  const selected=new Set(rows.map((b)=>b.id));
  const base=baseBranchScope(user,org,domain);
  if(base===null) return selected;
  // בחירה תקפה רק אם כולה בתוך ההרשאה. אחרת מתעלמים ממנה.
  if([...selected].some((id)=>!base.has(id))) return null;
  return selected;
}

export function branchScope(user, org, domain) {
  const base=baseBranchScope(user,org,domain);
  const selected=selectedBranchScope(user,org,domain);
  if(selected===null) return base;
  if(base===null) return selected;
  return new Set([...base].filter((id)=>selected.has(id)));
}

function unitAllowedForUser(user,org,domain,level,id){
  if(seesAll(user)) return true;
  if(level==="region"){
    const rs=regionScope(user,org,domain); return rs?.has(id)||false;
  }
  if(level==="city"){
    const cs=cityScope(user,org,domain); return cs?.has(id)||false;
  }
  const bs=baseBranchScope(user,org,domain); return bs?.has(id)||false;
}

export function canAssignScope(grantor, org, roles, scope) {
  if(seesAll(grantor)) return true;
  for(const r of roles){
    const rs=ROLE_SCOPE[r]; if(!rs) continue;
    const target=scope?.[rs.domain]||{};
    const id=rs.level==="region"?target.regionId:rs.level==="city"?target.cityId:target.branchId;
    if(!id||!unitAllowedForUser(grantor,org,rs.domain,rs.level,id)) return false;
    // רק מי שמעל הרמה רשאי למנות אותה.
    if(rs.level==="region") return false;
    if(rs.level==="city" && !grantor.roles.some((x)=>ROLE_SCOPE[x]?.domain===rs.domain&&ROLE_SCOPE[x]?.level==="region")) return false;
  }
  return true;
}

export function cleanScope(roles, scope, org) {
  const out={};
  for(const r of roles){
    const rs=ROLE_SCOPE[r]; if(!rs) continue;
    const s=scope?.[rs.domain]||{};
    out[rs.domain]=out[rs.domain]||{};
    if(rs.level==="region"&&org.regions.some((x)=>x.id===s.regionId&&x.domain===rs.domain)) out[rs.domain].regionId=s.regionId;
    if(rs.level==="city"&&org.cities.some((x)=>x.id===s.cityId&&x.domain===rs.domain)) out[rs.domain].cityId=s.cityId;
    if(rs.level==="branch"&&org.branches.some((x)=>x.id===s.branchId&&x.domain===rs.domain)) out[rs.domain].branchId=s.branchId;
  }
  return out;
}

function visibleOrgFor(user,org,domain){
  if(seesAll(user)) return {
    regions:org.regions.filter((x)=>x.domain===domain),
    cities:org.cities.filter((x)=>x.domain===domain),
    branches:org.branches.filter((x)=>x.domain===domain),
  };
  const bs=baseBranchScope(user,org,domain)||new Set();
  const branches=org.branches.filter((b)=>b.domain===domain&&bs.has(b.id));
  const cityIds=new Set(branches.map((b)=>b.parentId));
  const cities=org.cities.filter((c)=>c.domain===domain&&cityIds.has(c.id));
  const regionIds=new Set(cities.map((c)=>c.parentId).filter(Boolean));
  const regions=org.regions.filter((r)=>r.domain===domain&&regionIds.has(r.id));
  return {regions,cities,branches};
}

export async function handleOrg(req,res,url,ctx){
  const {pathname}=url;
  if(!pathname.startsWith("/api/org")) return false;
  const {user,send,store,readBody,audit,clean}=ctx;
  const method=req.method||"GET";
  const allowed=["kollel","org","isha","broadcast","users","smart","activity"].some((v)=>user.views.includes(v));
  if(!allowed) return send(403,{error:"אין הרשאה"}),true;
  const org=await loadOrg(store);

  if(pathname==="/api/org"&&method==="GET"){
    const people=[];
    const push=(id,d,kind)=>{
      const roles=normalizeRoles(d.roles).filter((r)=>ROLE_SCOPE[r]||r==="chief_coordinator");
      if(!roles.length||d.active===false) return;
      people.push({id,kind,name:d.name||"",phone:d.phone||"",email:kind==="google"?id:"",roles,scope:d.scope||{}});
    };
    for(const d of await store.list("users")) push(d.id,d,"google");
    for(const d of await store.list("phoneUsers")) push(`phone:${d.id}`,d,"phone");
    if(seesAll(user)) return send(200,{...org,people,domains:DOMAINS}),true;
    const a=visibleOrgFor(user,org,"kollel"), b=visibleOrgFor(user,org,"bnot");
    const regions=[...a.regions,...b.regions],cities=[...a.cities,...b.cities],branches=[...a.branches,...b.branches];
    const rIds=new Set(regions.map((x)=>x.id)),cIds=new Set(cities.map((x)=>x.id)),bIds=new Set(branches.map((x)=>x.id));
    const mine=people.filter((p)=>Object.values(p.scope||{}).some((s)=>rIds.has(s?.regionId)||cIds.has(s?.cityId)||bIds.has(s?.branchId)));
    return send(200,{regions,cities,branches,people:mine,domains:DOMAINS}),true;
  }

  if(pathname==="/api/org/units"&&method==="POST"){
    const b=await readBody(req);
    const type=["region","city","branch"].includes(String(b.type))?String(b.type):"branch";
    const domain=DOMAINS[b.domain]?b.domain:"kollel";
    const name=clean(b.name,80).trim();
    if(!name) return send(400,{error:"חסר שם"}),true;
    let parentId=null;
    if(type==="city"){
      const region=org.regions.find((x)=>x.id===b.parentId&&x.domain===domain);
      if(!region) return send(400,{error:"יש לבחור אזור"}),true;
      parentId=region.id;
    }
    if(type==="branch"){
      const city=org.cities.find((x)=>x.id===b.parentId&&x.domain===domain);
      if(!city) return send(400,{error:"יש לבחור עיר"}),true;
      parentId=city.id;
    }
    if(type==="region"&&!seesAll(user)) return send(403,{error:"הוספת אזור - רכז ארצי, מנכ״ל או מתכנת בלבד"}),true;
    if(type==="city"&&!unitAllowedForUser(user,org,domain,"region",parentId)) return send(403,{error:"אפשר להוסיף עיר רק באזור שבאחריותך"}),true;
    if(type==="branch"&&!unitAllowedForUser(user,org,domain,"city",parentId)) return send(403,{error:"אפשר להוסיף סניף רק בעיר שבאחריותך"}),true;

    const id=b.id?String(b.id):randomUUID();
    const prev=await store.get("orgUnits",id);
    if(prev&&!unitAllowedForUser(user,org,prev.domain,prev.type,prev.id)) return send(403,{error:"אין הרשאה"}),true;
    await store.put("orgUnits",id,{type,domain,name,parentId});
    const label=type==="region"?"אזור":type==="city"?"עיר":"סניף";
    await audit(user,prev?"עדכון יחידה במבנה":`הוספת ${label}`,`${DOMAINS[domain]} · ${name}`);
    return send(200,{ok:true,id}),true;
  }

  const del=pathname.match(/^\/api\/org\/units\/([\w-]+)$/);
  if(del&&method==="DELETE"){
    if(!seesAll(user)) return send(403,{error:"מחיקה - רכז ארצי, מנכ״ל או מתכנת בלבד"}),true;
    const unit=await store.get("orgUnits",del[1]);
    if(!unit) return send(404,{error:"לא נמצא"}),true;
    const children=[...org.regions,...org.cities,...org.branches].filter((x)=>x.parentId===unit.id);
    if(children.length) return send(400,{error:"יש תחת היחידה רשומות פעילות. יש להעביר או למחוק אותן קודם."}),true;
    if(unit.type==="branch"){
      if((await store.list("avrechim")).some((a)=>a.branchId===unit.id&&a.active!==false)) return send(400,{error:"יש בסניף אברכים פעילים. יש להעביר אותם קודם."}),true;
      if((await store.list("bnotMembers")).some((a)=>a.branchId===unit.id&&a.active!==false)) return send(400,{error:"יש בסניף משתתפות פעילות. יש להעביר אותן קודם."}),true;
    }
    await store.del("orgUnits",unit.id);
    await audit(user,`מחיקת ${unit.type==="region"?"אזור":unit.type==="city"?"עיר":"סניף"}`,unit.name);
    return send(200,{ok:true}),true;
  }
  return send(404,{error:"לא נמצא"}),true;
}
