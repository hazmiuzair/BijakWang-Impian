const SUPABASE_URL="https://yjpgmorwarmahcxngbig.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_tphBWQvfNdfVzbxWLfsWwg_3H8oZPU0";

let QUESTIONS=[];
const WHEEL=[
  ["+50",50,"POINTS"],
  ["+100",100,"POINTS"],
  ["+150",150,"POINTS"],
  ["+200",200,"POINTS"],
  ["HILANG GILIRAN",0,"LOSE_TURN"],
  ["+250",250,"POINTS"],
  ["+300",300,"POINTS"],
  ["+500",500,"POINTS"],
  ["+750",750,"POINTS"],
  ["+200",200,"POINTS"],
  ["MUFLIS",0,"BANKRUPT"],
  ["+1000",1000,"POINTS"],
  ["+125",125,"POINTS"],
  ["+350",350,"POINTS"],
  ["+400",400,"POINTS"],
  ["+75",75,"POINTS"]
];
const AV=["🧑🏻","👨🏻","👩🏻","🧑🏽","👨🏽"];
const $=id=>document.getElementById(id);
/* =========================
   Phase 5D - Sound Engine
   ========================= */
let soundEnabled = true;
let audioCtx = null;
let wheelOsc = null;
let wheelGain = null;
let wheelSoundTimer = null;

function getAudioCtx(){
  if(!soundEnabled) return null;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }catch(e){ return null; }
}

function tone(freq=440, duration=.12, type="sine", volume=.045, when=0){
  const ctx=getAudioCtx();
  if(!ctx)return;
  const now=ctx.currentTime+when;
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,now);
  g.gain.setValueAtTime(0.0001,now);
  g.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),now+.01);
  g.gain.exponentialRampToValueAtTime(.0001,now+duration);
  o.connect(g);g.connect(ctx.destination);
  o.start(now);o.stop(now+duration+.02);
}

function soundClick(){ tone(520,.055,"square",.025); }
function soundPoint(){ tone(660,.09,"sine",.055); tone(880,.16,"sine",.045,.08); }
function soundVowel(){ tone(520,.08,"triangle",.045); tone(700,.13,"triangle",.04,.09); }
function soundLose(){ tone(300,.12,"sawtooth",.04); tone(220,.22,"sawtooth",.035,.1); }
function soundBankrupt(){ tone(180,.16,"sawtooth",.055); tone(120,.30,"sawtooth",.05,.14); }
function soundWrong(){ tone(260,.12,"square",.035); }
function soundCorrect(){ tone(523,.10,"sine",.05); tone(659,.10,"sine",.05,.10); tone(784,.20,"sine",.055,.20); }
function soundWin(){ tone(523,.12,"sine",.05); tone(659,.12,"sine",.05,.12); tone(784,.12,"sine",.055,.24); tone(1047,.35,"sine",.06,.36); }

function startWheelSound(){
  if(!soundEnabled)return;
  getAudioCtx();
  stopWheelSound();
  wheelSoundTimer=setInterval(()=>{
    if(!settle)return;
    const speed=Math.max(.04,Math.min(1,Math.abs(vel)/18));
    tone(120+speed*90,.045,"triangle",.018);
  },90);
}

function stopWheelSound(){
  if(wheelSoundTimer){clearInterval(wheelSoundTimer);wheelSoundTimer=null}
}

function updateSoundButton(){
  const b=$("soundBtn");
  if(!b)return;
  b.textContent=soundEnabled?"🔊":"🔇";
  b.title=soundEnabled?"Bunyi ON":"Bunyi OFF";
  b.setAttribute("aria-pressed",String(soundEnabled));
}

const cid=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random());
let sb=null,room=null,me=null,players=[],rc=null,pc=null;
let realtimeReady=false, refreshBusy=false;
let wheelRot=0,drag=false,pid=null,lastA=0,lastT=0,vel=0,settle=false,wheelPoints=0,turnSpun=false,vowelMode=false;
let solveMode=false, solveDeadline=null, solveTimerId=null;
let lastTurnPlayerId=null;
/* =========================
   Phase 5E - Stability
   ========================= */
let actionBusy = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let lastRoomUpdateAt = 0;
let lastPlayerRefreshAt = 0;

function setConnectionBanner(text, show=true){
  const el=$("connectionBanner");
  if(!el)return;
  el.textContent=text;
  el.classList.toggle("hidden",!show);
}

function lockAction(){
  if(actionBusy)return false;
  actionBusy=true;
  return true;
}
function unlockAction(){ actionBusy=false; }

