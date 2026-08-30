const supabaseUrl=window.BIJAKWANG_SUPABASE_URL;
const supabaseKey=window.BIJAKWANG_SUPABASE_KEY;
const sb=window.supabase.createClient(supabaseUrl,supabaseKey);
let questions=[],editingId=null;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function setStatus(el,msg,error=false){el.textContent=msg;el.classList.toggle("error",error)}

async function isAdmin(){
  const {data:{user}}=await sb.auth.getUser();
  if(!user)return null;
  const {data,error}=await sb.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(error){console.error(error);return null}
  return data?user:null;
}

async function load(){
  setStatus($("appStatus"),"Memuatkan soalan...");
  const {data,error}=await sb.from("questions").select("id,category,answer,hint,is_active,created_at").order("created_at",{ascending:false});
  if(error){console.error(error);setStatus($("appStatus"),"Gagal memuatkan: "+error.message,true);return}
  questions=data||[];renderFilters();render();
  setStatus($("appStatus"),questions.length+" soalan.");
}

function renderFilters(){
  const old=$("categoryFilter").value;
  const cats=[...new Set(questions.map(q=>q.category||"UMUM"))].sort();
  $("categoryFilter").innerHTML='<option value="">Semua kategori</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");
  $("categoryFilter").value=cats.includes(old)?old:"";
}

function render(){
  const term=$("search").value.trim().toLowerCase();
  const cat=$("categoryFilter").value;
  const stat=$("statusFilter").value;
  const rows=questions.filter(q=>{
    const hit=!term||[q.answer,q.hint,q.category].some(x=>String(x||"").toLowerCase().includes(term));
    const catOk=!cat||q.category===cat;
    const statOk=!stat||(stat==="active"?q.is_active:!q.is_active);
    return hit&&catOk&&statOk;
  });
  $("questionRows").innerHTML=rows.length?rows.map(q=>`
    <tr>
      <td>${esc(q.category)}</td>
      <td><strong>${esc(q.answer)}</strong></td>
      <td>${esc(q.hint)}</td>
      <td><span class="pill ${q.is_active?"active":"inactive"}">${q.is_active?"AKTIF":"TIDAK AKTIF"}</span></td>
      <td><div class="actions">
        <button class="secondary small" data-edit="${q.id}">EDIT</button>
        <button class="secondary small" data-toggle="${q.id}">${q.is_active?"NYAHAKTIF":"AKTIFKAN"}</button>
        <button class="small" style="background:#a8324a;color:#fff" data-delete="${q.id}">PADAM</button>
      </div></td>
    </tr>`).join(""):'<tr><td colspan="5">Tiada soalan.</td></tr>';
}

function openModal(q=null){
  editingId=q?.id||null;
  $("modalTitle").textContent=q?"Edit Soalan":"Tambah Soalan";
  $("qCategory").value=q?.category||"UMUM";
  $("qAnswer").value=q?.answer||"";
  $("qHint").value=q?.hint||"";
  $("qActive").checked=q?.is_active!==false;
  setStatus($("formStatus"),"");
  $("modal").classList.remove("hidden");
  $("qCategory").focus();
}
function closeModal(){$("modal").classList.add("hidden")}

async function save(){
  const category=$("qCategory").value.trim().toUpperCase()||"UMUM";
  const answer=$("qAnswer").value.trim().toUpperCase();
  const hint=$("qHint").value.trim();
  const is_active=$("qActive").checked;
  if(!answer||!hint){setStatus($("formStatus"),"Perkataan dan pembayang wajib diisi.",true);return}
  $("saveBtn").disabled=true;
  let result;
  if(editingId) result=await sb.from("questions").update({category,answer,hint,is_active}).eq("id",editingId);
  else result=await sb.from("questions").insert({category,answer,hint,is_active});
  $("saveBtn").disabled=false;
  if(result.error){console.error(result.error);setStatus($("formStatus"),result.error.message,true);return}
  closeModal();await load();
}

