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
    if(audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
    return audioCtx;
  }catch(e){
    console.warn("Audio tidak tersedia:", e);
    return null;
  }
}

function playTone(ctx,freq,duration,type,volume,when=0){
  const now=ctx.currentTime+when;
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.type=type;
  o.frequency.setValueAtTime(freq,now);
  g.gain.setValueAtTime(0.0001,now);
  g.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),now+.008);
  g.gain.exponentialRampToValueAtTime(.0001,now+duration);
  o.connect(g); g.connect(ctx.destination);
  o.start(now); o.stop(now+duration+.03);
}

function tone(freq=440,duration=.12,type="sine",volume=.09,when=0){
  const ctx=getAudioCtx();
  if(!ctx)return;
  const play=()=>playTone(ctx,freq,duration,type,volume,when);
  if(ctx.state==="suspended") ctx.resume().then(play).catch(()=>{});
  else play();
}

function soundClick(){
  tone(720,.045,"square",.045);
  tone(980,.055,"sine",.035,.035);
}

function soundPoint(points=0){
  const p=Number(points||0);
  const lift=p>=750?1.16:p>=300?1.08:1;
  tone(523*lift,.09,"sine",.075);
  tone(659*lift,.10,"sine",.075,.075);
  tone(784*lift,.12,"sine",.085,.155);
  tone(1047*lift,.24,"sine",.09,.245);
}

function soundVowel(){
  tone(392,.07,"triangle",.055);
  tone(523,.08,"triangle",.065,.065);
  tone(784,.15,"sine",.075,.135);
}

function soundLose(){
  tone(392,.08,"triangle",.055);
  tone(311,.11,"triangle",.065,.075);
  tone(196,.24,"sawtooth",.055,.18);
}

function soundBankrupt(){
  tone(220,.12,"sawtooth",.075);
  tone(165,.16,"sawtooth",.075,.10);
  tone(110,.30,"sawtooth",.085,.23);
}

function soundWrong(){
  tone(185,.10,"square",.07);
  tone(140,.22,"sawtooth",.065,.095);
}

function soundCorrect(){
  tone(587,.075,"sine",.065);
  tone(740,.085,"sine",.075,.07);
  tone(988,.14,"sine",.085,.145);
}

function soundSolveStart(){
  tone(392,.08,"triangle",.055);
  tone(494,.08,"triangle",.055,.08);
  tone(659,.12,"triangle",.065,.16);
  tone(988,.20,"sine",.07,.29);
}

function soundTimerTick(urgent=false){
  tone(urgent?880:660,.055,"square",urgent?.055:.035);
}

function soundTimerFinal(){
  tone(880,.08,"square",.07);
  tone(660,.12,"square",.06,.09);
  tone(440,.18,"sawtooth",.055,.20);
}

function soundWin(){
  tone(523,.10,"sine",.075);
  tone(659,.10,"sine",.075,.09);
  tone(784,.11,"sine",.08,.18);
  tone(1047,.13,"sine",.09,.28);
  tone(1319,.34,"sine",.10,.41);
}

function unlockAudio(){
  if(!soundEnabled)return;
  const ctx=getAudioCtx();
  if(ctx && ctx.state==="suspended") ctx.resume().catch(()=>{});
}

let wheelSoundLast=0;