function safeRoomState(){
  return !!(room && room.id && me && me.id);
}

function isCurrentTurn(){
  return safeRoomState() && room.status==="playing" && room.current_player_id===me.id;
}

function scheduleReconnect(){
  if(reconnectTimer || !room || !sb)return;
  const delay=Math.min(10000,1500*Math.max(1,reconnectAttempts+1));
  reconnectTimer=setTimeout(async()=>{
    reconnectTimer=null;
    reconnectAttempts++;
    try{
      const {data,error}=await sb.from("rooms").select("*").eq("id",room.id).maybeSingle();
      if(error)throw error;
      if(!data){ leaveLocal("Bilik telah ditutup."); return; }
      room=data;
      await refresh();
      if(rc && pc){
        try{ await sb.removeChannel(rc); }catch{}
        try{ await sb.removeChannel(pc); }catch{}
        rc=null;pc=null;
        await subscribe();
      }
      reconnectAttempts=0;
      setConnectionBanner("",false);
    }catch(e){
      console.warn("reconnect:",e);
      setConnectionBanner("⚠️ Sambungan terputus. Cuba sambung semula…",true);
      scheduleReconnect();
    }
  },delay);
}

async function runAction(fn){
  if(actionBusy)return;
  if(!safeRoomState())return;
  actionBusy=true;
  try{ return await fn(); }
  finally{ actionBusy=false; }
}


function ok(){return !SUPABASE_URL.includes("PASTE_")&&!SUPABASE_ANON_KEY.includes("PASTE_")}
function status(t,on=false){$("status").textContent="● "+t;$("status").classList.toggle("online",on)}
function name(v){return(v||"").trim().replace(/\s+/g," ").slice(0,18)}
function code(v){return(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)}
function makeCode(){const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join("")}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

async function loadQuestions(){
  const {data,error}=await sb.from("questions")
    .select("id,answer,hint,category")
    .eq("is_active",true)
    .order("created_at",{ascending:true});
  if(error){
    console.error(error);
    throw error;
  }
  QUESTIONS=(data||[]).map(q=>({
    id:q.id,
    answer:String(q.answer||"").trim(),
    hint:String(q.hint||"").trim(),
    category:String(q.category||"UMUM").trim()
  }));
  return QUESTIONS;
}

async function connect(){
 if(!ok()){status("Setup diperlukan — isi URL & anon key");return false}
 try{
   sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
   const {error:roomError}=await sb.from("rooms").select("id").limit(1);
   if(roomError)throw roomError;
   await loadQuestions();
   if(QUESTIONS.length<5) console.warn("BijakWang: hanya "+QUESTIONS.length+" soalan aktif. Tambah sehingga sekurang-kurangnya 5.");
   status("Supabase disambungkan",true);
   return true;
 }catch(e){
   console.error(e);
   status("Gagal sambung — semak URL/key & SQL");
   return false;
 }
}
async function createRoom(){
 if(actionBusy)return; actionBusy=true;
 const createInput=$("createName")||$("hostName"); const n=name(createInput?.value||"");if(!n){actionBusy=false;return alert("Masukkan nama pemain.");}if(!(await connect())){actionBusy=false;return;}
 let c=makeCode();for(let i=0;i<5;i++){const{data}=await sb.from("rooms").select("id").eq("code",c).maybeSingle();if(!data)break;c=makeCode()}
 const{data:r,error}=await sb.from("rooms").insert({code:c,status:"waiting",round:1,question_index:0,question_ids:[],current_player_id:null,revealed_letters:[],used_letters:[],solve_mode:false,solve_deadline:null}).select().single();
 if(error){actionBusy=false;return alert("Tak dapat cipta bilik: "+error.message);}room=r;
 const p=await addPlayer(n,true);if(!p){actionBusy=false;return;}me=p;await subscribe();showWaiting();actionBusy=false;
}
async function joinRoom(){
 if(actionBusy)return; actionBusy=true;
 const joinNameInput=$("joinName"); const joinCodeInput=$("joinCode")||$("roomCode"); const n=name(joinNameInput?.value||""),c=code(joinCodeInput?.value||"");
 if(!n){actionBusy=false;return alert("Masukkan nama pemain.");}if(c.length!==6){actionBusy=false;return alert("Kod bilik mesti 6 aksara.");}if(!(await connect())){actionBusy=false;return;}
 const{data:r}=await sb.from("rooms").select("*").eq("code",c).maybeSingle();if(!r){actionBusy=false;return alert("Bilik tidak dijumpai.");}
 if(r.status!=="waiting"){actionBusy=false;return alert("Permainan dalam bilik ini sudah bermula.");}room=r;
 const{count}=await sb.from("players").select("*",{count:"exact",head:true}).eq("room_id",r.id);if((count||0)>=5){actionBusy=false;return alert("Bilik sudah penuh. Maximum 5 pemain.");}
 const p=await addPlayer(n,false);if(!p){actionBusy=false;return;}me=p;await subscribe();showWaiting();actionBusy=false;
}
async function addPlayer(n,host){
 const{data,error}=await sb.from("players").insert({room_id:room.id,client_id:cid,name:n,avatar:AV[Math.floor(Math.random()*AV.length)],score:0,is_host:host}).select().single();
 if(error){alert("Tak dapat masuk: "+error.message);return null}return data
}

