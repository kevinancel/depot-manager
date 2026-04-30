import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://giiiztadiyrrcczzgofv.supabase.co",
  "sb_publishable_MQjJb7Wm7TrszeIW09F6bQ_4ATRbOL1"
);

const TARIFS = {
  passage_quai_small: 20, passage_quai_large: 65,
  cross_dock_entree: 4, cross_dock_sortie: 4,
  stockage_court: 1.0, stockage_long: 0.70,
  depotage_vrac: 1.17, palettisation: 20, free_days: 3,
};

const CLIENTS_INIT = [
  { nom: "ARES", tva: false }, { nom: "RTP", tva: true },
  { nom: "TALAY", tva: true }, { nom: "SGS", tva: true },
  { nom: "SEL", tva: true }, { nom: "VIPSPED", tva: false },
  { nom: "TALORIA", tva: false }, { nom: "XPO", tva: true },
];

const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function today() { return new Date().toISOString().slice(0,10); }
function daysBetween(a,b) { return Math.max(0,Math.round((new Date(b)-new Date(a))/86400000)); }
function getMoisAnnee(date) { const d=new Date(date); return {mois:d.getMonth(),annee:d.getFullYear()}; }

function calcStockage(palettes,dateEntree,dateSortie) {
  const joursTotal=Math.max(0,daysBetween(dateEntree,dateSortie)-2);
  const joursFactures=Math.max(0,joursTotal-TARIFS.free_days);
  if(joursFactures===0) return {jours:joursTotal,joursFactures,montant:0};
  const taux=joursFactures<=10?TARIFS.stockage_court:TARIFS.stockage_long;
  return {jours:joursTotal,joursFactures,taux,montant:palettes*joursFactures*taux};
}

function genFacture(dossier,clients) {
  const clientObj=clients.find(c=>c.nom===dossier.client)||{tva:true};
  const avecTVA=clientObj.tva;
  const lignes=[]; let total=0;
  const totalPal=dossier.mouvements.reduce((s,m)=>s+(m.type==="entree"?m.palettes:0),0);
  const prixQuai=totalPal>=15?TARIFS.passage_quai_large:TARIFS.passage_quai_small;
  lignes.push({desc:"Passage à quai ("+totalPal+" pal.)",qty:1,pu:prixQuai,total:prixQuai}); total+=prixQuai;
  dossier.mouvements.filter(m=>m.type==="entree").forEach(m=>{const mt=m.palettes*TARIFS.cross_dock_entree;lignes.push({desc:"Cross dock entrée — "+m.date+" ("+m.palettes+" pal.)",qty:m.palettes,pu:TARIFS.cross_dock_entree,total:mt});total+=mt;});
  dossier.mouvements.filter(m=>m.type==="sortie").forEach(m=>{const mt=m.palettes*TARIFS.cross_dock_sortie;lignes.push({desc:"Cross dock sortie — "+m.date+" ("+m.palettes+" pal.)",qty:m.palettes,pu:TARIFS.cross_dock_sortie,total:mt});total+=mt;});
  const pe=dossier.mouvements.filter(m=>m.type==="entree").sort((a,b)=>a.date.localeCompare(b.date))[0];
  const ds=dossier.mouvements.filter(m=>m.type==="sortie").sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(pe&&ds){const stock=calcStockage(totalPal,pe.date,ds.date);if(stock.montant>0){lignes.push({desc:"Stockage "+stock.joursFactures+"j facturés / "+stock.jours+"j total (3j offerts) — "+totalPal+" pal. × "+stock.taux+"€",qty:stock.joursFactures,pu:totalPal*(stock.taux||0),total:stock.montant});total+=stock.montant;}}
  if(dossier.palettisation>0){const mt=dossier.palettisation*TARIFS.palettisation;lignes.push({desc:"Palettisation ("+dossier.palettisation+" pal.)",qty:dossier.palettisation,pu:TARIFS.palettisation,total:mt});total+=mt;}
  if(dossier.depotage>0){const mt=dossier.depotage*TARIFS.depotage_vrac;lignes.push({desc:"Dépotage vrac ("+dossier.depotage+" colis)",qty:dossier.depotage,pu:TARIFS.depotage_vrac,total:mt});total+=mt;}
  const tva=avecTVA?total*0.2:0;
  return {lignes,ht:total,tva,ttc:total+tva,avecTVA};
}

