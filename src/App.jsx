import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://giiiztadiyrrcczzgofv.supabase.co",
  "sb_publishable_MQjJb7Wm7TrszeIW09F6bQ_4ATRbOL1"
);

const CODES = { "QUAI2026": "chef", "COMPTA2026": "comptable" };

// Statuts de facture
// null = brouillon | "en_attente" = envoyé pour validation
// "validee" = validé | "modifiee" = modifié après validation (alerte compta)
const SF = {
  null:        { label: "Brouillon",                  color: "#6b7280", bg: "#f3f4f6", icon: "📝" },
  en_attente:  { label: "En attente de validation",    color: "#d97706", bg: "#fef3c7", icon: "⏳" },
  validee:     { label: "Validée",                     color: "#16a34a", bg: "#dcfce7", icon: "✅" },
  modifiee:    { label: "Modifiée après validation",   color: "#dc2626", bg: "#fee2e2", icon: "⚠️" },
};

const TARIFS_DEFAUT = [
  { id: "passage_quai_small", label: "Passage à quai (< 15 pal.)", prix: 20, unite: "/ lot" },
  { id: "passage_quai_large", label: "Passage à quai (≥ 15 pal.)", prix: 65, unite: "/ lot" },
  { id: "cross_dock_entree",  label: "Cross dock entrée",           prix: 4,  unite: "/ palette" },
  { id: "cross_dock_sortie",  label: "Cross dock sortie",           prix: 4,  unite: "/ palette" },
  { id: "stockage_court",     label: "Stockage ≤ 10j (3j offerts)", prix: 1.0,  unite: "/ pal./jour" },
  { id: "stockage_long",      label: "Stockage > 10j",              prix: 0.70, unite: "/ pal./jour" },
  { id: "palettisation",      label: "Palettisation",               prix: 20, unite: "/ palette" },
  { id: "depotage_vrac",      label: "Dépotage vrac unité",         prix: 1.17, unite: "/ colis" },
  { id: "depotage_complet",   label: "Dépotage complet vrac colis", prix: 400, unite: "forfait" },
];

const CLIENTS_INIT = [
  { nom: "ARES", tva: false }, { nom: "RTP", tva: true },
  { nom: "TALAY", tva: true }, { nom: "SGS", tva: true },
  { nom: "SEL", tva: true },   { nom: "VIPSPED", tva: false },
  { nom: "TALORIA", tva: false }, { nom: "XPO", tva: true },
];

const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function today() { return new Date().toISOString().slice(0,10); }
function daysBetween(a,b) { return Math.max(0,Math.round((new Date(b)-new Date(a))/86400000)); }
function getMoisAnnee(date) { const d=new Date(date); return {mois:d.getMonth(),annee:d.getFullYear()}; }

function genFacture(dossier, tarifs) {
  if (dossier.lignesSnap && dossier.lignesSnap.length > 0) {
    return { lignes: dossier.lignesSnap, ht: dossier.lignesSnap.reduce((s,l)=>s+l.total,0) };
  }
  const t = {};
  tarifs.forEach(x => t[x.id] = x.prix);
  const lignes = []; let total = 0;
  const totalPal = dossier.mouvements.reduce((s,m)=>s+(m.type==="entree"?m.palettes:0),0);
  const prixQuai = totalPal >= 15 ? t.passage_quai_large : t.passage_quai_small;
  lignes.push({desc:"Passage à quai ("+totalPal+" pal.)",qty:1,pu:prixQuai,total:prixQuai}); total+=prixQuai;
  dossier.mouvements.filter(m=>m.type==="entree").forEach(m=>{const mt=m.palettes*t.cross_dock_entree;lignes.push({desc:"Cross dock entrée — "+m.date+" ("+m.palettes+" pal.)",qty:m.palettes,pu:t.cross_dock_entree,total:mt});total+=mt;});
  dossier.mouvements.filter(m=>m.type==="sortie").forEach(m=>{const mt=m.palettes*t.cross_dock_sortie;lignes.push({desc:"Cross dock sortie — "+m.date+" ("+m.palettes+" pal.)",qty:m.palettes,pu:t.cross_dock_sortie,total:mt});total+=mt;});
  const pe=dossier.mouvements.filter(m=>m.type==="entree").sort((a,b)=>a.date.localeCompare(b.date))[0];
  const ds=dossier.mouvements.filter(m=>m.type==="sortie").sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(pe&&ds){const jt=Math.max(0,daysBetween(pe.date,ds.date)-2);const jf=Math.max(0,jt-3);if(jf>0){const taux=jf<=10?t.stockage_court:t.stockage_long;const mt=totalPal*jf*taux;lignes.push({desc:"Stockage "+jf+"j facturés ("+jt+"j total, 3j offerts)",qty:jf,pu:totalPal*taux,total:mt});total+=mt;}}
  if(dossier.palettisation>0){const mt=dossier.palettisation*t.palettisation;lignes.push({desc:"Palettisation ("+dossier.palettisation+" pal.)",qty:dossier.palettisation,pu:t.palettisation,total:mt});total+=mt;}
  if(dossier.depotage>0){const mt=dossier.depotage*t.depotage_vrac;lignes.push({desc:"Dépotage vrac ("+dossier.depotage+" colis)",qty:dossier.depotage,pu:t.depotage_vrac,total:mt});total+=mt;}
  (dossier.fraisSupp||[]).forEach(f=>{const tot=f.total||f.montant||0;lignes.push({desc:f.desc,qty:f.qty||1,pu:f.pu||f.montant||0,total:tot});total+=tot;});
  return {lignes,ht:total};
}

const C={bg:"#f5f3ef",paper:"#fff",ink:"#1a1a2e",muted:"#6b7280",accent:"#c8973a",accentLight:"#fdf3e3",border:"#e5e1d8",danger:"#dc2626",entree:"#dbeafe",sortie:"#fce7f3",success:"#dcfce7"};
const sf={
  label:{fontSize:12,color:C.muted,marginBottom:4,display:"block",fontFamily:"sans-serif"},
  input:{width:"100%",padding:"9px 12px",border:"1px solid "+C.border,borderRadius:6,fontSize:14,fontFamily:"sans-serif",color:C.ink,background:"#fafaf8",boxSizing:"border-box",outline:"none"},
  select:{width:"100%",padding:"9px 12px",border:"1px solid "+C.border,borderRadius:6,fontSize:14,fontFamily:"sans-serif",color:C.ink,background:"#fafaf8",boxSizing:"border-box"},
  btn:(v,ex)=>({padding:"9px 18px",border:"none",borderRadius:6,fontFamily:"sans-serif",fontSize:13,cursor:"pointer",fontWeight:600,
    background:v==="primary"?C.ink:v==="accent"?C.accent:v==="danger"?C.danger:v==="success"?"#16a34a":v==="warning"?"#d97706":v==="ghost"?"transparent":"#e5e1d8",
    color:v==="primary"||v==="danger"||v==="success"||v==="warning"?"#fff":v==="accent"?C.ink:v==="ghost"?C.muted:C.ink,...ex}),
  card:{background:C.paper,border:"1px solid "+C.border,borderRadius:10,padding:24,marginBottom:16},
  sec:{fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:C.muted,marginBottom:14,fontFamily:"sans-serif",fontWeight:600},
  tag:(type)=>({display:"inline-flex",alignItems:"center",gap:4,background:type==="entree"?C.entree:C.sortie,borderRadius:20,padding:"2px 10px",fontSize:12,fontFamily:"sans-serif",color:type==="entree"?"#1d4ed8":"#be185d",fontWeight:600}),
};

function Badge({statutFacture}) {
  const st = SF[statutFacture] || SF[null];
  return <span style={{fontSize:11,fontWeight:600,fontFamily:"sans-serif",background:st.bg,color:st.color,padding:"2px 8px",borderRadius:20}}>{st.icon} {st.label}</span>;
}