function sendActivity(action, extra={}){
  if(!rc || !me || !room) return;
  try{
    rc.send({
      type:"broadcast",
      event:"player_action",
      payload:{
        action,
        player_id:me.id,
        player_name:me.name,
        ts:Date.now(),
        ...extra
      }
    });
  }catch(e){ console.warn("activity broadcast:",e); }
}

let activityTimer=null;
function showActivity(text){
  const el=$("activity");
  if(!el) return;
  el.textContent=text;
  el.classList.remove("hidden","show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(activityTimer);
  activityTimer=setTimeout(()=>{
    el.classList.add("hidden");
    el.classList.remove("show");
  },5000);
}

function handlePlayerActivity(payload){
  if(!payload || payload.player_id===me?.id) return;
  const name=esc(payload.player_name||"Pemain");
  if(payload.action==="spin_start") showActivity(`🎡 ${name} sedang memutar roda...`);
  else if(payload.action==="spin_result"){
    if(payload.effect==="BANKRUPT") showActivity(`💥 ${name} dapat MUFLIS — semua point jadi 0.`);
    else if(payload.effect==="LOSE_TURN") showActivity(`⏭️ ${name} dapat HILANG GILIRAN.`);
    else showActivity(`🎡 ${name} selesai putar roda — +${payload.points||0} point.`);
  }
  else if(payload.action==="vowel") showActivity(`🔤 ${name} sedang memilih huruf vokal (-200).`);
  else if(payload.action==="solve") showActivity(`🧠 ${name} memilih SELESAIKAN — sedang menjawab dalam 30 saat.`);
  else if(payload.action==="solve_submit") showActivity(`✍️ ${name} sedang menghantar jawapan.`);
}

async function subscribe(){
  if(!room || !sb) return;

  if(rc){ try{await sb.removeChannel(rc);}catch{} rc=null; }
  if(pc){ try{await sb.removeChannel(pc);}catch{} pc=null; }
  realtimeReady=false;

  await refresh();

  rc=sb.channel("room-"+room.id)
    .on("broadcast",{event:"player_action"},({payload})=>handlePlayerActivity(payload))
    .on("postgres_changes",
      {event:"UPDATE",schema:"public",table:"rooms",filter:"id=eq."+room.id},
      payload=>{
        if(payload?.new?.id!==room.id) return;
        const incoming=payload.new;
        if(incoming.updated_at && room.updated_at && incoming.updated_at < room.updated_at) return;
        room=incoming;
        lastRoomUpdateAt=Date.now();
        syncRoom();
      })
    .on("postgres_changes",
      {event:"DELETE",schema:"public",table:"rooms",filter:"id=eq."+room.id},
      ()=>leaveLocal("Bilik telah ditutup oleh host."))
    .subscribe(statusValue=>{
      realtimeReady=statusValue==="SUBSCRIBED";
      if(realtimeReady){
        reconnectAttempts=0;
        setConnectionBanner("",false);
      }else{
        setConnectionBanner("⚠️ Sambungan multiplayer terputus. Sedang cuba sambung semula…",true);
        scheduleReconnect();
      }
      updateRealtimeStatus();
    });

  pc=sb.channel("players-"+room.id)
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"players",filter:"room_id=eq."+room.id},
      ()=>refresh())
    .on("postgres_changes",
      {event:"UPDATE",schema:"public",table:"players",filter:"room_id=eq."+room.id},
      ()=>refresh())
    .on("postgres_changes",
      {event:"DELETE",schema:"public",table:"players",filter:"room_id=eq."+room.id},
      payload=>{
        if(payload?.old?.id===me?.id) return leaveLocal("Anda telah dikeluarkan dari bilik.");
        refresh();
      })
    .subscribe(statusValue=>{
      if(statusValue==="SUBSCRIBED") updateRealtimeStatus();
    });
}