const C={bg:"#f5f3ef",paper:"#ffffff",ink:"#1a1a2e",muted:"#6b7280",accent:"#c8973a",accentLight:"#fdf3e3",border:"#e5e1d8",danger:"#dc2626",entree:"#dbeafe",sortie:"#fce7f3"};
const sf={
  label:{fontSize:12,color:C.muted,marginBottom:4,display:"block",fontFamily:"sans-serif"},
  input:{width:"100%",padding:"9px 12px",border:"1px solid "+C.border,borderRadius:6,fontSize:14,fontFamily:"sans-serif",color:C.ink,background:"#fafaf8",boxSizing:"border-box",outline:"none"},
  select:{width:"100%",padding:"9px 12px",border:"1px solid "+C.border,borderRadius:6,fontSize:14,fontFamily:"sans-serif",color:C.ink,background:"#fafaf8",boxSizing:"border-box"},
  btn:(v,extra)=>({padding:"9px 18px",border:"none",borderRadius:6,fontFamily:"sans-serif",fontSize:13,cursor:"pointer",fontWeight:600,background:v==="primary"?C.ink:v==="accent"?C.accent:v==="danger"?C.danger:v==="ghost"?"transparent":"#e5e1d8",color:v==="primary"?"#fff":v==="accent"?C.ink:v==="danger"?"#fff":v==="ghost"?C.muted:C.ink,...extra}),
  card:{background:C.paper,border:"1px solid "+C.border,borderRadius:10,padding:24,marginBottom:16},
  sectionTitle:{fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:C.muted,marginBottom:14,fontFamily:"sans-serif",fontWeight:600},
};