function startWheelSound(){
  if(!soundEnabled)return;
  getAudioCtx();
  stopWheelSound();
  wheelSoundLast=0;
  wheelSoundTimer=setInterval(()=>{
    if(!settle)return;
    const speed=Math.max(.03,Math.min(1,Math.abs(vel)/18));
    const gap=55+Math.round((1-speed)*125);
    const now=performance.now();
    if(now-wheelSoundLast<gap)return;
    wheelSoundLast=now;
    tone(150+speed*120,.035,"triangle",.022);
  },35);
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
let solveMode=false, solveDeadline=null, solveTimerId=null, lastSolveSoundSecond=-1;
let lastTurnPlayerId=null;

/* Phase 6 - Turn UX (single active implementation) */
let solveKeyboardSet=new Set();
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function ensureTurnBanner(){
  const game=$("game"); if(!game)return;
  let b=$("turnBanner");
  if(!b){b=document.createElement("div");b.id="turnBanner";b.className="turnBanner";game.prepend(b);}
  if(!room||!me||room.status!=="playing"){b.classList.add("hidden");return;}
  const p=players.find(x=>x.id===room.current_player_id);
  const mine=room.current_player_id===me.id;
  b.classList.toggle("other",!mine); b.classList.remove("hidden");
  b.textContent=mine?"🎯 GILIRAN ANDA":`🎯 GILIRAN: ${p?.name||"Pemain"}`;
}
function buildSolveKeyboard(){
  const box=$("letters");
  if(!box)return;

  const used=new Set(room?.used_letters||[]);
  box.querySelectorAll("button").forEach(b=>{
    const letter=b.dataset.letter;
    b.disabled = !isCurrentTurn() || used.has(letter);
  });
}

async function chooseSolveLetter(letter){
  if(!solveMode)return;
  return choose(letter);
}
function showSolveWinner(playerName,answer){
  let o=$("solveWinnerOverlay");
  if(!o){o=document.createElement("div");o.id="solveWinnerOverlay";o.className="solveWinnerOverlay";document.body.appendChild(o);}
  o.innerHTML=`<div class="solveWinnerCard"><div class="trophy">🏆</div><div>PERKATAAN DISELESAIKAN!</div><div class="winnerName">${escapeHtml(playerName)}</div><div class="winnerAnswer">${escapeHtml(answer)}</div></div>`;
  o.classList.remove("hidden"); setTimeout(()=>o.remove(),3000);
}
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
let remoteWheelActive=false;
let remoteWheelFrame=null;
let remoteWheelRotation=0;
let remoteSpinId=null;
let lastWheelMoveBroadcast=0;
let localSpinId=null;

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

function setupRemoteWheel(playerName,payload={}){
  const modal=$("wheelModal");
  const wheel=$("wheel");
  const area=$("wheelArea");
  const close=$("closeWheel");
  const cancel=$("cancelWheel");
  if(!modal||!wheel||!area)return;

  remoteWheelActive=true;
  remoteSpinId=payload?.spinId||remoteSpinId||Date.now();
  if(remoteWheelFrame) cancelAnimationFrame(remoteWheelFrame);
  clearTimeout(window.__remoteWheelCloseTimer);

  remoteWheelRotation=Number.isFinite(Number(payload?.wheelRot)) ? Number(payload.wheelRot) : wheelRot;
  wheel.style.transition="none";
  wheel.style.transform=`rotate(${remoteWheelRotation}deg)`;
  wheel.style.pointerEvents="none";
  area.style.pointerEvents="none";
  if(close) close.classList.add("hidden");
  if(cancel) cancel.classList.add("hidden");

  labels();
  $("wheelPlayer").textContent=playerName||"Pemain";
  $("wheelResult").textContent="PUSING RODA";
  $("wheelResult").classList.remove("wheelResultHighlight");
  modal.classList.remove("hidden");
}

function updateRemoteWheel(payload){
  if(!remoteWheelActive) setupRemoteWheel(payload?.player_name||"Pemain",payload);
  if(payload?.spinId && remoteSpinId && payload.spinId!==remoteSpinId)return;
  const r=Number(payload?.wheelRot);
  if(!Number.isFinite(r))return;
  remoteWheelRotation=r;
  const wheel=$("wheel");
  if(!wheel)return;
  wheel.style.transition="none";
  wheel.style.transform=`rotate(${r}deg)`;
}

function finishRemoteWheel(payload){
  const modal=$("wheelModal");
  const wheel=$("wheel");
  if(!modal||!wheel)return;

  if(!remoteWheelActive) setupRemoteWheel(payload?.player_name||"Pemain",payload);
  if(payload?.spinId && remoteSpinId && payload.spinId!==remoteSpinId)return;
  if(remoteWheelFrame) cancelAnimationFrame(remoteWheelFrame);

  const finalRotation=Number(payload?.finalRotation);
  if(!Number.isFinite(finalRotation))return;

  const releaseAt=Number(payload?.releaseAt)||Date.now()+900;
  const duration=Math.max(120,releaseAt-Date.now());

  wheel.style.transition=`transform ${duration}ms cubic-bezier(.12,.72,.15,1)`;
  wheel.style.transform=`rotate(${finalRotation}deg)`;
  remoteWheelRotation=finalRotation;

  clearTimeout(window.__remoteWheelResultTimer);
  window.__remoteWheelResultTimer=setTimeout(()=>{
    if(!remoteWheelActive)return;
    const result=$("wheelResult");
    result.textContent=payload?.label||"—";
    result.classList.remove("wheelResultHighlight");
    void result.offsetWidth;
    result.classList.add("wheelResultHighlight");
  },duration);

  clearTimeout(window.__remoteWheelCloseTimer);
  window.__remoteWheelCloseTimer=setTimeout(()=>{
    remoteWheelActive=false;
    remoteSpinId=null;
    if(remoteWheelFrame) cancelAnimationFrame(remoteWheelFrame);
    remoteWheelFrame=null;
    modal.classList.add("hidden");
    wheel.style.transition="none";
    wheel.style.pointerEvents="";
    const area=$("wheelArea");
    if(area)area.style.pointerEvents="";
    const close=$("closeWheel");
    const cancel=$("cancelWheel");
    if(close)close.classList.remove("hidden");
    if(cancel)cancel.classList.remove("hidden");
  },duration+1800);
}

function handlePlayerActivity(payload){
  if(!payload || payload.player_id===me?.id) return;
  const name=esc(payload.player_name||"Pemain");
  if(payload.action==="spin_start") setupRemoteWheel(payload.player_name||"Pemain",payload);
  else if(payload.action==="spin_move") updateRemoteWheel(payload);
  else if(payload.action==="spin_release") finishRemoteWheel(payload);
  else if(payload.action==="spin_result"){
    // Pastikan RESULT/POINT yang sebenar dipaparkan pada semua device.
    // Sebelum ini remote wheel sudah aktif, jadi handler cuma abaikan event ini.
    // Akibatnya screen pemain lain kekal "—" walaupun roda sudah berhenti.
    if(remoteWheelActive){
      const result=$("wheelResult");
      if(result){
        const effect=payload.effect||"POINTS";
        const points=Number(payload.points||0);
        result.textContent=effect==="POINTS" ? `+${points}` : (payload.label||"—");
        result.classList.remove("wheelResultHighlight");
        void result.offsetWidth;
        result.classList.add("wheelResultHighlight");
      }
    }else{
      showActivity(`🎡 ${name} selesai putar roda — ${payload.label||"result"}.`);
    }
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
    .on("broadcast",{event:"turn_selection"},({payload})=>{
      if(!payload || payload.sender_id===me?.id)return;
      showTurnSelection(payload);
    })
    .on("postgres_changes",
      {event:"UPDATE",schema:"public",table:"rooms",filter:"id=eq."+room.id},
      payload=>{
        if(payload?.new?.id!==room.id) return;
        const incoming=payload.new;

        // Jangan benarkan event lama daripada soalan sebelumnya
        // menimpa state soalan baru (terutama selepas SELESAIKAN).
        const incomingQ = Number(incoming.question_index ?? 0);
        const localQ = Number(room?.question_index ?? 0);

        if(incomingQ < localQ) return;
        if(incoming.updated_at && room.updated_at && incoming.updated_at < room.updated_at) return;

        room=incoming;
        lastRoomUpdateAt=Date.now();

        // State tempatan mesti ikut room yang baru diterima.
        if(room.solve_mode !== true){
          solveMode=false;
          solveDeadline=null;
          stopSolveTimer();
        }
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

 // SOLO: no random turn-selection wheel. Start immediately.
 if(players.length===1){
   const first=players[0];
   const {error}=await sb.from("rooms").update({
     status:"playing",round:1,question_index:0,question_ids:questionIds,
     current_player_id:first.id,revealed_letters:[],used_letters:[],
     solve_mode:false,solve_deadline:null
   }).eq("id",room.id);
   if(error){console.error(error);actionBusy=false;alert("Tak dapat mula permainan: "+error.message);return;}
   room={...room,status:"playing",round:1,question_index:0,question_ids:questionIds,
     current_player_id:first.id,revealed_letters:[],used_letters:[],solve_mode:false,solve_deadline:null};
   syncRoom();actionBusy=false;return;
 }

 // MULTIPLAYER: computer randomly selects exactly one of the joined players.
 const chosen=players[Math.floor(Math.random()*players.length)];
 const names=players.map(p=>({id:p.id,name:p.name,avatar:p.avatar}));

 // RODA GILIRAN = tepat 16 pie dan nama sentiasa SELANG-SELI.
 // 2 pemain: P1,P2,P1,P2... = 8/8
 // 3 pemain: P1,P2,P3,P1,P2,P3... = 6/5/5
 // 4 pemain: P1,P2,P3,P4... = 4/4/4/4
 // 5 pemain: P1,P2,P3,P4,P5... = 4/3/3/3/3
 const SLOT_COUNT=16;
 const slots=Array.from({length:SLOT_COUNT},(_,i)=>{
   const p=names[i%names.length];
   return {id:p.id,name:p.name,avatar:p.avatar};
 });

 // Pilih satu slot milik pemain yang dipilih. Semua device akan guna
 // selected_slot yang sama, jadi hasil roda 100% seragam.
 const chosenSlots=slots.map((x,i)=>x.id===chosen.id?i:-1).filter(i=>i>=0);
 const selectedSlot=chosenSlots[Math.floor(Math.random()*chosenSlots.length)];

 const payload={
   names,
   slots,
   selected_id:chosen.id,
   selected_slot:selectedSlot,
   duration:5000,
   sender_id:me.id,
   ts:Date.now()
 };
 try{
   if(rc) await rc.send({type:"broadcast",event:"turn_selection",payload});
 }catch(e){console.warn("turn selection broadcast:",e);}
 showTurnSelection(payload);

 // Keep the lobby visible while the random wheel animation runs.
 setTimeout(async()=>{
   const {error}=await sb.from("rooms").update({
     status:"playing",round:1,question_index:0,question_ids:questionIds,
     current_player_id:chosen.id,revealed_letters:[],used_letters:[],
     solve_mode:false,solve_deadline:null
   }).eq("id",room.id);
   if(error){console.error(error);actionBusy=false;alert("Tak dapat mula permainan: "+error.message);return;}
   room={...room,status:"playing",round:1,question_index:0,question_ids:questionIds,
     current_player_id:chosen.id,revealed_letters:[],used_letters:[],
     solve_mode:false,solve_deadline:null};
   syncRoom();actionBusy=false;
 },6100);
}


function startTurnSelectionSound(duration=5000){
  if(!soundEnabled)return;
  unlockAudio();
  stopWheelSound();
  const started=performance.now();
  let last=0;
  const timer=setInterval(()=>{
    const elapsed=performance.now()-started;
    if(elapsed>=duration){
      clearInterval(timer);
      tone(330,.07,"triangle",.035);
      tone(523,.10,"sine",.055,.06);
      tone(659,.16,"sine",.065,.14);
      return;
    }
    const progress=Math.min(1,elapsed/duration);
    const speed=1-progress;
    const gap=48+Math.round(speed*105);
    const now=performance.now();
    if(now-last<gap)return;
    last=now;
    const pitch=150+speed*120;
    tone(pitch,.035,"triangle",.022);
  },20);
  window.__turnSelectionSoundTimer=timer;
}

function stopTurnSelectionSound(){
  if(window.__turnSelectionSoundTimer){
    clearInterval(window.__turnSelectionSoundTimer);
    window.__turnSelectionSoundTimer=null;
  }
}

function showTurnSelection(payload){
  const overlay=$("turnSelectOverlay");
  const wheel=$("turnSelectWheel");
  const result=$("turnSelectResult");
  const title=$("turnSelectTitle");
  if(!overlay||!wheel||!result||!title)return;

  const names=Array.isArray(payload?.names)?payload.names:[];
  if(!names.length)return;

  // Guna 16 slot yang sama pada semua device.
  // Fallback untuk payload lama: bina 16 slot daripada nama pemain.
  let slots=Array.isArray(payload?.slots)?payload.slots:[];
  if(slots.length!==16){
    slots=Array.from({length:16},(_,i)=>{
      const p=names[i%names.length];
      return {id:p.id,name:p.name,avatar:p.avatar};
    });
  }

  const selectedSlotRaw=Number(payload?.selected_slot);
  let selectedSlot=Number.isInteger(selectedSlotRaw)?selectedSlotRaw:-1;
  if(selectedSlot<0 || selectedSlot>=slots.length){
    selectedSlot=slots.findIndex(x=>x.id===payload?.selected_id);
  }
  if(selectedSlot<0)selectedSlot=0;

  const chosen=slots[selectedSlot]||names.find(x=>x.id===payload?.selected_id)||names[0];
  const duration=Number(payload?.duration)||5000;

  overlay.classList.remove("hidden");
  title.textContent="🎡 MENENTUKAN GILIRAN PERTAMA...";
  result.textContent="";

  const n=16;
  const seg=360/n;
  const palette=["#3c95d3","#61b54c","#f58a24","#8749b7","#e94d55"];

  wheel.innerHTML="";
  wheel.style.transition="none";
  wheel.style.transform="rotate(0deg)";
  wheel.style.background=`conic-gradient(from -90deg, ${slots.map((_,i)=>{
    const a=i*seg,b=(i+1)*seg;
    return `${palette[i%palette.length]} ${a}deg ${b}deg`;
  }).join(",")})`;

  // 16 pie + nama diletakkan di tengah setiap pie.
  slots.forEach((p,i)=>{
    const mid=(i+.5)*seg-90;
    const rad=mid*Math.PI/180;
    const radius=34;
    const x=50+radius*Math.cos(rad);
    const y=50+radius*Math.sin(rad);

    const label=document.createElement("span");
    label.className="turnPlayerLabel";
    label.textContent=p.name||"Pemain";
    label.style.left=`${x}%`;
    label.style.top=`${y}%`;

    // Nama ikut arah slice tetapi kekal mudah dibaca.
    let textAngle=mid+90;
    if(textAngle>90 && textAngle<270) textAngle+=180;
    label.style.transform=`translate(-50%,-50%) rotate(${textAngle}deg)`;
    wheel.appendChild(label);
  });

  void wheel.offsetWidth;

  // Slice yang dipilih akan berhenti tepat di bawah anak panah atas.
  const fullSpins=5*360;
  const target=-(selectedSlot*seg+seg/2);
  const finalRotation=fullSpins+target;

  startTurnSelectionSound(duration);

  wheel.style.transition=`transform ${duration}ms cubic-bezier(.12,.72,.15,1)`;
  wheel.style.transform=`rotate(${finalRotation}deg)`;

  clearTimeout(window.__turnSelectionTimer);
  window.__turnSelectionTimer=setTimeout(()=>{
    stopTurnSelectionSound();
    title.textContent="🎯 GILIRAN PERTAMA";
    result.textContent=chosen?`⭐ ${chosen.name}`:"—";
  },duration);

  clearTimeout(window.__turnSelectionCloseTimer);
  window.__turnSelectionCloseTimer=setTimeout(()=>{
    stopTurnSelectionSound();
    overlay.classList.add("hidden");
  },duration+1100);
}

function syncRoom(){if(room.status==="waiting")return showWaiting();if(room.status==="playing"){showGame();renderQuestion();syncTurn()}if(room.status==="finished")showResults()}
function showWaiting(){$("lobby").classList.add("hidden");$("game").classList.add("hidden");$("waiting").classList.remove("hidden");$("badge").textContent="LOBBI";renderWaiting()}
function showGame(){$("lobby").classList.add("hidden");$("waiting").classList.add("hidden");$("game").classList.remove("hidden");$("badge").textContent="PERMAINAN";ensureTurnBanner();}
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

$("letters").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => {
  const isVowel = vowels.has(l);
  const alreadyUsed = (room.used_letters || []).includes(l);

  // KEYBOARD HANYA BOLEH AKTIF DALAM 3 KEADAAN:
  // 1) Selepas PUTAR roda (turnSpun)
  // 2) Selepas beli VOKAL (vowelMode)
  // 3) Dalam mode SELESAIKAN (solveMode)
  // Selain itu semua huruf dikunci + grayscale.
  const keyboardActive =
    room.current_player_id === me?.id &&
    (turnSpun || vowelMode || solveMode);

  const disabled =
    !keyboardActive ||
    alreadyUsed ||
    (vowelMode && !isVowel) ||
    (isVowel && !vowelMode && !solveMode);

  return `
    <button
      class="${isVowel ? "vowel" : ""}${disabled ? " keyboardLocked" : ""}"
      data-letter="${l}"
      ${disabled ? "disabled aria-disabled=\"true\"" : ""}
    >${l}</button>
  `;
}).join("");
 document.querySelectorAll(".letters button").forEach(b=>{
  const locked=b.disabled;
  // Paksa visual grayscale/disabled walaupun CSS asal belum ada style untuk :disabled.
  b.style.filter=locked?"grayscale(1)":"none";
  b.style.opacity=locked?"0.42":"1";
  b.style.cursor=locked?"not-allowed":"pointer";
  b.setAttribute("aria-disabled",String(locked));
  b.addEventListener("click",()=>{
    if(b.disabled)return;
    solveMode ? chooseSolveLetter(b.dataset.letter) : choose(b.dataset.letter);
  });
});
 $("vowelBtn").classList.toggle("active",vowelMode);
 $("vowelBtn").textContent=vowelMode?"PILIH VOKAL (A E I O U)":"🔤 PILIH VOKAL (-200)";
}
function syncTurn(){
 ensureTurnBanner();
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

 // MULTIPLAYER TURN UX:
 // PUTAR / VOKAL / SELESAIKAN hanya dipaparkan kepada pemain
 // yang sedang mendapat giliran. Bila bukan giliran, butang terus
 // disembunyikan — bukan sekadar disabled.
 const spinBtn=$("spinBtn");
 const vowelBtn=$("vowelBtn");
 const solveBtn=$("solveBtn");

 if(spinBtn){
   spinBtn.classList.toggle("hidden",!active);
   spinBtn.disabled=!active||turnSpun||solveMode;
 }
 if(vowelBtn){
   vowelBtn.classList.toggle("hidden",!active);
   vowelBtn.disabled=!active||solveMode||Number(me.score||0)<200;
 }
 if(solveBtn){
   solveBtn.classList.toggle("hidden",!active);
   solveBtn.disabled=!active||turnSpun||solveMode;
 }

 if(active && lastTurnPlayerId!==room.current_player_id){
   flashMessage("🎯 Giliran anda!");
 }
 if(!active && lastTurnPlayerId!==room.current_player_id){
   flashMessage(`⏳ Giliran ${currentName}`);
 }
 lastTurnPlayerId=room.current_player_id;

 // Sync solve state DAHULU sebelum render keyboard.
 // Ini mengelakkan keyboard menggunakan state lama sekejap.
 if(room.solve_mode===true && room.solve_deadline && active){
   solveMode=true;
   startSolveTimer(new Date(room.solve_deadline).getTime());
 } else {
   solveMode=false;
   solveDeadline=null;
   stopSolveTimer();
 }

 renderBoard();
 renderQuestion();
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
 if(actionBusy)return;
 if(room.current_player_id !== me.id ||(!turnSpun && !vowelMode && !solveMode))return;

 const vowels=new Set(["A","E","I","O","U"]),isVowel=vowels.has(letter);
 if(isVowel&&!vowelMode&&!solveMode)return;

 const cost = 0;
 if(cost&&Number(me.score||0)<cost){
   alert("Anda perlukan sekurang-kurangnya 200 point untuk memilih huruf vokal.");
   return;
 }

 actionBusy=true;

 try{
   const a=currentQ().answer.toUpperCase();
   const alreadyRevealed=new Set(room.revealed_letters||[]);
   const used=[...(room.used_letters||[]),letter];
   const found=[...a]
     .map((x,i)=>x===letter?i+":"+x:null)
     .filter(Boolean)
     .filter(key=>!alreadyRevealed.has(key));

   if(!found.length){
     soundWrong();
     if(cost){
       const {error:scoreError}=await sb.from("players")
         .update({score:Number(me.score||0)-cost})
         .eq("id",me.id);
       if(scoreError)console.error("score update:",scoreError);
     }
     $("message").textContent="❌ Huruf tiada. Giliran bertukar.";
     if(solveMode) await finishSolve(false);
     else await nextTurn(used);
     return;
   }

   /*
    * REVEAL SATU-SATU
    * Kalau ada 3 huruf yang sama, contohnya A A A,
    * jangan buka semua serentak. Buka satu demi satu supaya
    * pemain nampak setiap huruf muncul dan setiap kemunculan
    * mendapat bunyi correct.
    */
   let rev=[...(room.revealed_letters||[])];

   for(let i=0;i<found.length;i++){
     const key=found[i];
     if(rev.includes(key))continue;

     rev=[...new Set([...rev,key])];

     // Simpan setiap langkah supaya pemain lain juga nampak
     // huruf muncul satu demi satu melalui Supabase Realtime.
     const {error:revealError}=await sb.from("rooms")
       .update({revealed_letters:rev,used_letters:used})
       .eq("id",room.id);

     if(revealError){
       console.error("reveal update:",revealError);
       $("message").textContent="❌ Gagal membuka huruf.";
       return;
     }

     // Update local state serta-merta untuk animasi yang konsisten.
     room={...room,revealed_letters:rev,used_letters:used};

     soundCorrect();
     renderQuestion();

     // Jeda antara huruf supaya A A A muncul satu demi satu.
     if(i<found.length-1){
       await new Promise(resolve=>setTimeout(resolve,420));
     }
   }

   if(solveMode){
     $("message").textContent="Huruf dibuka satu demi satu. Teruskan menjawab sebelum masa tamat.";
     if(isSolved(new Set(rev))) return finishSolve(true);
     await refresh();
     return;
   }

   const gain=wheelPoints*found.length;
   const bonus=isSolved(new Set(rev))?500:0;

   const {error:scoreError}=await sb.from("players")
     .update({
       score:Number(me.score||0)-cost+gain+bonus
     })
     .eq("id",me.id);

   if(scoreError){
     console.error("score update:",scoreError);
     $("message").textContent="❌ Gagal mengemas kini point.";
     return;
   }

   if(isSolved(new Set(rev))){
     soundWin();
     $("message").textContent="🎉 Jawapan lengkap! Bonus +500.";
     return complete(rev,used);
   }

   // Selepas satu huruf selesai dipilih, pemain wajib PUTAR semula.
   wheelPoints=0;
   turnSpun=false;
   vowelMode=false;

   room={
     ...room,
     revealed_letters:rev,
     used_letters:used
   };

   renderQuestion();
   syncTurn();
   await refresh();

 }finally{
   actionBusy=false;
 }
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
  // RESET TOTAL selepas perkataan selesai.
  // Soalan baru mesti bermula dengan PUTAR, bukan keyboard/solve mode.
  turnSpun = false;
  vowelMode = false;
  solveMode = false;
  solveDeadline = null;
  stopSolveTimer();
  wheelPoints = 0;

  const qi = Number(room?.question_index || 0);
  const currentIndex = players.findIndex(
    p => p.id === room?.current_player_id
  );
  const nextPlayer = players[(currentIndex + 1) % players.length];

  if (qi < 4) {
    await showWordTransition(
      "PERKATAAN SELESAI!",
      `Giliran seterusnya: ${nextPlayer?.name || "Pemain seterusnya"}`,
      "🎉",
      1400
    );

    const nextState = {
      question_index: qi + 1,
      current_player_id: nextPlayer.id,
      revealed_letters: [],
      used_letters: [],
      solve_mode: false,
      solve_deadline: null
    };

    const { error } = await sb
      .from("rooms")
      .update(nextState)
      .eq("id", room.id);

    if (error) {
      console.error("complete() error:", error);
      $("message").textContent = "❌ Gagal memulakan soalan seterusnya.";
      return;
    }

    // Terus set state tempatan supaya tidak menunggu realtime.
    room = { ...room, ...nextState };

    // Paksa UI ke keadaan awal soalan baru:
    // PUTAR aktif, VOKAL aktif jika cukup point, SELESAIKAN aktif.
    turnSpun = false;
    vowelMode = false;
    solveMode = false;
    solveDeadline = null;
    wheelPoints = 0;
    stopSolveTimer();

    renderBoard();
    renderQuestion();
    syncTurn();

    $("message").textContent =
      isCurrentTurn()
        ? "🎡 Giliran anda. PUTAR roda dahulu."
        : `⏳ Giliran ${nextPlayer?.name || "Pemain seterusnya"}.`;

    // Refresh untuk pastikan semua data player terkini.
    await refresh();
    return;
  }

  // Soalan terakhir.
  await showWordTransition(
    "SEMUA 5 PERKATAAN SELESAI!",
    "Mengira markah akhir dan menentukan juara...",
    "🏆",
    1600
  );

  const { error } = await sb.from("rooms").update({
    status: "finished",
    revealed_letters: rev,
    used_letters: used,
    solve_mode: false,
    solve_deadline: null
  }).eq("id", room.id);

  if (error) {
    console.error("finish game error:", error);
    return;
  }

  room = {
    ...room,
    status: "finished",
    revealed_letters: rev,
    used_letters: used,
    solve_mode: false,
    solve_deadline: null
  };

  await refresh();
}

async function solve(){
 if(actionBusy||room.current_player_id!==me.id||turnSpun||solveMode)return;
 actionBusy=true;
 solveMode=true;wheelPoints=0;vowelMode=false;lastSolveSoundSecond=-1;soundSolveStart();sendActivity("solve");
 const deadline=Date.now()+30000;solveDeadline=deadline;
 await sb.from("rooms").update({solve_mode:true,solve_deadline:new Date(deadline).toISOString(),used_letters:room.used_letters||[]}).eq("id",room.id);
 startSolveTimer(deadline);
 $("message").textContent="🧠 Mod Selesaikan aktif. Anda ada 30 saat untuk menjawab.";
 buildSolveKeyboard(); await refresh();
 actionBusy=false;
}
async function finishSolve(correct){
 if(!solveMode)return;
 solveMode=false;stopSolveTimer();
 if(correct){soundWin();return complete([...currentQ().answer.toUpperCase()].map((x,i)=>i+":"+x),room.used_letters||[]);}
 const i=players.findIndex(p=>p.id===room.current_player_id),n=players[(i+1)%players.length];
 await sb.from("rooms").update({current_player_id:n.id,solve_mode:false,solve_deadline:null,used_letters:room.used_letters||[]}).eq("id",room.id);
 await refresh();
}
function startSolveTimer(deadline){
 solveDeadline=deadline;
 stopSolveTimer();
 lastSolveSoundSecond=-1;
 const tick=()=>{
   if(!solveMode)return;
   const left=Math.max(0,Math.ceil((solveDeadline-Date.now())/1000));
   $("solveTimer").classList.remove("hidden");
   $("timerValue").textContent=left;
   $("solveTimer").classList.toggle("urgent",left<=10);
   buildSolveKeyboard();

   if(left!==lastSolveSoundSecond){
     lastSolveSoundSecond=left;
     if(left>0 && left<=15) soundTimerTick(left<=5);
     if(left===5) soundTimerFinal();
   }

   if(left<=0){
     stopSolveTimer();
     soundWrong();
     $("message").textContent="⏰ Masa tamat. Giliran bertukar.";
     finishSolve(false);
   }
 };
 tick();
 solveTimerId=setInterval(tick,250);
}
function stopSolveTimer(){
 if(solveTimerId){clearInterval(solveTimerId);solveTimerId=null}
 $("solveTimer").classList.add("hidden"); $("solveTimer").classList.remove("urgent");
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
function openWheel(){
  if(actionBusy||room.current_player_id!==me?.id||turnSpun||room.status!=="playing")return;
  soundClick();
  const spinId=Date.now()+"-"+Math.random().toString(36).slice(2);
  localSpinId=spinId;
  sendActivity("spin_start",{spinId,wheelRot});
  $("wheelPlayer").textContent=me.name;
  $("wheelResult").textContent="PUSING RODA";
  $("wheelModal").classList.remove("hidden");
}
function closeWheel(){if(!drag&&!settle)$("wheelModal").classList.add("hidden")}
function setRot(){ $("wheel").style.transform=`rotate(${wheelRot}deg)`}
function down(e){
  if(settle||actionBusy)return;
  soundClick();drag=true;startWheelSound();pid=e.pointerId;lastA=angle(e);lastT=performance.now();vel=0;
  $("wheelArea").setPointerCapture?.(pid);
  e.preventDefault();
}
function move(e){
  if(!drag||e.pointerId!==pid)return;
  const now=performance.now(),a=angle(e);let d=a-lastA;
  if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;
  const dt=Math.max(8,now-lastT),deg=d*180/Math.PI;wheelRot+=deg;vel=deg/dt*16;setRot();lastA=a;lastT=now;
  if(now-lastWheelMoveBroadcast>=40){
    lastWheelMoveBroadcast=now;
    sendActivity("spin_move",{spinId:localSpinId,wheelRot,ts:Date.now()});
  }
  e.preventDefault();
}
function up(e){
  if(!drag||e.pointerId!==pid)return;
  drag=false;pid=null;settle=true;startWheelSound();
  let v=Math.max(-25,Math.min(25,vel));
  if(Math.abs(v)<3)v=(Math.random()<.5?-1:1)*(7+Math.random()*4);

  // Kira destinasi dan tempoh dahulu supaya semua device bergerak ke
  // destinasi yang sama pada masa yang sama.
  let previewV=v,previewRotation=wheelRot,frames=0;
  while(frames<240 && Math.abs(previewV)>.12){
    previewV*=.985;previewRotation+=previewV;frames++;
  }
  const releaseAt=Date.now()+Math.max(16,frames*16.67);
  sendActivity("spin_release",{
    spinId:localSpinId,
    finalRotation:previewRotation,
    releaseAt,
    duration:Math.max(16,frames*16.67),
    ts:Date.now()
  });

  let actualFrames=0;
  function go(){
    v*=.985;vel=v;wheelRot+=v;setRot();actualFrames++;
    if(actualFrames<240&&Math.abs(v)>.12){requestAnimationFrame(go)}
    else{vel=0;settle=false;stopWheelSound();result()}
  }
  requestAnimationFrame(go);
}
async function result(){
 if(room?.current_player_id!==me?.id)return;
 if(!safeRoomState() || room.current_player_id!==me.id)return;
 const n=((360-(wheelRot%360))+360)%360;
 const idx=Math.floor(n/(360/WHEEL.length))%WHEEL.length;
 const r=WHEEL[idx];
 const label=r[0], value=r[1], effect=r[2]||"POINTS";

 wheelPoints=effect==="POINTS"?Number(value||0):0;
 turnSpun=true;
 vowelMode=false;

 sendActivity("spin_result",{points:wheelPoints,label,effect,wheelIndex:idx,spinId:localSpinId});
 localSpinId=null;

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

 soundPoint(value);$("message").textContent=`Anda mendapat ${value} point. Pilih huruf atau beli vokal.`;
 syncTurn();
}
$("createBtn").addEventListener("click",createRoom);$("joinBtn").addEventListener("click",joinRoom);$("startBtn").addEventListener("click",startGame);$("leaveBtn").addEventListener("click",leave);$("spinBtn").addEventListener("click",openWheel);
$("vowelBtn").addEventListener("click", async ()=>{
  if(actionBusy) return;
  if(room?.current_player_id !== me?.id) return;
  if(turnSpun) return;
  if(solveMode) return;

  const score = Number(me.score || 0);

  if(score < 200){
    alert("Anda perlukan sekurang-kurangnya 200 point untuk memilih vokal.");
    return;
  }

  actionBusy = true;

  try{
    // Tolak 200 point terus apabila beli vokal
    const newScore = score - 200;

    const { error } = await sb
      .from("players")
      .update({ score: newScore })
      .eq("id", me.id);

    if(error){
      console.error(error);
      alert("Gagal membeli vokal: " + error.message);
      return;
    }

    // Aktifkan mode vokal
    vowelMode = true;

    // Maklumkan pemain lain
    sendActivity("vowel");

    $("message").textContent =
      "🔤 Pilih satu huruf vokal: A, E, I, O atau U.";

    await refresh();

    renderQuestion();
    syncTurn();

  } finally {
    actionBusy = false;
  }
});
$("solveBtn").addEventListener("click",solve);$("closeWheel").addEventListener("click",closeWheel);$("cancelWheel").addEventListener("click",closeWheel);$("resultBtn").addEventListener("click",()=>leaveLocal());$("copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(room.code);alert("Kod bilik disalin.")}catch{alert("Kod bilik: "+room.code)}})
const wa=$("wheelArea");wa.addEventListener("pointerdown",down);wa.addEventListener("pointermove",move);wa.addEventListener("pointerup",up);wa.addEventListener("pointercancel",up);
$("soundBtn")?.addEventListener("click",()=>{
  soundEnabled=!soundEnabled;
  updateSoundButton();
  if(soundEnabled) soundClick();
});
updateSoundButton();

document.addEventListener("pointerdown", unlockAudio, {passive:true});
document.addEventListener("touchstart", unlockAudio, {passive:true});

labels();addEventListener("resize",labels);if(ok())connect();else status("Setup diperlukan — masukkan Supabase URL & anon key");