async function refresh(){
  if(!room || !sb || refreshBusy) return;
  refreshBusy=true;
  try{
    const {data,error}=await sb.from("players")
      .select("*")
      .eq("room_id",room.id)
      .order("created_at");
    if(error) throw error;

    players=data||[];
    const found=players.find(p=>p.client_id===cid);
    if(found) me=found;

    renderWaiting();
    renderBoard();
    syncTurn();
  }catch(e){
    console.error("refresh players:",e);
  }finally{
    refreshBusy=false;
  }
}

function updateRealtimeStatus(){
  const el=$("status");
  if(!el) return;
  if(room && realtimeReady){
    el.textContent="● Multiplayer LIVE";
    el.classList.add("online");
  }else if(room){
    el.textContent="● Menyambung multiplayer…";
    el.classList.remove("online");
  }
}
function renderWaiting(){
 $("count").textContent=players.length+" / 5";$("roomCode").textContent=room.code;
 $("waitingPlayers").innerHTML=Array.from({length:5},(_,i)=>{const p=players[i];return p?`<div><span>${p.avatar}</span>${esc(p.name)}${p.is_host?"<br><small>HOST</small>":""}</div>`:`<div><span>➕</span>Kosong</div>`}).join("");
 $("startBtn").classList.toggle("hidden",!me?.is_host);$("startBtn").disabled=!me?.is_host;
 $("waitTitle").textContent=players.length===1?"Boleh mula bila-bila masa":"Menunggu pemain...";
 $("waitText").textContent=players.length===1?"Anda boleh main solo atau kongsi kod untuk tambah pemain.":"Kongsi kod bilik dengan pemain lain."
}
async function startGame(){
 if(actionBusy || !me?.is_host)return;
 actionBusy=true;

if(QUESTIONS.length<5){
  actionBusy=false;
  alert("Sekurang-kurangnya 5 soalan aktif diperlukan.");
  return;
}

const shuffled=[...QUESTIONS].sort(()=>Math.random()-0.5).slice(0,5);
 const questionIds=shuffled.map(q=>q.id);
 const first=players[0];

 const {error}=await sb.from("rooms").update({
   status:"playing",
   round:1,
   question_index:0,
   question_ids:questionIds,
   current_player_id:first.id,
   revealed_letters:[],
   used_letters:[],
   solve_mode:false,
   solve_deadline:null
 }).eq("id",room.id);

 if(error){
   console.error(error);
   actionBusy=false;
   alert("Tak dapat mula permainan: "+error.message);
   return;
 }
 room={...room,status:"playing",round:1,question_index:0,question_ids:questionIds,
   current_player_id:first.id,revealed_letters:[],used_letters:[],solve_mode:false,solve_deadline:null};
 syncRoom();
 actionBusy=false;
}
function syncRoom(){if(room.status==="waiting")return showWaiting();if(room.status==="playing"){showGame();renderQuestion();syncTurn()}if(room.status==="finished")showResults()}
function showWaiting(){$("lobby").classList.add("hidden");$("game").classList.add("hidden");$("waiting").classList.remove("hidden");$("badge").textContent="LOBBI";renderWaiting()}
function showGame(){$("lobby").classList.add("hidden");$("waiting").classList.add("hidden");$("game").classList.remove("hidden");$("badge").textContent="PERMAINAN";}
function renderBoard(){
  const currentId=room?.current_player_id||null;
  $("scoreboard").innerHTML=players.map(p=>{
    const active=currentId===p.id;
    const changed=active && lastTurnPlayerId===currentId;
    return `<div class="player ${active?"active":""} ${changed?"turnChanged":""}">
      <div class="avatar">${p.avatar}</div>
      <div class="name">${esc(p.name)}</div>
      <div class="score">${Number(p.score||0).toLocaleString("ms-MY")}</div>
    </div>`;
  }).join("");
}
 function currentQ(){
  const ids = Array.isArray(room?.question_ids) ? room.question_ids : [];
  const idx = Number(room?.question_index || 0);
  const id = ids[idx];

  return QUESTIONS.find(q => q.id === id)
    || {answer:"", hint:"", category:""};
}
function renderQuestion(){
 const q=currentQ(),rev=new Set(room.revealed_letters||[]),a=q.answer.toUpperCase();
 $("category").textContent=q.category;$("hint").textContent=q.hint;
 $("puzzle").innerHTML=[...a].map((x,i)=>`<div class="letterBox ${rev.has(i+":"+x)?"":"hide"}">${rev.has(i+":"+x)?x:"•"}</div>`).join("");
 const vowels=new Set(["A","E","I","O","U"]);
 $("letters").innerHTML="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l=>{
   const isV=vowels.has(l);
   const disabled=room.current_player_id!==me?.id||(!turnSpun&&!solveMode)||(room.used_letters||[]).includes(l)||(isV&&!vowelMode&&!solveMode);
   return `<button class="${isV?"vowel":""}" data-letter="${l}" ${disabled?"disabled":""}>${l}</button>`;
 }).join("");
 document.querySelectorAll(".letters button").forEach(b=>b.addEventListener("click",()=>choose(b.dataset.letter)));
 $("vowelBtn").classList.toggle("active",vowelMode);
 $("vowelBtn").textContent=vowelMode?"PILIH VOKAL (A E I O U)":"🔤 PILIH VOKAL (-200)";
}
function syncTurn(){
 if(!me||!room)return;
 const active=room.current_player_id===me.id;
 const currentPlayer=players.find(p=>p.id===room.current_player_id);
 const currentName=currentPlayer?.name||"-";

 $("turn").textContent=currentName;
 $("turnWrap").classList.toggle("myTurn",active);

 const turnStatus=$("turnStatus");
 if(turnStatus){
   turnStatus.className="turnStatus "+(active?"myTurn":"otherTurn");
   turnStatus.textContent=active
     ?"🎯 GILIRAN ANDA — pilih tindakan anda"
     :`⏳ Giliran ${currentName}`;
 }

 $("spinBtn").disabled=!active||turnSpun||solveMode;
 $("vowelBtn").disabled=!active||!turnSpun||solveMode||Number(me.score||0)<200;
 $("solveBtn").disabled=!active||turnSpun||solveMode;

 if(active && lastTurnPlayerId!==room.current_player_id){
   flashMessage("🎯 Giliran anda!");
 }
 if(!active && lastTurnPlayerId!==room.current_player_id){
   flashMessage(`⏳ Giliran ${currentName}`);
 }
 lastTurnPlayerId=room.current_player_id;

 renderBoard();
 renderQuestion();

 if(room.solve_mode&&room.solve_deadline&&active){
   solveMode=true; startSolveTimer(new Date(room.solve_deadline).getTime());
 } else if(!room.solve_mode){
   solveMode=false; stopSolveTimer();
 }
}
function flashMessage(text){
 const el=$("message");
 if(!el)return;
 el.textContent=text;
 el.classList.remove("flash");
 void el.offsetWidth;
 el.classList.add("flash");
}
async function choose(letter){
 if(room.current_player_id!==me.id||(!turnSpun&&!solveMode))return;
 const vowels=new Set(["A","E","I","O","U"]),isVowel=vowels.has(letter);
 if(isVowel&&!vowelMode&&!solveMode)return;
 const cost=(isVowel&&!solveMode)?200:0;
 if(cost&&Number(me.score||0)<cost){alert("Anda perlukan sekurang-kurangnya 200 point untuk memilih huruf vokal.");return}
 const used=[...(room.used_letters||[]),letter],a=currentQ().answer.toUpperCase();
 const found=[...a].map((x,i)=>x===letter?i+":"+x:null).filter(Boolean);
 if(!found.length){soundWrong();
   if(cost) await sb.from("players").update({score:Number(me.score||0)-cost}).eq("id",me.id);
   $("message").textContent="❌ Huruf tiada. Giliran bertukar.";
   return solveMode?finishSolve(false):nextTurn(used);
 }
 const rev=[...new Set([...(room.revealed_letters||[]),...found])];
 if(solveMode){
   await sb.from("rooms").update({revealed_letters:rev,used_letters:used}).eq("id",room.id);
   $("message").textContent="Huruf dibuka. Teruskan menjawab sebelum masa tamat.";
   if(isSolved(new Set(rev))) return finishSolve(true);
   await refresh(); return;
 }
 const gain=wheelPoints*found.length,bonus=isSolved(new Set(rev))?500:0;
 await sb.from("players").update({score:Number(me.score||0)-cost+gain+bonus}).eq("id",me.id);
 if(isSolved(new Set(rev))){soundCorrect();$("message").textContent="🎉 Jawapan lengkap! Bonus +500.";return complete(rev,used)}
 await sb.from("rooms").update({revealed_letters:rev,used_letters:used}).eq("id",room.id);
 wheelPoints=0;turnSpun=false;vowelMode=false;await refresh();
}
function isSolved(rev){return[...currentQ().answer.toUpperCase()].every((x,i)=>rev.has(i+":"+x))}
async function nextTurn(used){turnSpun=false;vowelMode=false;solveMode=false;stopSolveTimer();const i=players.findIndex(p=>p.id===room.current_player_id),n=players[(i+1)%players.length];await sb.from("rooms").update({current_player_id:n.id,used_letters:used,solve_mode:false,solve_deadline:null}).eq("id",room.id);wheelPoints=0}