function PageDossiers({dossiers,clients,onVoirFacture}) {
  const now=new Date();
  const [moisActif,setMoisActif]=useState(now.getMonth());
  const [anneeActive,setAnneeActive]=useState(now.getFullYear());
  const moisDispos=[...new Set(dossiers.map(d=>{const {mois,annee}=getMoisAnnee(d.dateCreation);return annee+"-"+String(mois).padStart(2,"0")}))].sort().reverse();
  const moisActuelKey=now.getFullYear()+"-"+String(now.getMonth()).padStart(2,"0");
  if(!moisDispos.includes(moisActuelKey)) moisDispos.unshift(moisActuelKey);
  const dossiersDuMois=dossiers.filter(d=>{const {mois,annee}=getMoisAnnee(d.dateCreation);return mois===moisActif&&annee===anneeActive;});
  const ouverts=dossiersDuMois.filter(d=>d.statut==="ouvert").length;
  const totalPalStock=dossiersDuMois.filter(d=>d.statut==="ouvert").reduce((s,d)=>{const e=d.mouvements.filter(m=>m.type==="entree").reduce((a,m)=>a+m.palettes,0);const so=d.mouvements.filter(m=>m.type==="sortie").reduce((a,m)=>a+m.palettes,0);return s+e-so;},0);
  const caEstime=dossiersDuMois.reduce((s,d)=>s+genFacture(d,clients).ht,0);
  return (
    <div>
      <div style={{display:"flex",gap:4,overflowX:"auto",marginBottom:16,flexWrap:"wrap"}}>
        {moisDispos.map(key=>{
          const [a,m]=key.split("-");const annee=parseInt(a);const mois=parseInt(m);
          const actif=mois===moisActif&&annee===anneeActive;
          const nb=dossiers.filter(d=>{const dm=getMoisAnnee(d.dateCreation);return dm.mois===mois&&dm.annee===annee;}).length;
          return <button key={key} onClick={()=>{setMoisActif(mois);setAnneeActive(annee);}} style={{padding:"8px 16px",border:"1px solid "+(actif?C.accent:C.border),borderBottom:actif?"3px solid "+C.accent:"1px solid "+C.border,borderRadius:"6px 6px 0 0",background:actif?C.paper:"#ebe8e2",color:actif?C.ink:C.muted,fontFamily:"sans-serif",fontSize:13,cursor:"pointer",fontWeight:actif?700:400,whiteSpace:"nowrap"}}>
            {MOIS[mois]} {annee}{nb>0&&<span style={{marginLeft:6,background:actif?C.accent:C.muted,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10}}>{nb}</span>}
          </button>;
        })}
      </div>
      <div style={{...sf.card,padding:0}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)"}}>
          {[{val:dossiersDuMois.length,label:"Dossiers du mois",color:C.ink},{val:ouverts,label:"En cours",color:"#d97706"},{val:totalPalStock,label:"Palettes en stock",color:"#2563eb"},{val:caEstime.toFixed(0)+" €",label:"CA HT du mois",color:C.accent}].map((k,i)=>(
            <div key={i} style={{textAlign:"center",padding:"20px 12px",borderRight:i<3?"1px solid "+C.border:"none"}}>
              <div style={{fontSize:30,fontWeight:"bold",color:k.color}}>{k.val}</div>
              <div style={{fontSize:11,color:C.muted,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:4}}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={sf.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={sf.sectionTitle}>Dossiers — {MOIS[moisActif]} {anneeActive}</div>
          {caEstime>0&&<div style={{fontFamily:"sans-serif",fontSize:13,color:C.muted}}>HT : <strong style={{color:C.accent}}>{caEstime.toFixed(2)} €</strong></div>}
        </div>
        {dossiersDuMois.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:C.muted,fontFamily:"sans-serif"}}><div style={{fontSize:48,marginBottom:12}}>📦</div><div>Aucun dossier ce mois-ci</div></div>}
        {dossiersDuMois.map(d=>{
          const totalE=d.mouvements.filter(m=>m.type==="entree").reduce((s,m)=>s+m.palettes,0);
          const totalS=d.mouvements.filter(m=>m.type==="sortie").reduce((s,m)=>s+m.palettes,0);
          const facture=genFacture(d,clients);
          const clientObj=clients.find(c=>c.nom===d.client);
          return <div key={d.id} style={{border:"1px solid "+C.border,borderRadius:8,marginBottom:10,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:d.statut==="ouvert"?"#fffbf0":"#f9fafb"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div>
                  <div style={{fontWeight:"bold",fontSize:15,display:"flex",alignItems:"center",gap:8}}>
                    {d.client}
                    {d.invoiceRef&&<span style={{color:C.accent,fontFamily:"sans-serif",fontSize:12,fontWeight:400}}>#{d.invoiceRef}</span>}
                    {clientObj&&!clientObj.tva&&<span style={{fontSize:10,background:"#fef9c3",color:"#92400e",padding:"1px 6px",borderRadius:10,fontFamily:"sans-serif",fontWeight:600}}>HT</span>}
                  </div>
                  <div style={{fontSize:12,color:C.muted,fontFamily:"sans-serif",marginTop:2}}>{d.dateCreation} · {d.mouvements.length} mvt{d.notes?" · "+d.notes:""}</div>
                </div>
                <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,fontFamily:"sans-serif",background:d.statut==="ouvert"?"#fef3c7":"#dcfce7",color:d.statut==="ouvert"?"#92400e":"#166534"}}>{d.statut==="ouvert"?"En cours":"Clôturé"}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:20}}>
                <div style={{textAlign:"right",fontFamily:"sans-serif"}}>
                  <div style={{fontSize:11,color:C.muted}}>Ent. / Sort. / Stock</div>
                  <div style={{fontWeight:"bold"}}><span style={{color:"#1d4ed8"}}>↓{totalE}</span> / <span style={{color:"#be185d"}}>↑{totalS}</span> / <span style={{color:C.accent}}>{totalE-totalS}</span></div>
                </div>
                <div style={{textAlign:"right",fontFamily:"sans-serif"}}>
                  <div style={{fontSize:11,color:C.muted}}>Total HT</div>
                  <div style={{fontWeight:"bold",fontSize:16}}>{facture.ht.toFixed(2)} €</div>
                </div>
                <button style={sf.btn("primary")} onClick={()=>onVoirFacture(d)}>Voir facture</button>
              </div>
            </div>
            <div style={{padding:"8px 18px",display:"flex",gap:6,flexWrap:"wrap",borderTop:"1px solid "+C.border,background:"#fafafa"}}>
              {d.mouvements.sort((a,b)=>a.date.localeCompare(b.date)).map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:5,background:m.type==="entree"?C.entree:C.sortie,borderRadius:20,padding:"2px 10px",fontSize:12,fontFamily:"sans-serif",color:m.type==="entree"?"#1d4ed8":"#be185d"}}>
                  <span style={{fontWeight:700}}>{m.type==="entree"?"↓":"↑"} {m.palettes} pal.</span>
                  <span style={{color:C.muted}}>· {m.date}{m.ref?" · "+m.ref:""}</span>
                </div>
              ))}
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}

function PageNouveauDossier({clients,onSave}) {
  const [form,setForm]=useState({client:clients[0]?.nom||"",invoiceRef:"",notes:"",palettisation:0,depotage:0});
  const [mouvements,setMouvements]=useState([]);
  const [mvt,setMvt]=useState({type:"entree",date:today(),palettes:1,ref:""});
  const [erreur,setErreur]=useState("");
  const addMvt=()=>{if(mvt.palettes<1)return;setMouvements(m=>[...m,{...mvt,id:Date.now()}]);setMvt(v=>({...v,palettes:1,ref:""}));setErreur("");};
  const handleSave=()=>{
    if(!mouvements.length){setErreur("Ajoutez au moins un mouvement.");return;}
    const e=mouvements.filter(m=>m.type==="entree").reduce((s,m)=>s+m.palettes,0);
    const so=mouvements.filter(m=>m.type==="sortie").reduce((s,m)=>s+m.palettes,0);
    onSave({id:Date.now(),...form,mouvements,dateCreation:today(),statut:so>=e?"clos":"ouvert"});
  };
  const clientObj=clients.find(c=>c.nom===form.client);
  return (
    <div>
      <div style={sf.card}>
        <div style={sf.sectionTitle}>Informations client</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
          <div>
            <label style={sf.label}>Client</label>
            <select style={sf.select} value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))}>
              {clients.map(c=><option key={c.nom} value={c.nom}>{c.nom}{!c.tva?" (HT)":""}</option>)}
            </select>
            {clientObj&&!clientObj.tva&&<div style={{fontSize:11,color:"#92400e",marginTop:5,fontFamily:"sans-serif",background:"#fef9c3",padding:"3px 8px",borderRadius:4}}>⚠️ Client exonéré — facturation HT</div>}
          </div>
          <div><label style={sf.label}>Invoice Ref</label><input style={sf.input} placeholder="ex: ARS26OZ18248M" value={form.invoiceRef} onChange={e=>setForm(f=>({...f,invoiceRef:e.target.value}))}/></div>
          <div><label style={sf.label}>Notes internes</label><input style={sf.input} placeholder="Passage douane..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        </div>
      </div>
      <div style={sf.card}>
        <div style={sf.sectionTitle}>Prestations supplémentaires</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div><label style={sf.label}>Palettisation (nb palettes)</label><input style={sf.input} type="number" min={0} value={form.palettisation} onChange={e=>setForm(f=>({...f,palettisation:+e.target.value}))}/></div>
          <div><label style={sf.label}>Dépotage vrac (nb colis)</label><input style={sf.input} type="number" min={0} value={form.depotage} onChange={e=>setForm(f=>({...f,depotage:+e.target.value}))}/></div>
        </div>
      </div>
      <div style={sf.card}>
        <div style={sf.sectionTitle}>Mouvements de palettes</div>
        <div style={{background:"#fafaf8",border:"1px solid "+C.border,borderRadius:8,padding:16,marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"130px 170px 90px 1fr auto",gap:10,alignItems:"end"}}>
            <div><label style={sf.label}>Type</label><select style={sf.select} value={mvt.type} onChange={e=>setMvt(v=>({...v,type:e.target.value}))}><option value="entree">↓ Entrée</option><option value="sortie">↑ Sortie</option></select></div>
            <div><label style={sf.label}>Date</label><input style={sf.input} type="date" value={mvt.date} onChange={e=>setMvt(v=>({...v,date:e.target.value}))}/></div>
            <div><label style={sf.label}>Palettes</label><input style={sf.input} type="number" min={1} value={mvt.palettes} onChange={e=>setMvt(v=>({...v,palettes:+e.target.value}))}/></div>
            <div><label style={sf.label}>Référence</label><input style={sf.input} placeholder="Optionnel" value={mvt.ref} onChange={e=>setMvt(v=>({...v,ref:e.target.value}))}/></div>
            <div><button style={sf.btn("accent")} onClick={addMvt}>+ Ajouter</button></div>
          </div>
        </div>
        {mouvements.length===0?<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontFamily:"sans-serif",fontSize:13}}>Aucun mouvement</div>
          :mouvements.map((m,i)=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",borderRadius:6,marginBottom:6,background:m.type==="entree"?C.entree:C.sortie}}>
              <div style={{display:"flex",gap:12,alignItems:"center",fontFamily:"sans-serif",fontSize:13}}>
                <span style={{padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:m.type==="entree"?"#bfdbfe":"#fbcfe8",color:m.type==="entree"?"#1d4ed8":"#be185d"}}>{m.type==="entree"?"↓ ENTRÉE":"↑ SORTIE"}</span>
                <span><b>{m.palettes} palettes</b></span><span style={{color:C.muted}}>{m.date}</span>
                {m.ref&&<span style={{color:C.muted}}>· {m.ref}</span>}
              </div>
              <button onClick={()=>setMouvements(ms=>ms.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:18}}>✕</button>
            </div>
          ))}
        {erreur&&<div style={{color:C.danger,fontFamily:"sans-serif",fontSize:13,marginTop:8}}>⚠️ {erreur}</div>}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button style={sf.btn("primary",{fontSize:14,padding:"12px 28px"})} onClick={handleSave}>💾 Enregistrer</button>
      </div>
    </div>
  );
}