// ─── LOGIN ──────────────────────────────────────────────────────────────────
function PageLogin({onLogin}) {
  const [code,setCode]=useState(""); const [erreur,setErreur]=useState("");
  const handle=()=>{const r=CODES[code.trim().toUpperCase()];if(r){onLogin(r);}else setErreur("Code incorrect.");};
  return (
    <div style={{minHeight:"100vh",background:C.ink,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.paper,borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,background:C.accent,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:"bold",color:C.ink,margin:"0 auto 16px"}}>D</div>
          <div style={{fontSize:22,fontWeight:"bold",color:C.ink}}>DÉPÔT MANAGER</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:"sans-serif",marginTop:4,textTransform:"uppercase",letterSpacing:"0.1em"}}>DFDS · Accès sécurisé</div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={sf.label}>Code d'accès</label>
          <input style={{...sf.input,fontSize:16,letterSpacing:"0.1em",textAlign:"center"}} type="password" placeholder="••••••••" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} autoFocus/>
        </div>
        {erreur&&<div style={{color:C.danger,fontFamily:"sans-serif",fontSize:13,marginBottom:12,textAlign:"center"}}>⚠️ {erreur}</div>}
        <button style={{...sf.btn("primary"),width:"100%",padding:"12px",fontSize:15}} onClick={handle}>Accéder →</button>
        <div style={{marginTop:20,padding:"12px 14px",background:C.bg,borderRadius:8,fontFamily:"sans-serif",fontSize:11,color:C.muted,textAlign:"center"}}>Accès réservé au personnel DFDS.<br/>Contactez votre responsable pour obtenir votre code.</div>
      </div>
    </div>
  );
}

// ─── FORM DOSSIER ───────────────────────────────────────────────────────────
function FormDossier({clients,tarifs,dossierInitial,onSave,onCancel}) {
  const editing=!!dossierInitial;
  const [form,setForm]=useState(dossierInitial?{client:dossierInitial.client,invoiceRef:dossierInitial.invoiceRef||"",notes:dossierInitial.notes||"",palettisation:dossierInitial.palettisation||0,depotage:dossierInitial.depotage||0}:{client:clients[0]?.nom||"",invoiceRef:"",notes:"",palettisation:0,depotage:0});
  const [mouvements,setMouvements]=useState(dossierInitial?.mouvements||[]);
  const [fraisSupp,setFraisSupp]=useState(dossierInitial?.fraisSupp||[]);
  const [mvt,setMvt]=useState({type:"entree",date:today(),palettes:1,provenance:""});
  const [frais,setFrais]=useState({desc:"",type:"libre",montant:0,qty:1,pu:0});
  const [erreur,setErreur]=useState("");
  const addMvt=()=>{if(mvt.palettes<1)return;setMouvements(m=>[...m,{...mvt,id:Date.now()}]);setMvt(v=>({...v,palettes:1,provenance:""}));};
  const addFrais=()=>{if(!frais.desc)return;const total=frais.type==="libre"?+frais.montant:+frais.qty*+frais.pu;setFraisSupp(f=>[...f,{...frais,total,id:Date.now()}]);setFrais({desc:"",type:"libre",montant:0,qty:1,pu:0});};
  const handleSave=()=>{
    if(!mouvements.length){setErreur("Ajoutez au moins un mouvement.");return;}
    const e=mouvements.filter(m=>m.type==="entree").reduce((s,m)=>s+m.palettes,0);
    const so=mouvements.filter(m=>m.type==="sortie").reduce((s,m)=>s+m.palettes,0);
    const clientObj=clients.find(c=>c.nom===form.client)||{tva:true};
    const wasValidee=dossierInitial?.statutFacture==="validee";
    const dossierBase={...(dossierInitial||{id:Date.now()}),...form,mouvements,fraisSupp,
      dateCreation:dossierInitial?.dateCreation||today(),statut:so>=e?"clos":"ouvert",
      tvaClient:clientObj.tva,
      statutFacture: wasValidee ? "modifiee" : (dossierInitial?.statutFacture||null)
    };
    const lignesSnap=genFacture({...dossierBase,lignesSnap:null},tarifs).lignes;
    onSave({...dossierBase,lignesSnap});
  };
  const clientObj=clients.find(c=>c.nom===form.client);
  return (
    <div>
      {dossierInitial?.statutFacture==="validee"&&<div style={{background:"#fee2e2",border:"1px solid #dc2626",borderRadius:8,padding:"10px 16px",marginBottom:16,fontFamily:"sans-serif",fontSize:13,color:C.danger}}>⚠️ Cette facture a été validée par le comptable. La modifier la marquera comme "Modifiée" et enverra une alerte au comptable.</div>}
      <div style={sf.card}>
        <div style={sf.sec}>Informations client</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16}}>
          <div>
            <label style={sf.label}>Client</label>
            <select style={sf.select} value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))}>
              {clients.map(c=><option key={c.nom} value={c.nom}>{c.nom}{!c.tva?" (HT)":""}</option>)}
            </select>
            {clientObj&&!clientObj.tva&&<div style={{fontSize:11,color:"#92400e",marginTop:4,background:"#fef9c3",padding:"3px 8px",borderRadius:4,fontFamily:"sans-serif"}}>⚠️ Facturation HT</div>}
          </div>
          <div><label style={sf.label}>Invoice Ref</label><input style={sf.input} placeholder="ex: ARS26OZ18248M" value={form.invoiceRef} onChange={e=>setForm(f=>({...f,invoiceRef:e.target.value}))}/></div>
          <div><label style={sf.label}>Notes internes</label><input style={sf.input} placeholder="Passage douane..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        </div>
      </div>
      <div style={sf.card}>
        <div style={sf.sec}>Mouvements de palettes</div>
        <div style={{background:"#fafaf8",border:"1px solid "+C.border,borderRadius:8,padding:16,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,alignItems:"end"}}>
            <div><label style={sf.label}>Type</label><select style={sf.select} value={mvt.type} onChange={e=>setMvt(v=>({...v,type:e.target.value}))}><option value="entree">↓ Entrée</option><option value="sortie">↑ Sortie</option></select></div>
            <div><label style={sf.label}>Date</label><input style={sf.input} type="date" value={mvt.date} onChange={e=>setMvt(v=>({...v,date:e.target.value}))}/></div>
            <div><label style={sf.label}>Palettes</label><input style={sf.input} type="number" min={1} value={mvt.palettes} onChange={e=>setMvt(v=>({...v,palettes:+e.target.value}))}/></div>
            <div><label style={sf.label}>Provenance / BL</label><input style={sf.input} placeholder="Expéditeur, n° BL..." value={mvt.provenance} onChange={e=>setMvt(v=>({...v,provenance:e.target.value}))}/></div>
            <div style={{display:"flex",alignItems:"flex-end"}}><button style={sf.btn("accent",{width:"100%"})} onClick={addMvt}>+ Ajouter</button></div>
          </div>
        </div>
        {mouvements.length===0?<div style={{textAlign:"center",padding:16,color:C.muted,fontFamily:"sans-serif",fontSize:13}}>Aucun mouvement</div>
          :mouvements.map((m,i)=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:6,marginBottom:6,background:m.type==="entree"?C.entree:C.sortie}}>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <span style={sf.tag(m.type)}>{m.type==="entree"?"↓ ENTRÉE":"↑ SORTIE"}</span>
                <span style={{fontFamily:"sans-serif",fontSize:13,fontWeight:600}}>{m.palettes} pal.</span>
                <span style={{fontFamily:"sans-serif",fontSize:12,color:C.muted}}>{m.date}</span>
                {m.provenance&&<span style={{fontFamily:"sans-serif",fontSize:12,color:C.muted}}>· {m.provenance}</span>}
              </div>
              <button onClick={()=>setMouvements(ms=>ms.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:18}}>✕</button>
            </div>
          ))}
        {erreur&&<div style={{color:C.danger,fontFamily:"sans-serif",fontSize:13,marginTop:8}}>⚠️ {erreur}</div>}
      </div>
      <div style={sf.card}>
        <div style={sf.sec}>Prestations supplémentaires</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
          <div><label style={sf.label}>Palettisation (nb palettes)</label><input style={sf.input} type="number" min={0} value={form.palettisation} onChange={e=>setForm(f=>({...f,palettisation:+e.target.value}))}/></div>
          <div><label style={sf.label}>Dépotage vrac (nb colis)</label><input style={sf.input} type="number" min={0} value={form.depotage} onChange={e=>setForm(f=>({...f,depotage:+e.target.value}))}/></div>
        </div>
      </div>
      <div style={sf.card}>
        <div style={sf.sec}>Frais supplémentaires (hors tarifs)</div>
        <div style={{background:"#fafaf8",border:"1px solid "+C.border,borderRadius:8,padding:16,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 130px 1fr 1fr auto",gap:10,alignItems:"end"}}>
            <div><label style={sf.label}>Description</label><input style={sf.input} placeholder="ex: Manutention spéciale" value={frais.desc} onChange={e=>setFrais(f=>({...f,desc:e.target.value}))}/></div>
            <div><label style={sf.label}>Type</label><select style={sf.select} value={frais.type} onChange={e=>setFrais(f=>({...f,type:e.target.value}))}><option value="libre">Montant libre</option><option value="qpu">Qté × PU</option></select></div>
            {frais.type==="libre"?<div style={{gridColumn:"span 2"}}><label style={sf.label}>Montant HT (€)</label><input style={sf.input} type="number" min={0} step="0.01" value={frais.montant} onChange={e=>setFrais(f=>({...f,montant:+e.target.value}))}/></div>
              :<><div><label style={sf.label}>Quantité</label><input style={sf.input} type="number" min={1} value={frais.qty} onChange={e=>setFrais(f=>({...f,qty:+e.target.value}))}/></div><div><label style={sf.label}>PU HT (€)</label><input style={sf.input} type="number" min={0} step="0.01" value={frais.pu} onChange={e=>setFrais(f=>({...f,pu:+e.target.value}))}/></div></>}
            <div style={{display:"flex",alignItems:"flex-end"}}><button style={sf.btn("accent",{whiteSpace:"nowrap"})} onClick={addFrais}>+ Ajouter</button></div>
          </div>
        </div>
        {fraisSupp.length===0?<div style={{textAlign:"center",padding:12,color:C.muted,fontFamily:"sans-serif",fontSize:13}}>Aucun frais</div>
          :fraisSupp.map((f,i)=>(
            <div key={f.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderRadius:6,marginBottom:6,background:C.accentLight,border:"1px solid "+C.accent+"44"}}>
              <div style={{fontFamily:"sans-serif",fontSize:13}}><span style={{fontWeight:600}}>{f.desc}</span><span style={{color:C.muted,marginLeft:8}}>{f.type==="qpu"?f.qty+" × "+f.pu+" €":""}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontWeight:"bold",color:C.accent,fontFamily:"sans-serif"}}>{(f.total||f.montant||0).toFixed(2)} € HT</span><button onClick={()=>setFraisSupp(fs=>fs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.danger,cursor:"pointer",fontSize:18}}>✕</button></div>
            </div>
          ))}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        {onCancel&&<button style={sf.btn("default")} onClick={onCancel}>Annuler</button>}
        <button style={sf.btn("primary",{fontSize:14,padding:"12px 28px"})} onClick={handleSave}>💾 {editing?"Enregistrer les modifications":"Créer le dossier"}</button>
      </div>
    </div>
  );
}