function showWordTransition(title="PERKATAAN SELESAI!", text="Bersedia untuk perkataan seterusnya...", icon="🎉", ms=1400){
  const modal=$("wordTransition");
  if(!modal)return Promise.resolve();
  $("wordTransitionIcon").textContent=icon;
  $("wordTransitionTitle").textContent=title;
  $("wordTransitionText").textContent=text;
  modal.classList.remove("hidden");
  return new Promise(resolve=>setTimeout(()=>{
    modal.classList.add("hidden");
    resolve();
  },ms));
}

async function complete(rev, used) {
  turnSpun = false;
  vowelMode = false;
  solveMode = false;
  solveDeadline = null;
  stopSolveTimer();
  wheelPoints = 0;

  const qi = Number(room.question_index || 0);

  const i = players.findIndex(
    p => p.id === room.current_player_id
  );

  const n = players[(i + 1) % players.length];

  if (qi < 4) {
    await showWordTransition(
      "PERKATAAN SELESAI!",
      `Bersedia untuk perkataan ${qi + 2} daripada 5...`,
      "🎉",
      1400
    );
    return sb.from("rooms").update({
      question_index: qi + 1,
      current_player_id: n.id,
      revealed_letters: [],
      used_letters: [],
      solve_mode: false,
      solve_deadline: null
    }).eq("id", room.id);
  }

  await showWordTransition(
    "SEMUA 5 PERKATAAN SELESAI!",
    "Mengira markah akhir dan menentukan juara...",
    "🏆",
    1600
  );

  return sb.from("rooms").update({
    status: "finished",
    revealed_letters: rev,
    used_letters: used,
    solve_mode: false,
    solve_deadline: null
  }).eq("id", room.id);
}