function PageFacture({dossier,clients,onRetour}) {
  const f=genFacture(dossier,clients);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button style={sf.btn("ghost")} onClick={onRetour}>← Retour</button>
        <button style={sf.btn("accent")} onClick={()=>window.print()}>🖨️ Imprimer</button>
      </div>
      <div style={sf.card}>
        <div style={{background:C.ink,color:"#fff",borderRadius:8,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div><div style={{fontSize:20,fontWeight:"bold"}}>DFDS · DÉPÔT HORS DFDS</div><div style={{color:"#9ca3af",fontSize:12,fontFamily:"sans-serif",marginTop:4}}>Zone Portuaire · Sète, France</div></div>
          <div style={{textAlign:"right",fontFamily:"sans-serif"}}>
            <div style={{color:C.accent,fontWeight:"bold",fontSize:15}}>{dossier.invoiceRef||"DOS-"+dossier.id.toString().slice(-5)}</div>
            <div style={{color:"#9ca3af",fontSize:12}}>Date : {today()}</div>
            <div style={{color:"#9ca3af",fontSize:12}}>Client : {dossier.client}</div>
          </div>
        </div>
        <div style={{marginBottom:20}}>
          <div style={sf.sectionTitle}>Mouvements</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {dossier.mouvements.sort((a,b)=>a.date.localeCompare(b.date)).map(m=>(
              <div key={m.id} style={{padding:"4px 12px",borderRadius:20,fontFamily:"sans-serif",fontSize:12,fontWeight:600,background:m.type==="entree"?C.entree:C.sortie,color:m.type==="entree"?"#1d4ed8":"#be185d"}}>
                {m.type==="entree"?"↓":"↑"} {m.palettes} pal. · {m.date}{m.ref?" · "+m.ref:""}
              </div>
            ))}
          </div>
        </div>
        <div style={sf.sectionTitle}>Facturation</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:13,marginBottom:24}}>
          <thead><tr style={{background:C.bg}}>{["Désignation","Qté","PU HT","Total HT"].map((h,i)=><th key={h} style={{padding:"9px 14px",textAlign:i===0?"left":"right",fontSize:10,textTransform:"uppercase",color:C.muted,borderBottom:"2px solid "+C.border}}>{h}</th>)}</tr></thead>
          <tbody>{f.lignes.map((l,i)=><tr key={i} style={{borderBottom:"1px solid "+C.border}}><td style={{padding:"10px 14px"}}>{l.desc}</td><td style={{padding:"10px 14px",textAlign:"right"}}>{l.qty}</td><td style={{padding:"10px 14px",textAlign:"right"}}>{l.pu.toFixed(2)} €</td><td style={{padding:"10px 14px",textAlign:"right",fontWeight:"bold"}}>{l.total.toFixed(2)} €</td></tr>)}</tbody>
        </table>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <div style={{width:300,fontFamily:"sans-serif"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.border,color:C.muted,fontSize:14}}><span>Total HT</span><span>{f.ht.toFixed(2)} €</span></div>
            {f.avecTVA?<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.border,color:C.muted,fontSize:14}}><span>TVA 20%</span><span>{f.tva.toFixed(2)} €</span></div>
              :<div style={{padding:"8px 10px",background:"#fef9c3",borderRadius:4,fontSize:12,color:"#92400e",fontWeight:600,marginBottom:4}}>⚠️ Client exonéré — HT uniquement</div>}
            <div style={{display:"flex",justifyContent:"space-between",padding:"14px 0",fontWeight:"bold",fontSize:18}}><span>TOTAL {f.avecTVA?"TTC":"HT"}</span><span style={{color:C.accent}}>{f.ttc.toFixed(2)} €</span></div>
          </div>
        </div>
        {dossier.notes&&<div style={{marginTop:8,padding:"10px 14px",background:C.accentLight,borderRadius:6,fontFamily:"sans-serif",fontSize:13,borderLeft:"3px solid "+C.accent}}>📝 {dossier.notes}</div>}
      </div>
    </div>
  );
}

