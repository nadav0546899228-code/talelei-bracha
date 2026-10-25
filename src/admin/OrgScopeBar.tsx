import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { type Domain, type Me } from "./api";
import { useOrg } from "./org";
import type { Mode } from "./nav";

type Active = Partial<Record<Domain,{level:"region"|"city"|"branch";id:string}>>;

function readActive():Active{
  try{return JSON.parse(localStorage.getItem("tb-active-org-scope")||"{}") as Active;}catch{return {};}
}
function saveActive(v:Active){
  try{localStorage.setItem("tb-active-org-scope",JSON.stringify(v));}catch{/* מקומי בלבד */}
  window.location.reload();
}

export function OrgScopeBar({me,mode}:{me:Me;mode:Mode}){
  const {org}=useOrg();
  const domain:Domain=mode==="boys"?"kollel":"bnot";
  const [active,setActive]=useState<Active>(()=>readActive());
  useEffect(()=>{setActive(readActive());},[domain]);
  const current=active[domain];
  const regions=useMemo(()=>(org?.regions||[]).filter((x)=>x.domain===domain),[org,domain]);
  const cities=useMemo(()=>(org?.cities||[]).filter((x)=>x.domain===domain),[org,domain]);
  const branches=useMemo(()=>(org?.branches||[]).filter((x)=>x.domain===domain),[org,domain]);

  const selectedRegionId=current?.level==="region"?current.id:
    current?.level==="city"?cities.find((x)=>x.id===current.id)?.parentId||"":
    current?.level==="branch"?(()=>{
      const b=branches.find((x)=>x.id===current.id);const c=b?cities.find((x)=>x.id===b.parentId):null;return c?.parentId||"";
    })():"";
  const selectedCityId=current?.level==="city"?current.id:
    current?.level==="branch"?branches.find((x)=>x.id===current.id)?.parentId||"":"";
  const selectedBranchId=current?.level==="branch"?current.id:"";

  const canNational=me.user.roles.some((r)=>["developer","ceo","chief_coordinator"].includes(r));
  // מאיזו רמה מותר לבחור: רק מהרמה של המשתמש ומטה (רכז עיר - רק סניפים בעיר שלו וכו׳)
  const myScope=me.user.scope?.[domain]||{};
  const roleLevel=canNational?"national":
    me.user.roles.includes(`${domain}_region` as never)&&myScope.regionId?"region":
    me.user.roles.includes(`${domain}_city` as never)&&myScope.cityId?"city":"none";
  const set=(next:Active[Domain]|undefined)=>{
    const all={...active};
    if(next) all[domain]=next; else delete all[domain];
    setActive(all);saveActive(all);
  };
  if(!org||(!regions.length&&!cities.length&&!branches.length)) return null;
  // מנהל/ת סניף, טלפנית ושאר התפקידים בלי רמה מעל - אין מה לבחור
  if(roleLevel==="none") return null;

  if(roleLevel!=="national"){
    const fixedRegionId=roleLevel==="region"?String(myScope.regionId):"";
    const fixedCityId=roleLevel==="city"?String(myScope.cityId):"";
    const topName=roleLevel==="region"?regions.find((x)=>x.id===fixedRegionId)?.name||"האזור שלי":cities.find((x)=>x.id===fixedCityId)?.name||"העיר שלי";
    const cityVal=roleLevel==="city"?fixedCityId:selectedCityId;
    return <div className="adm-orgscope" aria-label="רמת הצפייה במערכת">
      <span className="adm-orgscope__label"><Icon name="grid"/><span>רמת צפייה</span></span>
      <div className="adm-orgscope__crumbs">
        <button type="button" className={!current?"is-active":""} onClick={()=>set(undefined)}>
          <Icon name="pin"/>{topName}
        </button>
        {roleLevel==="region"?<>
          <Icon name="arrowLeft" className="adm-orgscope__sep"/>
          <select className={selectedCityId?"is-active":""} aria-label="עיר" value={selectedCityId}
            onChange={(e)=>set(e.target.value?{level:"city",id:e.target.value}:undefined)}>
            <option value="">עיר</option>
            {cities.filter((x)=>x.parentId===fixedRegionId).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </>:null}
        <Icon name="arrowLeft" className="adm-orgscope__sep"/>
        <select className={selectedBranchId?"is-active":""} aria-label="סניף" value={selectedBranchId} disabled={!cityVal}
          onChange={(e)=>set(e.target.value?{level:"branch",id:e.target.value}:roleLevel==="region"&&cityVal?{level:"city",id:cityVal}:undefined)}>
          <option value="">סניף</option>
          {branches.filter((x)=>x.parentId===cityVal).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
    </div>;
  }

  return <div className="adm-orgscope" aria-label="רמת הצפייה במערכת">
    <span className="adm-orgscope__label"><Icon name="grid"/><span>רמת צפייה</span></span>
    <div className="adm-orgscope__crumbs">
      <button type="button" className={!current?"is-active":""} onClick={()=>set(undefined)}>
        <Icon name="globe"/>{canNational?"ארצי":"כל תחום האחריות"}
      </button>
      <Icon name="arrowLeft" className="adm-orgscope__sep"/>
      <select
        className={selectedRegionId?"is-active":""}
        aria-label="אזור"
        value={selectedRegionId}
        onChange={(e)=>set(e.target.value?{level:"region",id:e.target.value}:undefined)}
      >
        <option value="">אזור</option>
        {regions.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <Icon name="arrowLeft" className="adm-orgscope__sep"/>
      <select
        className={selectedCityId?"is-active":""}
        aria-label="עיר"
        value={selectedCityId}
        disabled={!selectedRegionId}
        onChange={(e)=>set(e.target.value?{level:"city",id:e.target.value}:selectedRegionId?{level:"region",id:selectedRegionId}:undefined)}
      >
        <option value="">עיר</option>
        {cities.filter((x)=>!selectedRegionId||x.parentId===selectedRegionId).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <Icon name="arrowLeft" className="adm-orgscope__sep"/>
      <select
        className={selectedBranchId?"is-active":""}
        aria-label="סניף"
        value={selectedBranchId}
        disabled={!selectedCityId}
        onChange={(e)=>set(e.target.value?{level:"branch",id:e.target.value}:selectedCityId?{level:"city",id:selectedCityId}:undefined)}
      >
        <option value="">סניף</option>
        {branches.filter((x)=>!selectedCityId||x.parentId===selectedCityId).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </div>
  </div>;
}