async function solve(){
 if(actionBusy||room.current_player_id!==me.id||turnSpun||solveMode)return;
 actionBusy=true;
 solveMode=true;wheelPoints=0;vowelMode=false;sendActivity("solve");
 const deadline=Date.now()+30000;solveDeadline=deadline;
 await sb.from("rooms").update({solve_mode:true,solve_deadline:new Date(deadline).toISOString(),used_letters:room.used_letters||[]}).eq("id",room.id);
 startSolveTimer(deadline);
 $("message").textContent="🧠 Mod Selesaikan aktif. Anda ada 30 saat untuk menjawab.";
 $("answerInput").value=""; $("answerInput").focus(); await refresh();
 actionBusy=false;
}
async function submitAnswer(){
  if(actionBusy || !solveMode || room.current_player_id !== me.id) return;
  actionBusy=true;

  const g = $("answerInput").value.trim();
  sendActivity("solve_submit");
  if(!g){actionBusy=false;return;}

  // Hentikan timer secara tempatan dahulu — jangan tunggu Supabase.
  solveMode = false;
  stopSolveTimer();

  // Matikan solve mode di server secepat mungkin supaya realtime
  // tidak menghidupkan timer semula pada device lain.
  await sb.from("rooms").update({
    solve_mode:false,
    solve_deadline:null
  }).eq("id",room.id);

  const answer = currentQ().answer.toUpperCase();

  if(g.toUpperCase() === answer){
    const nextScore = Number(me.score||0) + 500;
    await sb.from("players").update({score:nextScore}).eq("id",me.id);

    soundCorrect();$("message").textContent = "🎉 Jawapan betul! Bonus +500.";

    const result=await complete(
      [...answer].map((x,i)=>i+":"+x),
      room.used_letters || []
    );
    actionBusy=false;
    return result;
  }

  soundWrong();$("message").textContent = "❌ Jawapan salah. Giliran bertukar.";

  const i = players.findIndex(p => p.id === room.current_player_id);
  const n = players[(i + 1) % players.length];

  await sb.from("rooms").update({
    current_player_id:n.id,
    solve_mode:false,
    solve_deadline:null,
    used_letters:room.used_letters || []
  }).eq("id",room.id);

  $("answerInput").value = "";
  await refresh();
  actionBusy=false;
}
async function finishSolve(correct){
 if(!solveMode)return;
 solveMode=false;stopSolveTimer();
 if(correct)return complete([...currentQ().answer.toUpperCase()].map((x,i)=>i+":"+x),room.used_letters||[]);
 const i=players.findIndex(p=>p.id===room.current_player_id),n=players[(i+1)%players.length];
 await sb.from("rooms").update({current_player_id:n.id,solve_mode:false,solve_deadline:null,used_letters:room.used_letters||[]}).eq("id",room.id);
 $("answerInput").value=""; await refresh();
}
function startSolveTimer(deadline){
 solveDeadline=deadline; stopSolveTimer();
 const tick=()=>{
   if(!solveMode)return;
   const left=Math.max(0,Math.ceil((solveDeadline-Date.now())/1000));
   $("solveTimer").classList.remove("hidden"); $("timerValue").textContent=left;
   $("solveTimer").classList.toggle("urgent",left<=10); $("solveAnswer").classList.remove("hidden");
   if(left<=0){stopSolveTimer();$("message").textContent="⏰ Masa tamat. Giliran bertukar.";finishSolve(false)}
 };
 tick(); solveTimerId=setInterval(tick,250);
}
function stopSolveTimer(){
 if(solveTimerId){clearInterval(solveTimerId);solveTimerId=null}
 $("solveTimer").classList.add("hidden"); $("solveTimer").classList.remove("urgent"); $("solveAnswer").classList.add("hidden");
}