function PageClients({clients,setClients}) {
  const [newClient,setNewClient]=useState({nom:"",tva:true});
  const [editing,setEditing]=useState(null);
  const [erreur,setErreur]=useState("");
  const handleAjouter=async()=>{
    const nom=newClient.nom.trim().toUpperCase();
    if(!nom){setErreur("Nom obligatoire.");return;}
    if(clients.find(c=>c.nom===nom)){setErreur("Ce client existe déjà.");return;}
    await supabase.from("clients").upsert({nom,tva:newClient.tva});
    setClients(cs=>[...cs,{nom,tva:newClient.tva}]);
    setNewClient({nom:"",tva:true});setErreur("");
  };
  const handleSaveEdit=async(ancienNom)=>{
    const nom=editing.nom.trim().toUpperCase();
    if(!nom)return;
    if(nom!==ancienNom&&clients.find(c=>c.nom===nom)){setErreur("Ce nom existe déjà.");return;}
    await supabase.from("clients").delete().eq("nom",ancienNom);
    await supabase.from("clients").upsert({nom,tva:editing.tva});
    setClients(cs=>cs.map(c=>c.nom===ancienNom?{nom,tva:editing.tva}:c));
    setEditing(null);setErreur("");
  };
  const handleSupprimer=async(nom)=>{
    await supabase.from("clients").delete().eq("nom",nom);
    setClients(cs=>cs.filter(x=>x.nom!==nom));
  };
  return (
    <div>
      <div style={sf.card}>
        <div style={sf.sectionTitle}>Ajouter un client</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 220px 130px",gap:12,alignItems:"end"}}>
          <div><label style={sf.label}>Nom</label><input style={sf.input} placeholder="ex: LATASTE" value={newClient.nom} onChange={e=>{setNewClient(n=>({...n,nom:e.target.value.toUpperCase()}));setErreur("");}}/></div>
          <div><label style={sf.label}>TVA ?</label><select style={sf.select} value={newClient.tva?"oui":"non"} onChange={e=>setNewClient(n=>({...n,tva:e.target.value==="oui"}))}><option value="oui">✅ Oui — TTC</option><option value="non">⚠️ Non — HT</option></select></div>
          <button style={sf.btn("accent")} onClick={handleAjouter}>+ Ajouter</button>
        </div>
        {erreur&&<div style={{color:C.danger,fontFamily:"sans-serif",fontSize:12,marginTop:8}}>⚠️ {erreur}</div>}
      </div>
      <div style={sf.card}>
        <div style={sf.sectionTitle}>{clients.length} client(s)</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:14}}>
          <thead><tr style={{background:C.bg}}>{["Nom","TVA","Facturation","Actions"].map(h=><th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:10,textTransform:"uppercase",color:C.muted,borderBottom:"2px solid "+C.border}}>{h}</th>)}</tr></thead>
          <tbody>{clients.map((c,i)=>{
            const isEditing=editing&&editing._orig===c.nom;
            return <tr key={c.nom} style={{borderBottom:"1px solid "+C.border,background:i%2===0?"#fff":C.bg}}>
              <td style={{padding:"10px 16px"}}>{isEditing?<input style={{...sf.input,padding:"5px 10px",fontSize:13}} value={editing.nom} onChange={e=>setEditing(ed=>({...ed,nom:e.target.value.toUpperCase()}))}/>:<span style={{fontWeight:600}}>{c.nom}</span>}</td>
              <td style={{padding:"10px 16px"}}>{isEditing?<select style={{...sf.select,padding:"5px 10px",fontSize:13}} value={editing.tva?"oui":"non"} onChange={e=>setEditing(ed=>({...ed,tva:e.target.value==="oui"}))}><option value="oui">✅</option><option value="non">⚠️</option></select>:<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:c.tva?"#dcfce7":"#fef9c3",color:c.tva?"#166534":"#92400e"}}>{c.tva?"Oui":"Non"}</span>}</td>
              <td style={{padding:"10px 16px",color:C.muted,fontSize:12}}>{(isEditing?editing.tva:c.tva)?"TTC":"HT uniquement"}</td>
              <td style={{padding:"10px 16px"}}><div style={{display:"flex",gap:6}}>{isEditing?<><button style={sf.btn("primary",{padding:"5px 12px",fontSize:12})} onClick={()=>handleSaveEdit(c.nom)}>✓ Sauver</button><button style={sf.btn("default",{padding:"5px 12px",fontSize:12})} onClick={()=>setEditing(null)}>Annuler</button></>:<><button style={sf.btn("default",{padding:"5px 12px",fontSize:12})} onClick={()=>setEditing({nom:c.nom,tva:c.tva,_orig:c.nom})}>✏️ Modifier</button><button style={sf.btn("danger",{padding:"5px 12px",fontSize:12})} onClick={()=>handleSupprimer(c.nom)}>Supprimer</button></>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

function PageTarifs() {
  return <div style={sf.card}>
    <div style={sf.sectionTitle}>Grille tarifaire — Dépôt Hors DFDS (2024)</div>
    <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:14}}>
      <thead><tr style={{background:C.bg}}>{["Prestation","Tarif","Unité"].map(h=><th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:10,textTransform:"uppercase",color:C.muted,borderBottom:"2px solid "+C.border}}>{h}</th>)}</tr></thead>
      <tbody>{[["Passage à quai","20 €","/ lot < 15 pal. — HT"],["Passage à quai","65 €","/ lot ≥ 15 pal. — HT"],["Cross dock entrée","4 €","/ palette — HT"],["Cross dock sortie","4 €","/ palette — HT"],["Stockage (3j offerts)","1,00 €","/ pal. / jour ≤ 10j — HT"],["Stockage longue durée","0,70 €","/ pal. / jour > 10j — HT"],["Palettisation","20 €","/ palette — HT"],["Dépotage vrac unité","1,17 €","/ colis — HT"],["Dépotage complet","400 €","forfait — HT"],["Dépotage rouleaux","Sur devis",""]].map(([p,t,u],i)=><tr key={i} style={{borderBottom:"1px solid "+C.border,background:i%2===0?"#fff":C.bg}}><td style={{padding:"10px 16px",fontWeight:500}}>{p}</td><td style={{padding:"10px 16px",fontWeight:"bold",color:C.accent}}>{t}</td><td style={{padding:"10px 16px",color:C.muted,fontSize:12}}>{u}</td></tr>)}</tbody>
    </table>
  </div>;
}

