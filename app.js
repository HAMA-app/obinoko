(() => {
  /* ==== ヘルパ ==== */
  const r1 = v => Math.round(v * 10) / 10;
  const $  = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const vibrate = ms => { if (navigator.vibrate) navigator.vibrate(ms); };

  const readNum = (sel, fb=0) => {
    const el = $(sel); if (!el) return fb;
    const v = el.value; if (v === '' || v == null) return fb;
    const n = Number(v); return Number.isFinite(n) ? r1(n) : fb;
  };
  const readInt = (sel, fb=0) => {
    const el = $(sel); if (!el) return fb;
    const v = el.value; if (v === '' || v == null) return fb;
    const n = parseInt(v,10); return Number.isFinite(n) ? n : fb;
  };

  /* ==== 音（iOS解禁対応） ==== */
  const AudioMgr = (() => {
    let ctx, unlocked=false;
    const ensure = () => (ctx ||= new (window.AudioContext||window.webkitAudioContext)());
    const unlock = () => { if (unlocked) return; try{ ensure().resume(); unlocked=true; }catch(e){} };
    const beep = (f=880, ms=180, type='sine', vol=0.22) => {
      try{
        const c=ensure(), o=c.createOscillator(), g=c.createGain();
        o.type=type; o.frequency.value=f;
        g.gain.setValueAtTime(0, c.currentTime);
        g.gain.linearRampToValueAtTime(vol, c.currentTime+0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime+ms/1000);
        o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+ms/1000+0.05);
      }catch(e){}
    };
    const errorBeep=()=>{ beep(300,140,'square',0.28); setTimeout(()=>beep(220,200,'square',0.28),120); };
    const warnBeep =()=>{ beep(700,180,'sawtooth',0.22); };
    document.addEventListener('pointerdown', unlock, { once:true, capture:true });
    document.addEventListener('touchstart',  unlock, { once:true, capture:true });
    return { errorBeep, warnBeep };
  })();

  /* ==== 誤タップ対策タップバインダ ==== */
  let __lastScrollAt = 0;
  const markScrolled = () => { __lastScrollAt = Date.now(); };
function bindTap(el, handler){
  if(!el) return;
  const THRESH=10, COOLDOWN=200, DUP_MS=350;
  let sx=0, sy=0, moved=false, lastAt=0;
  let usingTouch=false;   // ← 追加：touch使用中フラグ
  let busy=false;         // ← 追加：一時再入ガード

  const safeRun = (e) => {
    if (busy) return;
    busy = true;
    try { handler(e); } finally {
      setTimeout(()=>{ busy=false; }, 50);  // 超短時間の二重起動抑止
    }
  };

  el.addEventListener('touchstart', e => {
    usingTouch = true;
    const t=e.touches[0]; sx=t.clientX; sy=t.clientY; moved=false;
  }, {passive:true});

  el.addEventListener('touchmove', e => {
    const t=e.touches[0];
    if (Math.hypot(t.clientX-sx, t.clientY-sy) > THRESH) moved=true;
  }, {passive:true});

  el.addEventListener('touchend', e => {
    if (moved) return;
    if (Date.now() - __lastScrollAt < COOLDOWN) return;
    e.preventDefault();
    lastAt = Date.now();
    safeRun(e);
    // touchジェスチャ終了後、少し待ってから使用フラグ解除
    setTimeout(()=>{ usingTouch=false; }, 300);
  }, {passive:false});

  el.addEventListener('pointerup', e => {
    if (usingTouch) return;                        // ← 追加：touch中は無視
    if (Date.now() - __lastScrollAt < COOLDOWN) return;
    lastAt = Date.now();
    safeRun(e);
  });

  el.addEventListener('click', e => {
    if (Date.now() - lastAt < DUP_MS) { e.preventDefault(); return; }
    if (usingTouch) { e.preventDefault(); return; } // ← 追加：touch由来のclickは無視
    safeRun(e);
  }, true);
}


  /* ==== 準最適モード（隠し） ==== */
  let semiMode=false;
  const MAGIC=77777.7;
  const setSemiMode = on => {
    semiMode=!!on; document.body.classList.toggle('semi-mode', semiMode);
  };

  /* ==== プリセット ==== */
  const PRESET_KEY = s => `obikyo_preset_v1_${s}`;
  const getUIState = () => {
    const cuts=[], L=$$('#cutInputs .length'), Q=$$('#cutInputs .qty');
    for(let i=0;i<L.length;i++){
      const len=Number(L[i].value), qty=Number(Q[i].value);
      if(!len||!qty) continue; cuts.push({ length:r1(len), qty:Math.trunc(qty) });
    }
    return {
      stockLength: readNum('#stockLength',0),
      stockCount : readInt('#stockCount',0),
      grip       : readNum('#grip',0),
      tolerance  : readNum('#tolerance',0),
      kerf       : readNum('#kerf',0),
      spareTarget: ($('#spareTarget')?.value ?? '')==='' ? null : readNum('#spareTarget', null),
      cuts
    };
  };
  const setUIState = s => {
    if(!s) return;
    $('#stockLength')&&( $('#stockLength').value=s.stockLength ?? 0 );
    $('#stockCount') &&( $('#stockCount').value =s.stockCount  ?? 0 );
    $('#grip')       &&( $('#grip').value       =s.grip        ?? 0 );
    $('#tolerance')  &&( $('#tolerance').value  =s.tolerance   ?? 0 );
    $('#kerf')       &&( $('#kerf').value       =s.kerf        ?? 0 );
    $('#spareTarget')&&( $('#spareTarget').value=s.spareTarget ?? '' );
    resetCuts(); (s.cuts||[]).forEach(c=>addCutInput(c.length,c.qty));
  };
  const savePreset = slot => {
    localStorage.setItem(PRESET_KEY(slot), JSON.stringify({ meta:{savedAt:new Date().toISOString()}, state:getUIState() }));
    vibrate(80); alert(`カスタム${slot}に保存しました。`);
  };
  const loadPreset = slot => {
    const raw=localStorage.getItem(PRESET_KEY(slot));
    if(!raw){ alert(`カスタム${slot}は未保存です。長押しで保存できます。`); return; }
    setUIState(JSON.parse(raw).state); vibrate(30);
  };
  const bindLongPressPreset = btn => {
    const slot=btn.dataset.slot; let timer=null, pressed=false, moved=false; const THRESH=10;
    const start=(x,y)=>{
      pressed=true; moved=false; const sx=x, sy=y;
      timer=setTimeout(()=>{ if(!moved){ pressed=false; savePreset(slot);} },650);
      const move=e=>{ const t=e.touches?e.touches[0]:e; if(Math.hypot(t.clientX-sx,t.clientY-sy)>THRESH) moved=true; };
      const end =()=>{
        if(timer) clearTimeout(timer);
        if(pressed && !moved) loadPreset(slot);
        pressed=false;
        btn.removeEventListener('touchmove',move); btn.removeEventListener('touchend',end);
        btn.removeEventListener('mouseup',end); btn.removeEventListener('mouseleave',end);
      };
      btn.addEventListener('touchmove',move,{passive:true});
      btn.addEventListener('touchend',end);
      btn.addEventListener('mouseup',end);
      btn.addEventListener('mouseleave',end);
    };
    btn.addEventListener('touchstart',e=>{const t=e.touches[0]; start(t.clientX,t.clientY);},{passive:true});
    btn.addEventListener('mousedown',e=>start(e.clientX,e.clientY));
    btn.addEventListener('click',e=>e.preventDefault(),true);
  };

  /* ==== 一括入出力 ==== */
  const dumpAll = () => {
    const data={}, slots=[1,2,3,4];
    for(const s of slots){ const raw=localStorage.getItem(PRESET_KEY(s)); if(raw) data[s]=JSON.parse(raw); }
    return { version:1, exportedAt:new Date().toISOString(), data };
  };
  const loadAll = obj => {
    if(!obj||!obj.data) throw new Error('不正なファイルです');
    for(const s of Object.keys(obj.data)){ localStorage.setItem(PRESET_KEY(s), JSON.stringify(obj.data[s])); }
  };
  const downloadText=(name,text)=>{
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  /* ==== 入力行 ==== */
  let cutRowCount=0;
  function addCutInput(length="", qty=""){
    if(cutRowCount>=30) return;
    const row=document.createElement('div');
    row.className='cut-input';
    row.innerHTML=`
      <input type="number" class="length" inputmode="decimal" step="0.1" placeholder="00000.0" value="${length}">
      <input type="number" class="qty"    inputmode="numeric" step="1"    placeholder="00000"   value="${qty}">
    `;
    $('#cutInputs')?.appendChild(row); cutRowCount++;
  }
  function resetCuts(){
    const wrap=$('#cutInputs'); if(wrap) wrap.innerHTML=''; cutRowCount=0;
    const out=$('#result'); if(out) out.textContent='';
  }

  /* ==== エラー通知 ==== */
  const alertError = msg => { try{ alert(msg); }catch(e){} vibrate(240); AudioMgr.errorBeep(); };

  /* ==== 演算ロジック ==== */
  function buildCutsForCalc(tolerance){
    const cuts=[], L=$$('#cutInputs .length'), Q=$$('#cutInputs .qty');
    for(let i=0;i<L.length;i++){
      const t=Number(L[i].value), q=Number(Q[i].value);
      if(!t||!q) continue;
      const input=r1(t-Number(tolerance));
      for(let k=0;k<q;k++) cuts.push({ target:r1(t), input });
    }
    return cuts;
  }
  function statsFromCuts(cuts,kerf){
    const map=new Map(); let totalUsage=0;
    for(const c of cuts){ map.set(c.target,(map.get(c.target)||0)+1); totalUsage+=r1(c.target+kerf); }
    return { countByTarget:map, totalUsage };
  }
  function assignBoardsDescending(cuts,stockLen,stockCnt,grip,kerf){
    const boards=Array.from({length:stockCnt},(_,i)=>({id:i+1,cuts:[],used:0}));
    let remain=cuts.slice().sort((a,b)=>b.target-a.target);
    const CAND= semiMode?120:60, NODE= semiMode?100000:20000;

    for(const b of boards){
      if(remain.length===0) break;
      const cap=r1(stockLen-grip), pool=remain.slice(0,Math.min(CAND,remain.length));
      let best=[], usedBest=0, nodes=0;
      (function dfs(idx,used,sel){
        if(++nodes>NODE) return;
        if(used>usedBest){ usedBest=used; best=sel.slice(); }
        for(let i=idx;i<pool.length;i++){
          const need=r1(pool[i].target+kerf);
          if(used+need>cap) continue;
          sel.push(pool[i]); dfs(i+1,r1(used+need),sel); sel.pop();
        }
      })(0,0,[]);
      b.cuts=best; b.used=best.reduce((s,c)=>r1(s+c.target+kerf),0);
      const chosen=new Set(best); remain=remain.filter(x=>!chosen.has(x));
    }
    return { boards, remaining:remain };
  }
  function gapFill(boards,remain,stockLen,grip,kerf){
    remain.sort((a,b)=>a.target-b.target);
    for(const b of boards){
      let cap=r1((stockLen-grip)-b.used); if(cap<=0) continue;
      for(let i=0;i<remain.length && cap>0;){
        const need=r1(remain[i].target+kerf);
        if(need<=cap+1e-9){ b.cuts.push(remain[i]); b.used=r1(b.used+need); cap=r1(cap-need); remain.splice(i,1); }
        else break;
      }
      const max=r1(stockLen-grip); if(b.used>max) b.used=max;
    }
    return remain;
  }
  function tallyCuts(cuts){
    const m=new Map();
    for(const c of cuts){
      const key=`${c.input}->${c.target}`;
      if(!m.has(key)) m.set(key,{input:c.input,target:c.target,count:0,meta:c.meta||''});
      m.get(key).count++;
    }
    return [...m.values()].sort((a,b)=>a.target-b.target||a.input-b.input);
  }
  const compressIds = ids => {
    ids.sort((a,b)=>a-b);
    const ranges=[]; let s=ids[0], p=ids[0];
    for(let i=1;i<ids.length;i++){ const c=ids[i]; if(c===p+1){ p=c; continue; } ranges.push(s===p?`${s}`:`${s}〜${p}`); s=p=c; }
    ranges.push(s===p?`${s}`:`${s}〜${p}`); return ranges.join(',');
  };

  function renderOutput(boards, shortageMap, stockLen, grip, audit, kerf){
    const SL=Number(stockLen), GR=Number(grip);
    const sigMap=new Map();
    for(const b of boards){
      if(!b.cuts.length) continue;
      const tall=tallyCuts(b.cuts);
      const rEx=Math.max(0, r1((SL-GR)-b.used));
      const rIn=Math.max(0, r1(SL-b.used));
      const sig=JSON.stringify({tall,rEx:+rEx.toFixed(3),rIn:+rIn.toFixed(3)});
      if(!sigMap.has(sig)) sigMap.set(sig,{ids:[],tall,rEx,rIn});
      sigMap.get(sig).ids.push(b.id);
    }

    let totalRemain=0, rows='';
    for(const {ids,tall,rEx,rIn} of [...sigMap.values()].sort((a,b)=>a.ids[0]-b.ids[0])){
      totalRemain += rIn * ids.length;
      const group=`部材${compressIds(ids)}`;
      const remainCells=`<td class="num" rowspan="${tall.length}">${rIn.toFixed(1)}</td><td class="num" rowspan="${tall.length}">${rEx.toFixed(1)}</td>`;
      tall.forEach((row,i)=>{
        const inp=Number(row.input).toFixed(1), tgt=Number(row.target).toFixed(1), qty=row.count;
        const usedLen=(Number(row.target)*qty).toFixed(1);
        const kerfSum=(qty*Number(kerf||0)).toFixed(1);
        rows += `<tr>
          ${i===0?`<td class="group-head" rowspan="${tall.length}">${group}</td>`:''}
          <td class="num">${tgt}${row.meta==='URAMODE' ? ' <span class="subtle">(捨て切り)</span>' : ''}</td>
          <td class="num y">${inp}</td>
          <td class="num y">${qty}</td>
          ${i===0?remainCells:''}
          <td class="num">${usedLen}</td>
          <td class="num subtle">${kerfSum}</td>
        </tr>`;
      });
    }

    const table = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>部材</th><th class="num">実長</th><th class="num">機械設定</th><th class="num">本数</th>
              <th class="num">余り</th><th class="num">有効残長</th><th class="num">実使用長</th><th class="num">削れ合計</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="8" class="subtle">切断結果がありません</td></tr>`}</tbody>
        </table>
      </div>`;

    const keys=[...shortageMap.keys()].sort((a,b)=>a-b);
    let footer = `<div style="margin-top:8px">合計余り（掴みしろ含む・全材）：<b>${totalRemain.toFixed(1)} mm</b></div>`;
    if(keys.length>0){
      footer += `<div style="margin-top:6px"><b class="danger">切断不足：</b>${
        keys.map(k=>` <span class="danger">${Number(k).toFixed(1)}mm × ${shortageMap.get(k)}本</span>`).join(' / ')
      }</div>`;
      alertError('切断不足があります。入力や条件をご確認ください。');
    }else{
      footer += `<div style="margin-top:6px"><b>切断不足：</b>なし</div>`;
    }
    footer += `<div style="margin-top:8px" class="subtle">--- 監査 --- 要求 ${audit.demandUsage.toFixed(1)}mm ／ 容量 ${audit.totalCapacity.toFixed(1)}mm ／ 実割当 ${audit.assignedUsage.toFixed(1)}mm ／ 不足発生 ${audit.demandUsage>audit.totalCapacity?'はい':'いいえ'}</div>`;

    $('#result').innerHTML = table + footer;

    $('#result').querySelectorAll('.table-wrap').forEach(el=>{
      el.addEventListener('scroll', markScrolled, {passive:true});
      el.addEventListener('touchmove', markScrolled, {passive:true});
    });
  }

  /* ==== 裏モード（余り目標の捨て切り） ==== */
function applyUraMode(boards, stockLength, grip, kerf, tolerance, spareTarget){
  if(!(spareTarget > 0) || spareTarget <= grip) return;

  const MIN_DROP = 50;  // 捨て切りは50mm以上が望ましい

  // 残カット全体（未割当）を一括で扱うため、盤面外にまとめる
  // すでに assign/gapFill の後で、boards に割り当て済み、それ以外が remaining の想定だが
  // ここでは boards 内の入替で生じる戻し分もプールする
  let pool = []; // {target, input, meta?}
  // 初期 pool は「割り当て外」に限定されるが、この関数の呼び出し元では remaining を渡していないので
  // いまは boards 外の残は存在しない前提。以降、入替で一時的に pool を増減させる。

  // 部材ごとに「余り=目標」に合わせる
  const SL = Number(stockLength);
  const desiredUsed = Number.isFinite(SL - spareTarget) ? r1(SL - spareTarget) : null;
  if (desiredUsed == null || desiredUsed <= 0) return;

  // 便利関数
  const needOf = (c) => r1(c.target + kerf);

  // 詰め直しヘルパ：capを超えない範囲でpoolから詰める（小物優先）
  function fillFromPool(b, cap){
    // 小さい順でなるべく多く拾う（必要本数の回収を優先）
    pool.sort((a,b)=>a.target-b.target);
    for (let i=0; i<pool.length && cap>0; ){
      const c = pool[i];
      const need = needOf(c);
      if (need <= cap + 1e-9){
        b.cuts.push(c);
        b.used = r1(b.used + need);
        cap = r1(cap - need);
        pool.splice(i,1);
      } else {
        i++;
      }
    }
  }

  for (const b of boards){
    // すでに無割り当ての部材は対象外
    if (!b.cuts) b.cuts = [];
    b.used = r1(b.used);

    // 1) まず「desiredUsed」を上限に、残プールから詰める
    let cap = r1(desiredUsed - b.used);
    if (cap > 0) fillFromPool(b, cap);

    // 2) それでも必要を拾えない/desiredに届かない場合は、1本スワップ（大→小複数）
    //    - 大きい1本を戻してcapを作り、小さいのをできるだけ詰める
    //    - 改善度： (a) 追加本数が増える / (b) desiredUsedに近づく
    function tryOneSwap(){
      if (!b.cuts.length) return false;
      // 今のギャップ
      const beforeGap = Math.abs(desiredUsed - b.used);
      let best = null;

      // 大きい順に1本試す
      const sortedIdx = [...b.cuts.keys()].sort((i,j)=>b.cuts[j].target - b.cuts[i].target);
      for (const idx of sortedIdx){
        const removed = b.cuts[idx];
        const removedNeed = needOf(removed);

        // 仮に外す
        const cutsBackup = b.cuts;
        const usedBackup = b.used;

        // 外してプールへ
        b.cuts = cutsBackup.slice(0, idx).concat(cutsBackup.slice(idx+1));
        b.used = r1(usedBackup - removedNeed);
        pool.push(removed);

        // できた余白にできるだけ詰める
        let remainCap = r1(desiredUsed - b.used);
        if (remainCap > 0) fillFromPool(b, remainCap);

        // 評価：ギャップの縮小と、拾えた本数（件数差）
        const afterGap = Math.abs(desiredUsed - b.used);
        const pickedDiff = b.cuts.length - (cutsBackup.length - 1); // -1は外したぶん
        if (!best || pickedDiff > best.picked || (pickedDiff === best.picked && afterGap < best.gap)){
          best = { idx, state: { cuts: b.cuts, used: b.used }, picked: pickedDiff, gap: afterGap };
        }

        // 元に戻す（次の候補を試すため）
        // ※ pool に入れた removed は戻し忘れないこと
        const lastAdded = b.cuts.filter(x=>!cutsBackup.includes(x));
        // 追加した分を pool に戻す
        for (const x of lastAdded) pool.push(x);
        // ボードを元に
        b.cuts = cutsBackup;
        b.used = usedBackup;
        // removed を pool から削除（末尾の同一オブジェクトを消す）
        const idxR = pool.lastIndexOf(removed);
        if (idxR >= 0) pool.splice(idxR,1);
      }

      if (best){
        // ベストな入替を確定適用
        // まず対象を本当に外す
        const removed = b.cuts[best.idx];
        const removedNeed = needOf(removed);
        b.cuts.splice(best.idx, 1);
        b.used = r1(b.used - removedNeed);
        // removedはpoolへ
        pool.push(removed);

        // desiredUsedに合わせて再度詰める（best.state相当）
        let cap2 = r1(desiredUsed - b.used);
        if (cap2 > 0) fillFromPool(b, cap2);
        return true;
      }
      return false;
    }

    // スワップを1回だけ試行（軽量）
    if (Math.abs(desiredUsed - b.used) > kerf + 1e-9) {
      tryOneSwap();
    }

    // 3) 最後に捨て切りで desiredUsed にぴったり合わせる
    //    dropActual = desiredUsed - b.used - kerf
    let diff = r1(desiredUsed - b.used);
    if (diff > kerf + 1e-9){
      let dropActual = r1(diff - kerf);
      if (dropActual < MIN_DROP){
        // 可能なら小物1本外してdropを確保（小さいのを1本戻してdropを確保）
        const smallIdx = b.cuts.findIndex(x=>x.target < MIN_DROP);
        if (smallIdx >= 0){
          const s = b.cuts[smallIdx];
          const sNeed = needOf(s);
          b.cuts.splice(smallIdx,1);
          b.used = r1(b.used - sNeed);
          pool.push(s);
          // 再計算
          diff = r1(desiredUsed - b.used);
          dropActual = r1(diff - kerf);
        }
      }
      if (dropActual > 0){
        const dropInput = r1(dropActual - tolerance);
        b.cuts.push({ target: dropActual, input: dropInput, meta:'URAMODE' });
        b.used = r1(b.used + dropActual + kerf);
      }
    }

    // 念のため上限クリップ
    const capMax = r1(SL - grip);
    if (b.used > capMax) b.used = capMax;
  }
}

  /* ==== メイン ==== */
  function run(secret=false){
    try{
      const stockLen=readNum('#stockLength',0);
      const stockCnt=readInt('#stockCount',0);
      const grip    =readNum('#grip',0);
      const kerf    =readNum('#kerf',0);
      const tol     =readNum('#tolerance',0);
      const spareEl =$('#spareTarget');
      const spare   =(spareEl && spareEl.value!=='') ? readNum('#spareTarget',null) : null;

      $('#result').textContent='';

      const cuts=buildCutsForCalc(tol);
      if(cuts.length===0 || stockCnt<=0 || stockLen<=0){
        $('#result').textContent='入力が不足しています。'; AudioMgr.warnBeep(); return;
      }

      const demand=statsFromCuts(cuts,kerf);
      const capacity=r1((stockLen-grip)*stockCnt);

      let {boards,remaining}=assignBoardsDescending(cuts,stockLen,stockCnt,grip,kerf);
      remaining=gapFill(boards,remaining,stockLen,grip,kerf);

      if(secret) applyUraMode(boards,stockLen,grip,kerf,tol,spare);
      if(semiMode){ remaining.sort((a,b)=>b.target-a.target); remaining=gapFill(boards,remaining,stockLen,grip,kerf); }

      const assigned=statsFromCuts(boards.flatMap(b=>b.cuts),kerf);

      const shortage=new Map();
      for(const c of remaining) shortage.set(c.target,(shortage.get(c.target)||0)+1);
      if(shortage.size===0){
        for(const [t,need] of demand.countByTarget.entries()){
          const done=assigned.countByTarget.get(t)||0;
          if(done<need) shortage.set(t,need-done);
        }
      }

      renderOutput(boards, shortage, stockLen, grip, {demandUsage:demand.totalUsage, totalCapacity:capacity, assignedUsage:assigned.totalUsage}, kerf);
    }catch(e){
      console.error(e); alertError('演算中にエラーが発生しました。入力を確認してください。');
    }
  }

  /* ==== 初期化 ==== */
  function wire(){
    bindTap($('#btnAdd'),   ()=>addCutInput());
    bindTap($('#btnCalc'),  ()=>run(false));
    bindTap($('#btnReset'), ()=>resetCuts());

    // 裏モード（短押し：通常裏／隠し：部材長=77777.7 で準最適ON、3秒長押しでOFF）
    (function(){
      const btn=$('#btnUra'); if(!btn) return;
      bindTap(btn, ()=>{
        const val=readNum('#stockLength',0);
        if(val===MAGIC){ setSemiMode(true); vibrate(30); return; }
        run(true);
      });
      let t=null, down=false, moved=false, sx=0, sy=0; const TH=10;
      const start=(x,y)=>{ down=true; moved=false; sx=x; sy=y; t=setTimeout(()=>{ if(down && !moved){ setSemiMode(false); vibrate(50);} },3000); };
      const move=e=>{ const pt=e.touches?e.touches[0]:e; if(Math.hypot(pt.clientX-sx,pt.clientY-sy)>TH) moved=true; };
      const end =()=>{ down=false; if(t){clearTimeout(t); t=null;} };
      btn.addEventListener('touchstart',e=>{const pt=e.touches[0]; start(pt.clientX,pt.clientY);},{passive:true});
      btn.addEventListener('touchmove',move,{passive:true});
      btn.addEventListener('touchend',end);
      btn.addEventListener('mousedown',e=>start(e.clientX,e.clientY));
      btn.addEventListener('mousemove',move);
      btn.addEventListener('mouseup',end);
      btn.addEventListener('mouseleave',end);
    })();

    // プリセット
    $$('.btn-preset').forEach(bindLongPressPreset);

    // 入出力
    bindTap($('#btnExport'),()=>downloadText('obikyo-presets.json', JSON.stringify(dumpAll(),null,2)));
    bindTap($('#btnImport'),()=>$('#importFile')?.click());
    $('#importFile')?.addEventListener('change', async e=>{
      const f=e.target.files?.[0]; if(!f) return;
      try{ loadAll(JSON.parse(await f.text())); alert('インポート完了：カスタム1〜4に読み込みました。'); }
      catch(err){ console.error(err); alert('インポートに失敗しました。ファイルを確認してください。'); }
      finally{ e.target.value=''; }
    });

    // 初期行
    for(let i=0;i<3;i++) addCutInput();

    // スクロール検知（誤タップ抑止）
    window.addEventListener('scroll', markScrolled, {passive:true});
    $('#result')?.addEventListener('scroll', markScrolled, {passive:true});
  }

  document.addEventListener('DOMContentLoaded', wire);

  // 互換：必要なら外部から呼べるように
  window.addCutInput = addCutInput;
  window.resetCuts   = resetCuts;
  window.run         = run;
})();