function showResults(){soundWin();const s=[...players].sort((a,b)=>b.score-a.score);$("resultTitle").textContent="PERMAINAN SELESAI!";$("resultText").textContent=s.length?s[0].name+" menjadi juara BijakWang Impian!":"";$("finalScores").innerHTML=s.map((p,i)=>`<div class="final ${i===0?"winner":""}"><span>${i+1}. ${i===0?"🏆 ":""}${esc(p.name)}</span><b>${Number(p.score).toLocaleString("ms-MY")} point</b></div>`).join("");$("resultModal").classList.remove("hidden")}
async function leave(){if(!room||!me)return;if(me.is_host)await sb.from("rooms").delete().eq("id",room.id);else await sb.from("players").delete().eq("id",me.id);leaveLocal()}
async function leaveLocal(msg=""){clearTimeout(reconnectTimer);reconnectTimer=null;reconnectAttempts=0;actionBusy=false;if(rc)sb?.removeChannel(rc);if(pc)sb?.removeChannel(pc);room=null;me=null;players=[];$("waiting").classList.add("hidden");$("game").classList.add("hidden");$("resultModal").classList.add("hidden");$("lobby").classList.remove("hidden");$("badge").textContent="LOBBI";if(msg)alert(msg)}

function labels(){
  $("wheelLabels").innerHTML="";

WHEEL.forEach((w,i)=>{
  const e=document.createElement("div");
  e.className="wheelLabel";

  if (w[0] === "HILANG GILIRAN" || w[0] === "MUFLIS") {
    e.classList.add("specialLabel");
  }

  e.textContent=w[0];

    // Tengah setiap partition.
    const a = i * (360 / WHEEL.length) + (180 / WHEEL.length);

    // Jarak tulisan dari pusat roda.
    let rad = Math.min(150, Math.max(90, innerWidth * .2));

    // Larasan khas untuk perkataan panjang.
    // Nilai ini ialah tambahan sudut; ubah jika mahu lebih condong.
    let angleOffset = 0;

    if(w[2] === "LOSE_TURN"){
      angleOffset = 0;
      rad -= 2;
    }

    if(w[2] === "BANKRUPT"){
      angleOffset = 0;
      rad -= 2;
    }

    const finalAngle = a + angleOffset;
	let textAngle = finalAngle + 90;
	if (textAngle > 90) {
 	 textAngle -= 180;
	}
	if (textAngle < -90) {
	  textAngle += 180;
	}
	e.style.transform =
 	 `rotate(${finalAngle}deg) translateY(-${rad}px) rotate(${textAngle - finalAngle}deg)`;

    if(w[2] === "LOSE_TURN"){
      e.style.fontSize = "clamp(9px,1.1vw,14px)";
    }else if(w[2] === "BANKRUPT"){
      e.style.fontSize = "clamp(10px,1.2vw,15px)";
    }

    $("wheelLabels").appendChild(e);
  });
}
function angle(e){const r=$("wheelArea").getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))}
function openWheel(){if(actionBusy||room.current_player_id!==me?.id||turnSpun||room.status!=="playing")return;soundClick();sendActivity("spin_start");$("wheelPlayer").textContent=me.name;$("wheelResult").textContent="PUSING RODA";$("wheelModal").classList.remove("hidden")}
function closeWheel(){if(!drag&&!settle)$("wheelModal").classList.add("hidden")}
function setRot(){ $("wheel").style.transform=`rotate(${wheelRot}deg)`}
function down(e){if(settle||actionBusy)return;soundClick();drag=true;startWheelSound();pid=e.pointerId;lastA=angle(e);lastT=performance.now();vel=0;$("wheelArea").setPointerCapture?.(pid);e.preventDefault()}
function move(e){if(!drag||e.pointerId!==pid)return;const now=performance.now(),a=angle(e);let d=a-lastA;if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;const dt=Math.max(8,now-lastT),deg=d*180/Math.PI;wheelRot+=deg;vel=deg/dt*16;setRot();lastA=a;lastT=now;e.preventDefault()}
function up(e){if(!drag||e.pointerId!==pid)return;drag=false;pid=null;settle=true;startWheelSound();let v=Math.max(-25,Math.min(25,vel));if(Math.abs(v)<3)v=(Math.random()<.5?-1:1)*(7+Math.random()*4);let frames=0;function go(){v*=.985;wheelRot+=v;setRot();frames++;if(frames<180&&Math.abs(v)>.12){requestAnimationFrame(go)}else{settle=false;stopWheelSound();result()}}requestAnimationFrame(go)}
async function result(){
 if(!safeRoomState() || room.current_player_id!==me.id)return;
 const n=((360-(wheelRot%360))+360)%360;
 const idx=Math.floor(n/(360/WHEEL.length))%WHEEL.length;
 const r=WHEEL[idx];
 const label=r[0], value=r[1], effect=r[2]||"POINTS";

 wheelPoints=effect==="POINTS"?Number(value||0):0;
 turnSpun=true;
 vowelMode=false;

 sendActivity("spin_result",{points:wheelPoints,label,effect});

 $("wheelResult").textContent=label;
 $("wheelResult").classList.remove("wheelResultHighlight");
 void $("wheelResult").offsetWidth;
 $("wheelResult").classList.add("wheelResultHighlight");
 setTimeout(() => {
  $("wheelModal").classList.add("hidden");
  }, 3000);

 if(effect==="BANKRUPT"){ soundBankrupt();
   await sb.from("players").update({score:0}).eq("id",me.id);
   $("message").textContent="💥 MUFLIS — semua point anda hilang. Giliran bertukar.";
   await refresh();
   return nextTurn(room.used_letters||[]);
 }

 if(effect==="LOSE_TURN"){ soundLose();
   $("message").textContent="⏭️ HILANG GILIRAN — giliran bertukar.";
   return nextTurn(room.used_letters||[]);
 }

 soundPoint();$("message").textContent=`Anda mendapat ${value} point. Pilih huruf atau beli vokal.`;
 syncTurn();
}
$("createBtn").addEventListener("click",createRoom);$("joinBtn").addEventListener("click",joinRoom);$("startBtn").addEventListener("click",startGame);$("leaveBtn").addEventListener("click",leave);$("spinBtn").addEventListener("click",openWheel);
$("vowelBtn").addEventListener("click",()=>{
 if(actionBusy||room?.current_player_id!==me?.id||!turnSpun)return;
 if(Number(me.score||0)<200){alert("Anda perlukan 200 point untuk memilih vokal.");return}
 vowelMode=!vowelMode;soundVowel();renderQuestion();syncTurn();
});$("solveBtn").addEventListener("click",solve);$("answerBtn").addEventListener("click",submitAnswer);$("answerInput").addEventListener("keydown",e=>{if(e.key==="Enter")submitAnswer()});$("closeWheel").addEventListener("click",closeWheel);$("cancelWheel").addEventListener("click",closeWheel);$("resultBtn").addEventListener("click",()=>leaveLocal());$("copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(room.code);alert("Kod bilik disalin.")}catch{alert("Kod bilik: "+room.code)}})
const wa=$("wheelArea");wa.addEventListener("pointerdown",down);wa.addEventListener("pointermove",move);wa.addEventListener("pointerup",up);wa.addEventListener("pointercancel",up);
$("soundBtn")?.addEventListener("click",()=>{
  soundEnabled=!soundEnabled;
  updateSoundButton();
  if(soundEnabled) soundClick();
});
updateSoundButton();

labels();addEventListener("resize",labels);if(ok())connect();else status("Setup diperlukan — masukkan Supabase URL & anon key");