export default function DepotManager() {
  const [tab,setTab]=useState("dossiers");
  const [factureOuverte,setFactureOuverte]=useState(null);
  const [dossiers,setDossiers]=useState([]);
  const [clients,setClients]=useState(CLIENTS_INIT);
  const [chargement,setChargement]=useState(true);

  useEffect(()=>{
    async function charger() {
      const {data:d}=await supabase.from("dossiers").select("*");
      const {data:c}=await supabase.from("clients").select("*");
      if(d) setDossiers(d.map(x=>({...x,dateCreation:x.date_creation,invoiceRef:x.invoice_ref})));
      if(c&&c.length>0) setClients(c);
      setChargement(false);
    }
    charger();
  },[]);

  const saveDossier=async(d)=>{
    await supabase.from("dossiers").upsert({
      id:d.id,client:d.client,invoice_ref:d.invoiceRef,notes:d.notes,
      palettisation:d.palettisation,depotage:d.depotage,statut:d.statut,
      date_creation:d.dateCreation,mouvements:d.mouvements
    });
    setDossiers(ds=>[d,...ds]);
    setTab("dossiers");
  };

  const TABS=[{id:"dossiers",label:"📁 Dossiers"},{id:"nouveau",label:"➕ Nouveau dossier"},{id:"clients",label:"👥 Clients"},{id:"tarifs",label:"📋 Tarifs"}];

  if(chargement) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:C.muted}}>Chargement...</div>;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Georgia', serif",color:C.ink}}>
      <header style={{background:C.ink,color:"#fff",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:62}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:C.accent,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:"bold",color:C.ink}}>D</div>
          <div><div style={{fontSize:17,fontWeight:"bold",letterSpacing:"0.04em"}}>DÉPÔT MANAGER</div><div style={{fontSize:10,color:"#9ca3af",letterSpacing:"0.12em",textTransform:"uppercase"}}>DFDS · Gestion entrepôt & facturation</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:11,color:"#00d97e",fontFamily:"sans-serif",display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:"#00d97e"}}/>Sauvegarde cloud active</div>
          <div style={{fontSize:12,color:"#9ca3af",fontFamily:"sans-serif"}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
      </header>
      <nav style={{background:C.paper,borderBottom:"1px solid "+C.border,display:"flex",padding:"0 32px"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"14px 20px",border:"none",background:"transparent",borderBottom:tab===t.id?"3px solid "+C.accent:"3px solid transparent",color:tab===t.id?C.ink:C.muted,fontWeight:tab===t.id?"bold":"normal",cursor:"pointer",fontSize:14,fontFamily:"inherit",transition:"all 0.2s"}}>{t.label}</button>)}
        {tab==="facture"&&<button style={{padding:"14px 20px",border:"none",background:"transparent",borderBottom:"3px solid "+C.accent,color:C.ink,fontWeight:"bold",cursor:"default",fontSize:14,fontFamily:"inherit"}}>🧾 Facture</button>}
      </nav>
      <main style={{padding:"28px 32px",maxWidth:1100,margin:"0 auto"}}>
        {tab==="dossiers"&&<PageDossiers dossiers={dossiers} clients={clients} onVoirFacture={d=>{setFactureOuverte(d);setTab("facture");}}/>}
        {tab==="nouveau"&&<PageNouveauDossier clients={clients} onSave={saveDossier}/>}
        {tab==="clients"&&<PageClients clients={clients} setClients={setClients}/>}
        {tab==="tarifs"&&<PageTarifs/>}
        {tab==="facture"&&factureOuverte&&<PageFacture dossier={factureOuverte} clients={clients} onRetour={()=>setTab("dossiers")}/>}
      </main>
    </div>
  );
}