async function toggle(id){
  const q=questions.find(x=>x.id===id);if(!q)return;
  const {error}=await sb.from("questions").update({is_active:!q.is_active}).eq("id",id);
  if(error){alert(error.message);return}await load();
}
async function remove(id){
  const q=questions.find(x=>x.id===id);if(!q)return;
  if(!confirm(`Padam soalan "${q.answer}"?`))return;
  const {error}=await sb.from("questions").delete().eq("id",id);
  if(error){alert(error.message);return}await load();
}

function csvEscape(v){const s=String(v??"");return '"'+s.replace(/"/g,'""')+'"'}
function exportCsv(){
  const lines=[["category","answer","hint","is_active"].map(csvEscape).join(",")];
  questions.forEach(q=>lines.push([q.category,q.answer,q.hint,q.is_active].map(csvEscape).join(",")));
  const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="bijakwang_questions.csv";a.click();URL.revokeObjectURL(a.href);
}

function parseCsv(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
    if(quoted){if(c=='"'&&n=='"'){cell+='"';i++}else if(c=='"'){quoted=false}else cell+=c}
    else if(c=='"')quoted=true;
    else if(c==","){row.push(cell);cell=""}
    else if(c=="\n"){row.push(cell);rows.push(row);row=[];cell=""}
    else if(c!="\r")cell+=c;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row)}
  return rows;
}
async function importCsv(file){
  const text=await file.text(),rows=parseCsv(text);
  if(!rows.length)return;
  const header=rows[0].map(x=>x.trim().toLowerCase());
  const ci=header.indexOf("category"),ai=header.indexOf("answer"),hi=header.indexOf("hint"),si=header.indexOf("is_active");
  if(ai<0||hi<0){alert("CSV mesti ada column: answer,hint. category dan is_active adalah optional.");return}
  const payload=rows.slice(1).filter(r=>r[ai]?.trim()&&r[hi]?.trim()).map(r=>({
    category:(r[ci]||"UMUM").trim().toUpperCase(),
    answer:r[ai].trim().toUpperCase(),
    hint:r[hi].trim(),
    is_active:si<0?true:/^(true|1|yes|ya|aktif)$/i.test((r[si]||"true").trim())
  }));
  if(!payload.length){alert("Tiada data sah dalam CSV.");return}
  if(!confirm(`Import ${payload.length} soalan ke database?`))return;
  const {error}=await sb.from("questions").insert(payload);
  if(error){alert("Import gagal: "+error.message);return}
  alert(`Berjaya import ${payload.length} soalan.`);$("importFile").value="";await load();
}

async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    const user=await isAdmin();
    if(user){showApp(user);return}
    await sb.auth.signOut();
    setStatus($("loginStatus"),"Akaun ini bukan admin.",true);
  }
}
function showApp(user){
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("adminEmail").textContent=user.email||"Admin";load();
}

$("loginBtn").onclick=async()=>{
  setStatus($("loginStatus"),"");
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||!password){setStatus($("loginStatus"),"Isi email dan password.",true);return}
  $("loginBtn").disabled=true;
  const {error}=await sb.auth.signInWithPassword({email,password});
  $("loginBtn").disabled=false;
  if(error){setStatus($("loginStatus"),"Login gagal: "+error.message,true);return}
  const user=await isAdmin();
  if(!user){await sb.auth.signOut();setStatus($("loginStatus"),"Akaun ini belum didaftarkan sebagai admin.",true);return}
  showApp(user);
};
$("logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload()};
$("addBtn").onclick=()=>openModal();
$("closeModal").onclick=closeModal;$("cancelBtn").onclick=closeModal;$("saveBtn").onclick=save;
$("refreshBtn").onclick=load;$("search").oninput=render;$("categoryFilter").onchange=render;$("statusFilter").onchange=render;
$("exportBtn").onclick=exportCsv;$("importFile").onchange=e=>e.target.files[0]&&importCsv(e.target.files[0]);
$("questionRows").onclick=e=>{const t=e.target;if(t.dataset.edit)openModal(questions.find(q=>q.id===t.dataset.edit));if(t.dataset.toggle)toggle(t.dataset.toggle);if(t.dataset.delete)remove(t.dataset.delete)};
init();