// ─── ACTIONS SUR FACTURE (Supabase) ─────────────────────────────────────────
async function updateStatutFacture(id, statut, setDossiers) {
  await supabase.from("dossiers").update({statut_facture: statut}).eq("id", id);
  setDossiers(ds => ds.map(x => x.id===id ? {...x, statutFacture: statut} : x));
}

// ─── PAGE DOSSIERS ──────────────────────────────────────────────────────────
function PageDossiers({dossiers,clients,tarifs,onVoirFacture,setDossiers,onModifier,role}) {
  const now=new Date();
  const [moisActif,setMoisActif]=useState(now.getMonth());
  const [anneeActive,setAnneeActive]=useState(now.getFullYear());

  const moisDispos=[...new Set(dossiers.map(d=>{const {mois,annee}=getMoisAnnee(d.dateCreation);return annee+"-"+String(mois).padStart(2,"0")}))].sort().reverse();
  const moisActuelKey=now.getFullYear()+"-"+String(now.getMonth()).padStart(2,"0");
  if(!moisDispos.includes(moisActuelKey)) moisDispos.unshift(moisActuelKey);
  const dossiersDuMois=dossiers.filter(d=>{const {mois,annee}=getMoisAnnee(d.dateCreation);return mois===moisActif&&annee===anneeActive;});
  const caEstime=dossiersDuMois.reduce((s,d)=>s+genFacture(d,tarifs).ht,0);

  // Alertes comptable
  const enAttente=dossiers.filter(d=>d.statutFacture==="en_attente");
  const modifiees=dossiers.filter(d=>d.statutFacture==="modifiee");

  return (
    <div>
      {/* Alertes comptable */}
      {role==="comptable"&&(enAttente.length>0||modifiees.length>0)&&(
        <div style={{marginBottom:16}}>
          {enAttente.length>0&&(
            <div style={{background:"#fef3c7",border:"2px solid #d97706",borderRadius:10,padding:"12px 16px",marginBottom:8,fontFamily:"sans-serif"}}>
              <div style={{fontWeight:700,color:"#92400e",fontSize:14,marginBottom:4}}>⏳ {enAttente.length} facture(s) en attente de validation</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {enAttente.map(d=><button key={d.id} onClick={()=>onVoirFacture(d)} style={sf.btn("warning",{fontSize:12,padding:"4px 10px"})}>{d.client}{d.invoiceRef?" #"+d.invoiceRef:""}</button>)}
              </div>
            </div>
          )}
          {modifiees.length>0&&(
            <div style={{background:"#fee2e2",border:"2px solid #dc2626",borderRadius:10,padding:"12px 16px",fontFamily:"sans-serif"}}>
              <div style={{fontWeight:700,color:C.danger,fontSize:14,marginBottom:4}}>⚠️ {modifiees.length} facture(s) modifiée(s) après validation</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {modifiees.map(d=><button key={d.id} onClick={()=>onVoirFacture(d)} style={sf.btn("danger",{fontSize:12,padding:"4px 10px"})}>{d.client}{d.invoiceRef?" #"+d.invoiceRef:""}</button>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerte quai : factures modifiées */}
      {role==="chef"&&modifiees.length>0&&(
        <div style={{background:"#fee2e2",border:"2px solid #dc2626",borderRadius:10,padding:"12px 16px",marginBottom:16,fontFamily:"sans-serif"}}>
          <div style={{fontWeight:700,color:C.danger,fontSize:14}}>⚠️ {modifiees.length} facture(s) modifiée(s) en attente de re-validation par le comptable</div>
        </div>
      )}

      {/* Onglets mois */}
      <div style={{display:"flex",gap:4,overflowX:"auto",marginBottom:16,flexWrap:"wrap"}}>
        {moisDispos.map(key=>{
          const [a,m]=key.split("-");const annee=parseInt(a);const mois=parseInt(m);
          const actif=mois===moisActif&&annee===anneeActive;
          const nb=dossiers.filter(d=>{const dm=getMoisAnnee(d.dateCreation);return dm.mois===mois&&dm.annee===annee;}).length;
          return <button key={key} onClick={()=>{setMoisActif(mois);setAnneeActive(annee);}} style={{padding:"8px 14px",border:"1px solid "+(actif?C.accent:C.border),borderBottom:actif?"3px solid "+C.accent:"1px solid "+C.border,borderRadius:"6px 6px 0 0",background:actif?C.paper:"#ebe8e2",color:actif?C.ink:C.muted,fontFamily:"sans-serif",fontSize:13,cursor:"pointer",fontWeight:actif?700:400,whiteSpace:"nowrap"}}>
            {MOIS[mois]} {annee}{nb>0&&<span style={{marginLeft:6,background:actif?C.accent:C.muted,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10}}>{nb}</span>}
          </button>;
        })}
      </div>

      {/* KPIs */}
      <div style={{...sf.card,padding:0,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)"}}>
          {[{val:dossiersDuMois.length,label:"Dossiers",color:C.ink},{val:dossiersDuMois.filter(d=>d.statut==="ouvert").length,label:"En cours",color:"#d97706"},{val:dossiersDuMois.filter(d=>d.statut==="ouvert").reduce((s,d)=>{const e=d.mouvements.filter(m=>m.type==="entree").reduce((a,m)=>a+m.palettes,0);const so=d.mouvements.filter(m=>m.type==="sortie").reduce((a,m)=>a+m.palettes,0);return s+e-so;},0),label:"Palettes stock",color:"#2563eb"},{val:caEstime.toFixed(0)+" €",label:"CA HT mois",color:C.accent}].map((k,i)=>(
            <div key={i} style={{textAlign:"center",padding:"16px 8px",borderRight:i<3?"1px solid "+C.border:"none"}}>
              <div style={{fontSize:26,fontWeight:"bold",color:k.color}}>{k.val}</div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:2}}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Liste dossiers */}
      <div style={sf.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={sf.sec}>Dossiers — {MOIS[moisActif]} {anneeActive}</div>
          {caEstime>0&&<div style={{fontFamily:"sans-serif",fontSize:13,color:C.muted}}>HT : <strong style={{color:C.accent}}>{caEstime.toFixed(2)} €</strong></div>}
        </div>
        {dossiersDuMois.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.muted,fontFamily:"sans-serif"}}><div style={{fontSize:40,marginBottom:8}}>📦</div>Aucun dossier ce mois-ci</div>}
        {dossiersDuMois.map(d=>{
          const totalE=d.mouvements.filter(m=>m.type==="entree").reduce((s,m)=>s+m.palettes,0);
          const totalS=d.mouvements.filter(m=>m.type==="sortie").reduce((s,m)=>s+m.palettes,0);
          const ht=genFacture(d,tarifs).ht;
          const clientObj=clients.find(c=>c.nom===d.client);
          const sf2=d.statutFacture;
          const estVerrouillee=sf2==="validee";
          const bgCard=sf2==="modifiee"?"#fff5f5":sf2==="en_attente"?"#fffbf0":sf2==="validee"?"#f0fdf4":"#fff";
          const borderCard=sf2==="modifiee"?"2px solid #dc2626":sf2==="en_attente"?"2px solid #d97706":sf2==="validee"?"2px solid #16a34a":"1px solid "+C.border;
          return <div key={d.id} style={{border:borderCard,borderRadius:8,marginBottom:10,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:bgCard,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontWeight:"bold",fontSize:14,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {d.client}
                    {d.invoiceRef&&<span style={{color:C.accent,fontFamily:"sans-serif",fontSize:12,fontWeight:400}}>#{d.invoiceRef}</span>}
                    {clientObj&&!clientObj.tva&&<span style={{fontSize:10,background:"#fef9c3",color:"#92400e",padding:"1px 6px",borderRadius:10,fontFamily:"sans-serif",fontWeight:600}}>HT</span>}
                  </div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"sans-serif",marginTop:2}}>{d.dateCreation} · {d.mouvements.length} mvt{d.notes?" · "+d.notes:""}</div>
                </div>
                <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,fontFamily:"sans-serif",background:d.statut==="ouvert"?"#fef3c7":C.success,color:d.statut==="ouvert"?"#92400e":"#166534"}}>{d.statut==="ouvert"?"En cours":"Clôturé"}</span>
                <Badge statutFacture={sf2}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div style={{textAlign:"right",fontFamily:"sans-serif"}}>
                  <div style={{fontSize:10,color:C.muted}}>↓{totalE} / ↑{totalS} / {totalE-totalS}</div>
                  <div style={{fontWeight:"bold",fontSize:15}}>{ht.toFixed(2)} € HT</div>
                </div>
                {/* Actions chef de quai */}
                {role==="chef"&&!estVerrouillee&&sf2!=="en_attente"&&<button style={sf.btn("default",{padding:"5px 10px",fontSize:12})} onClick={()=>onModifier(d)}>✏️</button>}
                {role==="chef"&&!sf2&&<button style={sf.btn("warning",{padding:"5px 10px",fontSize:12})} onClick={()=>updateStatutFacture(d.id,"en_attente",setDossiers)}>📤 Envoyer compta</button>}
                {role==="chef"&&sf2==="en_attente"&&<span style={{fontFamily:"sans-serif",fontSize:11,color:"#d97706"}}>⏳ En attente</span>}
                {role==="chef"&&estVerrouillee&&<button style={sf.btn("danger",{padding:"5px 10px",fontSize:12})} onClick={()=>{if(window.confirm("Déverrouiller cette facture validée ? Le comptable sera alerté."))onModifier(d);}}>🔓 Déverrouiller</button>}
                {/* Actions comptable */}
                {role==="comptable"&&sf2==="en_attente"&&<button style={sf.btn("success",{padding:"5px 10px",fontSize:12})} onClick={()=>updateStatutFacture(d.id,"validee",setDossiers)}>✅ Valider</button>}
                {role==="comptable"&&sf2==="modifiee"&&<button style={sf.btn("success",{padding:"5px 10px",fontSize:12})} onClick={()=>updateStatutFacture(d.id,"validee",setDossiers)}>✅ Re-valider</button>}
                {role==="comptable"&&estVerrouillee&&<button style={sf.btn("default",{padding:"5px 10px",fontSize:12})} onClick={()=>updateStatutFacture(d.id,null,setDossiers)}>🔓 Dévalider</button>}
                <button style={sf.btn("primary",{padding:"5px 10px",fontSize:12})} onClick={()=>onVoirFacture(d)}>Facture</button>
              </div>
            </div>
            <div style={{padding:"6px 16px",display:"flex",gap:6,flexWrap:"wrap",borderTop:"1px solid "+C.border,background:"#fafafa"}}>
              {d.mouvements.sort((a,b)=>a.date.localeCompare(b.date)).map(m=>(
                <span key={m.id} style={sf.tag(m.type)}>{m.type==="entree"?"↓":"↑"} {m.palettes} pal. · {m.date}{m.provenance?" · "+m.provenance:""}</span>
              ))}
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}

// ─── PAGE FACTURE ───────────────────────────────────────────────────────────
function PageFacture({dossier,clients,tarifs,onRetour,role,setDossiers}) {
  const clientObj=clients.find(c=>c.nom===dossier.client)||{tva:true};
  const avecTVA=dossier.tvaClient!==undefined?dossier.tvaClient:clientObj.tva;
  const {lignes,ht}=genFacture(dossier,tarifs);
  const tva=avecTVA?ht*0.2:0;
  const ttc=ht+tva;
  const sf2=dossier.statutFacture;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <button style={sf.btn("ghost")} onClick={onRetour}>← Retour</button>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <Badge statutFacture={sf2}/>
          {role==="comptable"&&sf2==="en_attente"&&<button style={sf.btn("success")} onClick={()=>updateStatutFacture(dossier.id,"validee",setDossiers)}>✅ Valider la facture</button>}
          {role==="comptable"&&sf2==="modifiee"&&<button style={sf.btn("success")} onClick={()=>updateStatutFacture(dossier.id,"validee",setDossiers)}>✅ Re-valider</button>}
          {role==="comptable"&&sf2==="validee"&&<button style={sf.btn("default",{fontSize:12})} onClick={()=>updateStatutFacture(dossier.id,null,setDossiers)}>🔓 Dévalider</button>}
          <button style={sf.btn("accent")} onClick={()=>window.print()}>🖨️ Imprimer</button>
        </div>
      </div>
      <div style={sf.card}>
        <div style={{background:C.ink,color:"#fff",borderRadius:8,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:18,fontWeight:"bold"}}>DFDS · DÉPÔT HORS DFDS</div><div style={{color:"#9ca3af",fontSize:12,fontFamily:"sans-serif",marginTop:4}}>Zone Portuaire · Sète, France</div></div>
          <div style={{textAlign:"right",fontFamily:"sans-serif"}}>
            <div style={{color:C.accent,fontWeight:"bold",fontSize:15}}>{dossier.invoiceRef||"DOS-"+dossier.id.toString().slice(-5)}</div>
            <div style={{color:"#9ca3af",fontSize:12}}>Date : {today()} · Client : {dossier.client}</div>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={sf.sec}>Mouvements</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{dossier.mouvements.sort((a,b)=>a.date.localeCompare(b.date)).map(m=>(<span key={m.id} style={sf.tag(m.type)}>{m.type==="entree"?"↓":"↑"} {m.palettes} pal. · {m.date}{m.provenance?" · "+m.provenance:""}</span>))}</div>
        </div>
        <div style={sf.sec}>Détail de facturation</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:13,marginBottom:20,minWidth:400}}>
            <thead><tr style={{background:C.bg}}>{["Désignation","Qté","PU HT","Total HT"].map((h,i)=><th key={h} style={{padding:"8px 12px",textAlign:i===0?"left":"right",fontSize:10,textTransform:"uppercase",color:C.muted,borderBottom:"2px solid "+C.border}}>{h}</th>)}</tr></thead>
            <tbody>{lignes.map((l,i)=><tr key={i} style={{borderBottom:"1px solid "+C.border}}><td style={{padding:"9px 12px"}}>{l.desc}</td><td style={{padding:"9px 12px",textAlign:"right"}}>{l.qty}</td><td style={{padding:"9px 12px",textAlign:"right"}}>{(l.pu||0).toFixed(2)} €</td><td style={{padding:"9px 12px",textAlign:"right",fontWeight:"bold"}}>{l.total.toFixed(2)} €</td></tr>)}</tbody>
          </table>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <div style={{width:"min(300px,100%)",fontFamily:"sans-serif"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.border,color:C.muted,fontSize:14}}><span>Total HT</span><span>{ht.toFixed(2)} €</span></div>
            {avecTVA?<div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid "+C.border,color:C.muted,fontSize:14}}><span>TVA 20%</span><span>{tva.toFixed(2)} €</span></div>:<div style={{padding:"8px 10px",background:"#fef9c3",borderRadius:4,fontSize:12,color:"#92400e",fontWeight:600,marginBottom:4}}>⚠️ Client exonéré — HT uniquement</div>}
            <div style={{display:"flex",justifyContent:"space-between",padding:"14px 0",fontWeight:"bold",fontSize:18}}><span>TOTAL {avecTVA?"TTC":"HT"}</span><span style={{color:C.accent}}>{ttc.toFixed(2)} €</span></div>
          </div>
        </div>
        {dossier.notes&&<div style={{padding:"10px 14px",background:C.accentLight,borderRadius:6,fontFamily:"sans-serif",fontSize:13,borderLeft:"3px solid "+C.accent}}>📝 {dossier.notes}</div>}
      </div>
    </div>
  );
}

// ─── PAGE DASHBOARD ─────────────────────────────────────────────────────────
function PageDashboard({dossiers,clients,tarifs}) {
  const now=new Date();
  const [annee,setAnnee]=useState(now.getFullYear());
  const [clientFiltre,setClientFiltre]=useState("Tous");
  const annees=[...new Set(dossiers.map(d=>getMoisAnnee(d.dateCreation).annee))].sort().reverse();
  if(!annees.includes(annee)&&annees.length>0) annees.unshift(annee);
  const dossiersFiltres=dossiers.filter(d=>{const {annee:a}=getMoisAnnee(d.dateCreation);return a===annee&&(clientFiltre==="Tous"||d.client===clientFiltre);});
  const getHT=d=>genFacture(d,tarifs).ht;
  const caTotal=dossiersFiltres.reduce((s,d)=>s+getHT(d),0);
  const palTotal=dossiersFiltres.reduce((s,d)=>s+d.mouvements.filter(m=>m.type==="entree").reduce((a,m)=>a+m.palettes,0),0);
  const dossiersParMois=Array.from({length:12},(_,i)=>{const dd=dossiersFiltres.filter(d=>getMoisAnnee(d.dateCreation).mois===i);return {mois:MOIS[i],nb:dd.length,ca:dd.reduce((s,d)=>s+getHT(d),0),pal:dd.reduce((s,d)=>s+d.mouvements.filter(m=>m.type==="entree").reduce((a,m)=>a+m.palettes,0),0)};});
  const maxCA=Math.max(...dossiersParMois.map(m=>m.ca),1);
  const parClient={};
  dossiersFiltres.forEach(d=>{if(!parClient[d.client])parClient[d.client]={ca:0,nb:0,pal:0};parClient[d.client].ca+=getHT(d);parClient[d.client].nb++;parClient[d.client].pal+=d.mouvements.filter(m=>m.type==="entree").reduce((a,m)=>a+m.palettes,0);});
  const topClients=Object.entries(parClient).sort((a,b)=>b[1].ca-a[1].ca);
  return (
    <div>
      <div style={{...sf.card,padding:"14px 18px",marginBottom:16}}>
        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><label style={{...sf.label,margin:0}}>Année</label><select style={{...sf.select,width:"auto"}} value={annee} onChange={e=>setAnnee(+e.target.value)}>{annees.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}><label style={{...sf.label,margin:0}}>Client</label><select style={{...sf.select,width:"auto"}} value={clientFiltre} onChange={e=>setClientFiltre(e.target.value)}><option>Tous</option>{clients.map(c=><option key={c.nom} value={c.nom}>{c.nom}</option>)}</select></div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:16}}>
        {[{val:dossiersFiltres.length,label:"Dossiers",color:C.ink},{val:caTotal.toFixed(0)+" €",label:"CA HT total",color:C.accent},{val:palTotal,label:"Palettes entrées",color:"#2563eb"},{val:dossiersFiltres.filter(d=>d.statutFacture==="validee").length,label:"Factures validées",color:"#16a34a"}].map((k,i)=>(
          <div key={i} style={{...sf.card,textAlign:"center",padding:"16px 12px",marginBottom:0}}>
            <div style={{fontSize:26,fontWeight:"bold",color:k.color}}>{k.val}</div>
            <div style={{fontSize:10,color:C.muted,fontFamily:"sans-serif",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:4}}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={sf.card}>
        <div style={sf.sec}>CA HT par mois — {annee}</div>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:120,padding:"0 4px"}}>
          {dossiersParMois.map((m,i)=>(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><div style={{fontSize:9,fontFamily:"sans-serif",color:C.accent,fontWeight:600}}>{m.ca>0?m.ca.toFixed(0):""}</div><div style={{width:"100%",background:m.ca>0?C.accent:C.border,borderRadius:"3px 3px 0 0",height:Math.max(2,(m.ca/maxCA)*80)+"px"}}/><div style={{fontSize:8,fontFamily:"sans-serif",color:C.muted,textAlign:"center"}}>{m.mois.slice(0,3)}</div></div>))}
        </div>
      </div>
      <div style={sf.card}>
        <div style={sf.sec}>Par client</div>
        {topClients.length===0?<div style={{color:C.muted,fontFamily:"sans-serif",fontSize:13,textAlign:"center",padding:16}}>Aucune donnée</div>:topClients.map(([nom,data])=>(<div key={nom} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid "+C.border,flexWrap:"wrap",gap:8}}><div style={{fontFamily:"sans-serif"}}><div style={{fontWeight:600,fontSize:14}}>{nom}</div><div style={{fontSize:12,color:C.muted}}>{data.nb} dossier(s) · {data.pal} palettes</div></div><div style={{fontWeight:"bold",color:C.accent,fontFamily:"sans-serif",fontSize:15}}>{data.ca.toFixed(2)} € HT</div></div>))}
      </div>
      <div style={sf.card}>
        <div style={sf.sec}>Détail mensuel</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:13,minWidth:400}}>
            <thead><tr style={{background:C.bg}}>{["Mois","Dossiers","Palettes","CA HT"].map((h,i)=><th key={h} style={{padding:"8px 12px",textAlign:i===0?"left":"right",fontSize:10,textTransform:"uppercase",color:C.muted,borderBottom:"2px solid "+C.border}}>{h}</th>)}</tr></thead>
            <tbody>{dossiersParMois.map((m,i)=>(<tr key={i} style={{borderBottom:"1px solid "+C.border,background:i%2===0?"#fff":C.bg,opacity:m.nb===0?0.4:1}}><td style={{padding:"9px 12px",fontWeight:m.nb>0?600:400}}>{m.mois}</td><td style={{padding:"9px 12px",textAlign:"right"}}>{m.nb}</td><td style={{padding:"9px 12px",textAlign:"right"}}>{m.pal}</td><td style={{padding:"9px 12px",textAlign:"right",fontWeight:"bold",color:m.ca>0?C.accent:C.muted}}>{m.ca>0?m.ca.toFixed(2)+" €":"—"}</td></tr>))}</tbody>
            <tfoot><tr style={{background:C.ink,color:"#fff"}}><td style={{padding:"10px 12px",fontWeight:"bold"}}>TOTAL</td><td style={{padding:"10px 12px",textAlign:"right",fontWeight:"bold"}}>{dossiersFiltres.length}</td><td style={{padding:"10px 12px",textAlign:"right",fontWeight:"bold"}}>{palTotal}</td><td style={{padding:"10px 12px",textAlign:"right",fontWeight:"bold",color:C.accent}}>{caTotal.toFixed(2)} €</td></tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE EXPORT ─────────────────────────────────────────────────────────────
function PageExport({dossiers,clients,tarifs}) {
  const now=new Date();
  const [annee,setAnnee]=useState(now.getFullYear());
  const [mois,setMois]=useState(now.getMonth());
  const [selection,setSelection]=useState({});
  const annees=[...new Set(dossiers.map(d=>getMoisAnnee(d.dateCreation).annee))].sort().reverse();
  if(!annees.includes(annee)) annees.unshift(annee);
  const dossiersDuMois=dossiers.filter(d=>{const {mois:m,annee:a}=getMoisAnnee(d.dateCreation);return m===mois&&a===annee;});
  const getHT=d=>genFacture(d,tarifs).ht;
  const toggleAll=()=>{if(Object.keys(selection).length===dossiersDuMois.length)setSelection({});else{const s={};dossiersDuMois.forEach(d=>s[d.id]=true);setSelection(s);}};
  const selectionnes=dossiersDuMois.filter(d=>selection[d.id]);
  const caSelection=selectionnes.reduce((s,d)=>s+getHT(d),0);
  const handleExport=()=>{
    const contenu=`<html><head><style>body{font-family:sans-serif;font-size:13px;padding:20px;color:#1a1a2e}h1{font-size:18px;border-bottom:2px solid #c8973a;padding-bottom:8px}h2{font-size:14px;color:#6b7280;margin-top:20px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#f5f3ef;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;border-bottom:2px solid #e5e1d8}td{padding:8px;border-bottom:1px solid #e5e1d8}.right{text-align:right}.bold{font-weight:bold}.accent{color:#c8973a}.total-row{background:#1a1a2e;color:white;font-weight:bold}.total-row td{padding:10px}</style></head><body>
    <h1>DFDS · Dépôt Hors DFDS — Récapitulatif ${MOIS[mois]} ${annee}</h1>
    <p>Export généré le ${new Date().toLocaleDateString("fr-FR")} · ${selectionnes.length} dossier(s)</p>
    <table><thead><tr><th>Client</th><th>Invoice Ref</th><th>Statut</th><th>Validation</th><th>Palettes</th><th class="right">Total HT</th><th class="right">TVA</th><th class="right">Total</th></tr></thead>
    <tbody>${selectionnes.map(d=>{const ht=getHT(d);const clientObj=clients.find(c=>c.nom===d.client)||{tva:true};const avecTVA=d.tvaClient!==undefined?d.tvaClient:clientObj.tva;const tva=avecTVA?ht*0.2:0;const ttc=ht+tva;const sfLabel={null:"Brouillon",en_attente:"En attente",validee:"✓ Validée",modifiee:"⚠️ Modifiée"}[d.statutFacture]||"—";return `<tr><td class="bold">${d.client}</td><td>${d.invoiceRef||"—"}</td><td>${d.statut==="ouvert"?"En cours":"Clôturé"}</td><td>${sfLabel}</td><td>${d.mouvements.filter(m=>m.type==="entree").reduce((s,m)=>s+m.palettes,0)}</td><td class="right accent bold">${ht.toFixed(2)} €</td><td class="right">${avecTVA?tva.toFixed(2)+" €":"HT"}</td><td class="right bold">${ttc.toFixed(2)} €</td></tr>`;}).join("")}</tbody>
    <tfoot><tr class="total-row"><td colspan="5">TOTAL</td><td class="right">${caSelection.toFixed(2)} €</td><td>—</td><td>—</td></tr></tfoot></table>
    <p style="font-size:11px;color:#6b7280">* Le TTC varie selon les clients exonérés de TVA. Voir le détail par dossier.</p>
    ${selectionnes.map(d=>{const {lignes,ht}=genFacture(d,tarifs);const clientObj=clients.find(c=>c.nom===d.client)||{tva:true};const avecTVA=d.tvaClient!==undefined?d.tvaClient:clientObj.tva;const tva=avecTVA?ht*0.2:0;return `<h2>${d.client}${d.invoiceRef?" — "+d.invoiceRef:""}</h2><table><thead><tr><th>Désignation</th><th class="right">Qté</th><th class="right">PU HT</th><th class="right">Total HT</th></tr></thead><tbody>${lignes.map(l=>`<tr><td>${l.desc}</td><td class="right">${l.qty}</td><td class="right">${(l.pu||0).toFixed(2)} €</td><td class="right bold">${l.total.toFixed(2)} €</td></tr>`).join("")}</tbody><tfoot><tr class="total-row"><td colspan="2">Total HT</td><td class="right" colspan="2">${ht.toFixed(2)} €</td></tr>${avecTVA?`<tr class="total-row"><td colspan="2">TVA 20%</td><td class="right" colspan="2">${tva.toFixed(2)} €</td></tr><tr class="total-row"><td colspan="2">TOTAL TTC</td><td class="right" colspan="2">${(ht+tva).toFixed(2)} €</td></tr>`:`<tr class="total-row"><td colspan="2">TOTAL HT (exonéré TVA)</td><td class="right" colspan="2">${ht.toFixed(2)} €</td></tr>`}</tfoot></table>`;}).join("")}
    </body></html>`;
    const w=window.open("","_blank");w.document.write(contenu);w.document.close();w.print();
  };
  return (
    <div>
      <div style={sf.card}>
        <div style={sf.sec}>Période</div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><label style={{...sf.label,margin:0}}>Mois</label><select style={{...sf.select,width:"auto"}} value={mois} onChange={e=>setMois(+e.target.value)}>{MOIS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}><label style={{...sf.label,margin:0}}>Année</label><select style={{...sf.select,width:"auto"}} value={annee} onChange={e=>setAnnee(+e.target.value)}>{annees.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
        </div>
      </div>
      <div style={sf.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={sf.sec}>{dossiersDuMois.length} dossier(s) — {MOIS[mois]} {annee}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button style={sf.btn("default",{padding:"6px 12px",fontSize:12})} onClick={toggleAll}>{Object.keys(selection).length===dossiersDuMois.length?"Désélectionner tout":"Sélectionner tout"}</button>
            <button style={sf.btn("success",{padding:"6px 12px",fontSize:12})} onClick={handleExport} disabled={selectionnes.length===0}>📄 Exporter {selectionnes.length>0?"("+selectionnes.length+")":""}</button>
          </div>
        </div>
        {selectionnes.length>0&&<div style={{background:C.accentLight,border:"1px solid "+C.accent+"44",borderRadius:6,padding:"8px 14px",marginBottom:12,fontFamily:"sans-serif",fontSize:13}}>Sélection : <strong>{selectionnes.length}</strong> · HT : <strong style={{color:C.accent}}>{caSelection.toFixed(2)} €</strong></div>}
        {dossiersDuMois.length===0?<div style={{textAlign:"center",padding:"30px 0",color:C.muted,fontFamily:"sans-serif"}}>Aucun dossier</div>
          :dossiersDuMois.map(d=>{const ht=getHT(d);const clientObj=clients.find(c=>c.nom===d.client)||{tva:true};const avecTVA=d.tvaClient!==undefined?d.tvaClient:clientObj.tva;
            return <div key={d.id} onClick={()=>setSelection(sel=>({...sel,[d.id]:!sel[d.id]}))} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:8,marginBottom:8,border:"2px solid "+(selection[d.id]?C.accent:C.border),background:selection[d.id]?C.accentLight:"#fff",cursor:"pointer",flexWrap:"wrap"}}>
              <div style={{width:20,height:20,borderRadius:4,border:"2px solid "+(selection[d.id]?C.accent:C.border),background:selection[d.id]?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{selection[d.id]&&<span style={{color:"#fff",fontSize:14,lineHeight:1}}>✓</span>}</div>
              <div style={{flex:1,fontFamily:"sans-serif"}}>
                <div style={{fontWeight:600,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{d.client}{d.invoiceRef&&<span style={{color:C.accent,fontWeight:400,fontSize:12}}>#{d.invoiceRef}</span>}<Badge statutFacture={d.statutFacture}/></div>
                <div style={{fontSize:12,color:C.muted}}>{d.dateCreation} · {d.mouvements.filter(m=>m.type==="entree").reduce((s,m)=>s+m.palettes,0)} pal.</div>
              </div>
              <div style={{textAlign:"right",fontFamily:"sans-serif"}}>
                <div style={{fontWeight:"bold",color:C.accent}}>{ht.toFixed(2)} € HT</div>
                {avecTVA?<div style={{fontSize:12,color:C.muted}}>{(ht*1.2).toFixed(2)} € TTC</div>:<div style={{fontSize:10,color:"#92400e",background:"#fef9c3",padding:"1px 6px",borderRadius:10}}>HT</div>}
              </div>
            </div>;
          })}
      </div>
    </div>
  );
}

// ─── PAGE CLIENTS ───────────────────────────────────────────────────────────
function PageClients({clients,setClients}) {
  const [newClient,setNewClient]=useState({nom:"",tva:true});
  const [editing,setEditing]=useState(null);
  const [erreur,setErreur]=useState("");
  const add=async()=>{const nom=newClient.nom.trim().toUpperCase();if(!nom){setErreur("Nom requis.");return;}if(clients.find(c=>c.nom===nom)){setErreur("Existe déjà.");return;}await supabase.from("clients").upsert({nom,tva:newClient.tva});setClients(cs=>[...cs,{nom,tva:newClient.tva}]);setNewClient({nom:"",tva:true});setErreur("");};
  const saveEdit=async(ancien)=>{const nom=editing.nom.trim().toUpperCase();if(!nom)return;if(nom!==ancien&&clients.find(c=>c.nom===nom)){setErreur("Existe déjà.");return;}await supabase.from("clients").delete().eq("nom",ancien);await supabase.from("clients").upsert({nom,tva:editing.tva});setClients(cs=>cs.map(c=>c.nom===ancien?{nom,tva:editing.tva}:c));setEditing(null);setErreur("");};
  const del=async(nom)=>{await supabase.from("clients").delete().eq("nom",nom);setClients(cs=>cs.filter(x=>x.nom!==nom));};
  return (
    <div>
      <div style={sf.card}>
        <div style={sf.sec}>Ajouter un client</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 200px 120px",gap:12,alignItems:"end"}}>
          <div><label style={sf.label}>Nom</label><input style={sf.input} placeholder="ex: LATASTE" value={newClient.nom} onChange={e=>{setNewClient(n=>({...n,nom:e.target.value.toUpperCase()}));setErreur("");}}/></div>
          <div><label style={sf.label}>TVA ?</label><select style={sf.select} value={newClient.tva?"oui":"non"} onChange={e=>setNewClient(n=>({...n,tva:e.target.value==="oui"}))}><option value="oui">✅ Oui — TTC</option><option value="non">⚠️ Non — HT</option></select></div>
          <button style={sf.btn("accent")} onClick={add}>+ Ajouter</button>
        </div>
        {erreur&&<div style={{color:C.danger,fontFamily:"sans-serif",fontSize:12,marginTop:8}}>⚠️ {erreur}</div>}
      </div>
      <div style={sf.card}>
        <div style={sf.sec}>{clients.length} client(s)</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:14,minWidth:400}}>
            <thead><tr style={{background:C.bg}}>{["Nom","TVA","Facturation","Actions"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,textTransform:"uppercase",color:C.muted,borderBottom:"2px solid "+C.border}}>{h}</th>)}</tr></thead>
            <tbody>{clients.map((c,i)=>{const isE=editing&&editing._orig===c.nom;return <tr key={c.nom} style={{borderBottom:"1px solid "+C.border,background:i%2===0?"#fff":C.bg}}><td style={{padding:"10px 12px"}}>{isE?<input style={{...sf.input,padding:"5px 10px",fontSize:13}} value={editing.nom} onChange={e=>setEditing(ed=>({...ed,nom:e.target.value.toUpperCase()}))}/>:<span style={{fontWeight:600}}>{c.nom}</span>}</td><td style={{padding:"10px 12px"}}>{isE?<select style={{...sf.select,padding:"5px",fontSize:13}} value={editing.tva?"oui":"non"} onChange={e=>setEditing(ed=>({...ed,tva:e.target.value==="oui"}))}><option value="oui">✅</option><option value="non">⚠️</option></select>:<span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:c.tva?"#dcfce7":"#fef9c3",color:c.tva?"#166534":"#92400e"}}>{c.tva?"Oui":"Non"}</span>}</td><td style={{padding:"10px 12px",color:C.muted,fontSize:12}}>{(isE?editing.tva:c.tva)?"TTC":"HT"}</td><td style={{padding:"10px 12px"}}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{isE?<><button style={sf.btn("primary",{padding:"4px 10px",fontSize:12})} onClick={()=>saveEdit(c.nom)}>✓</button><button style={sf.btn("default",{padding:"4px 10px",fontSize:12})} onClick={()=>setEditing(null)}>✕</button></>:<><button style={sf.btn("default",{padding:"4px 10px",fontSize:12})} onClick={()=>setEditing({nom:c.nom,tva:c.tva,_orig:c.nom})}>✏️</button><button style={sf.btn("danger",{padding:"4px 10px",fontSize:12})} onClick={()=>del(c.nom)}>🗑️</button></>}</div></td></tr>;})}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE TARIFS ─────────────────────────────────────────────────────────────
function PageTarifs({tarifs,setTarifs}) {
  const [editingId,setEditingId]=useState(null);
  const [editVal,setEditVal]=useState(0);
  const saveEdit=(id)=>{const updated=tarifs.map(t=>t.id===id?{...t,prix:+editVal}:t);setTarifs(updated);localStorage.setItem("dm_tarifs",JSON.stringify(updated));setEditingId(null);};
  return (
    <div style={sf.card}>
      <div style={sf.sec}>Grille tarifaire — modifiable</div>
      <div style={{background:"#fef9c3",border:"1px solid #fcd34d",borderRadius:6,padding:"8px 14px",marginBottom:16,fontFamily:"sans-serif",fontSize:12,color:"#92400e"}}>⚠️ La modification des tarifs n'affecte pas les dossiers déjà créés.</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"sans-serif",fontSize:14,minWidth:400}}>
          <thead><tr style={{background:C.bg}}>{["Prestation","Prix HT","Unité","Action"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,textTransform:"uppercase",color:C.muted,borderBottom:"2px solid "+C.border}}>{h}</th>)}</tr></thead>
          <tbody>{tarifs.map((t,i)=>{const isE=editingId===t.id;return <tr key={t.id} style={{borderBottom:"1px solid "+C.border,background:i%2===0?"#fff":C.bg}}><td style={{padding:"10px 12px",fontWeight:500}}>{t.label}</td><td style={{padding:"10px 12px"}}>{isE?<input style={{...sf.input,width:80,padding:"4px 8px",fontSize:13}} type="number" step="0.01" value={editVal} onChange={e=>setEditVal(e.target.value)}/>:<span style={{fontWeight:"bold",color:C.accent}}>{t.prix} €</span>}</td><td style={{padding:"10px 12px",color:C.muted,fontSize:12}}>{t.unite}</td><td style={{padding:"10px 12px"}}>{isE?<div style={{display:"flex",gap:6}}><button style={sf.btn("primary",{padding:"4px 10px",fontSize:12})} onClick={()=>saveEdit(t.id)}>✓</button><button style={sf.btn("default",{padding:"4px 10px",fontSize:12})} onClick={()=>setEditingId(null)}>✕</button></div>:<button style={sf.btn("default",{padding:"4px 10px",fontSize:12})} onClick={()=>{setEditingId(t.id);setEditVal(t.prix);}}>✏️</button>}</td></tr>;})}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── APP PRINCIPALE ──────────────────────────────────────────────────────────
export default function DepotManager() {
  const [role,setRole]=useState(()=>sessionStorage.getItem("dm_role")||null);
  const [tab,setTab]=useState("dossiers");
  const [factureOuverte,setFactureOuverte]=useState(null);
  const [editingDossier,setEditingDossier]=useState(null);
  const [dossiers,setDossiers]=useState([]);
  const [clients,setClients]=useState(CLIENTS_INIT);
  const [tarifs,setTarifs]=useState(()=>{try{const t=localStorage.getItem("dm_tarifs");return t?JSON.parse(t):TARIFS_DEFAUT;}catch{return TARIFS_DEFAUT;}});
  const [chargement,setChargement]=useState(true);

  const handleLogin=(r)=>{sessionStorage.setItem("dm_role",r);setRole(r);};
  const handleLogout=()=>{sessionStorage.removeItem("dm_role");setRole(null);setTab("dossiers");};

  useEffect(()=>{
    if(!role)return;
    async function charger(){
      const {data:d}=await supabase.from("dossiers").select("*");
      const {data:c}=await supabase.from("clients").select("*");
      if(d) setDossiers(d.map(x=>({...x,dateCreation:x.date_creation,invoiceRef:x.invoice_ref,fraisSupp:x.frais_supp||[],lignesSnap:x.lignes_snap||null,tvaClient:x.tva_client,statutFacture:x.statut_facture||null})));
      if(c&&c.length>0) setClients(c);
      setChargement(false);
    }
    charger();
  },[role]);

  const saveDossier=async(d)=>{
    await supabase.from("dossiers").upsert({
      id:d.id,client:d.client,invoice_ref:d.invoiceRef,notes:d.notes,
      palettisation:d.palettisation,depotage:d.depotage,statut:d.statut,
      date_creation:d.dateCreation,mouvements:d.mouvements,
      frais_supp:d.fraisSupp||[],lignes_snap:d.lignesSnap||null,
      tva_client:d.tvaClient,statut_facture:d.statutFacture||null
    });
    setDossiers(ds=>{const idx=ds.findIndex(x=>x.id===d.id);if(idx>=0){const n=[...ds];n[idx]=d;return n;}return [d,...ds];});
    setEditingDossier(null);
    setTab("dossiers");
  };

  const handleModifier=(d)=>{setEditingDossier(d);setTab("modifier");};

  if(!role) return <PageLogin onLogin={handleLogin}/>;

  const TABS_CHEF=[{id:"dossiers",label:"📁 Dossiers",short:"Dossiers"},{id:"nouveau",label:"➕ Nouveau",short:"Nouveau"},{id:"dashboard",label:"📊 Stats",short:"Stats"},{id:"export",label:"📄 Export",short:"Export"},{id:"clients",label:"👥 Clients",short:"Clients"},{id:"tarifs",label:"💶 Tarifs",short:"Tarifs"}];
  const TABS_COMPTA=[{id:"dossiers",label:"📁 Dossiers",short:"Dossiers"},{id:"dashboard",label:"📊 Stats",short:"Stats"},{id:"export",label:"📄 Export PDF",short:"Export"}];
  const TABS=role==="chef"?TABS_CHEF:TABS_COMPTA;

  // Compteur alertes
  const nbAlertes=dossiers.filter(d=>d.statutFacture==="en_attente"||d.statutFacture==="modifiee").length;

  if(chargement) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:C.muted,flexDirection:"column",gap:12}}><div style={{fontSize:32}}>⏳</div>Chargement...</div>;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Georgia',serif",color:C.ink}}>
      <header style={{background:C.ink,color:"#fff",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:C.accent,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:"bold",color:C.ink,flexShrink:0}}>D</div>
          <div>
            <div style={{fontSize:14,fontWeight:"bold",letterSpacing:"0.04em"}}>DÉPÔT MANAGER</div>
            <div style={{fontSize:9,color:C.accent,letterSpacing:"0.1em",textTransform:"uppercase"}}>{role==="chef"?"Chef de quai":"Comptable"}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {role==="comptable"&&nbAlertes>0&&<div style={{background:C.danger,color:"#fff",borderRadius:20,padding:"2px 8px",fontSize:11,fontFamily:"sans-serif",fontWeight:700}}>🔔 {nbAlertes}</div>}
          <div style={{fontSize:10,color:"#00d97e",fontFamily:"sans-serif",display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:"#00d97e"}}/>Cloud</div>
          <button onClick={handleLogout} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:11,padding:"4px 8px",borderRadius:4,fontFamily:"sans-serif"}}>Déconnexion</button>
        </div>
      </header>
      <nav style={{background:C.paper,borderBottom:"1px solid "+C.border,display:"flex",padding:"0 8px",overflowX:"auto"}}>
        {TABS.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"11px 12px",border:"none",background:"transparent",borderBottom:tab===t.id?"3px solid "+C.accent:"3px solid transparent",color:tab===t.id?C.ink:C.muted,fontWeight:tab===t.id?"bold":"normal",cursor:"pointer",fontSize:12,fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.short}</button>))}
        {(tab==="facture"||tab==="modifier")&&<button style={{padding:"11px 12px",border:"none",background:"transparent",borderBottom:"3px solid "+C.accent,color:C.ink,fontWeight:"bold",cursor:"default",fontSize:12,fontFamily:"inherit",whiteSpace:"nowrap"}}>{tab==="facture"?"🧾 Facture":"✏️ Modifier"}</button>}
      </nav>
      <main style={{padding:"16px",maxWidth:1100,margin:"0 auto"}}>
        {tab==="dossiers"&&<PageDossiers dossiers={dossiers} clients={clients} tarifs={tarifs} role={role} onVoirFacture={d=>{setFactureOuverte(d);setTab("facture");}} setDossiers={setDossiers} onModifier={handleModifier}/>}
        {tab==="nouveau"&&role==="chef"&&<FormDossier clients={clients} tarifs={tarifs} onSave={saveDossier}/>}
        {tab==="modifier"&&editingDossier&&<FormDossier clients={clients} tarifs={tarifs} dossierInitial={editingDossier} onSave={saveDossier} onCancel={()=>setTab("dossiers")}/>}
        {tab==="dashboard"&&<PageDashboard dossiers={dossiers} clients={clients} tarifs={tarifs}/>}
        {tab==="export"&&<PageExport dossiers={dossiers} clients={clients} tarifs={tarifs}/>}
        {tab==="clients"&&role==="chef"&&<PageClients clients={clients} setClients={setClients}/>}
        {tab==="tarifs"&&role==="chef"&&<PageTarifs tarifs={tarifs} setTarifs={setTarifs}/>}
        {tab==="facture"&&factureOuverte&&<PageFacture dossier={factureOuverte} clients={clients} tarifs={tarifs} role={role} setDossiers={setDossiers} onRetour={()=>setTab("dossiers")}/>}
      </main>
    </div>
  );
}
