(() => {
  // ========= ヘルパ =========
  const r1 = v => Math.round(v * 10) / 10;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const vibrate = ms => { if (navigator.vibrate) navigator.vibrate(ms); };

  // tap/クリックを確実に拾う
  function bindTap(el, handler) {
    if (!el) return;
    let fired = false;
    const fn = (e) => {
      if (fired) return;
      fired = true;
      try { handler(e); } finally { setTimeout(() => fired = false, 0); }
    };
    el.addEventListener('pointerup', fn);
    el.addEventListener('touchend', (e)=>{ e.preventDefault(); fn(e); }, {passive:false});
    el.addEventListener('click', fn);
  }

  // ========= プリセット保存（localStorage） =========
  const PRESET_KEY = slot => `obikyo_preset_v1_${slot}`;

  function getUIState() {
    const cuts = [];
    const lengths = $$('#cutInputs .length');
    const qtys = $$('#cutInputs .qty');
    for (let i = 0; i < lengths.length; i++) {
      const L = Number(lengths[i].value);
      const Q = Number(qtys[i].value);
      if (!L || !Q) continue;
      cuts.push({ length: r1(L), qty: Math.trunc(Q) });
    }
    return {
      stockLength: r1(Number($('#stockLength').value || 0)),
      stockCount: Math.trunc(Number($('#stockCount').value || 0)),
      grip: r1(Number($('#grip').value || 0)),
      tolerance: r1(Number($('#tolerance').value || 0)),
      kerf: r1(Number($('#kerf').value || 0)),
      spareTarget: $('#spareTarget').value === '' ? null : r1(Number($('#spareTarget').value)),
      cuts
    };
  }

  function setUIState(s) {
    if (!s) return;
    $('#stockLength').value = s.stockLength ?? 0;
    $('#stockCount').value = s.stockCount ?? 0;
    $('#grip').value = s.grip ?? 0;
    $('#tolerance').value = s.tolerance ?? 0;
    $('#kerf').value = s.kerf ?? 0;
    $('#spareTarget').value = s.spareTarget ?? '';

    resetCuts();
    (s.cuts || []).forEach(c => addCutInput(c.length, c.qty));
  }

  function savePreset(slot) {
    const state = getUIState();
    const payload = { meta: { savedAt: new Date().toISOString() }, state };
    localStorage.setItem(PRESET_KEY(slot), JSON.stringify(payload));
    vibrate(80);
    alert(`カスタム${slot}に保存しました。`);
  }

  function loadPreset(slot) {
    const raw = localStorage.getItem(PRESET_KEY(slot));
    if (!raw) { alert(`カスタム${slot}は未保存です。長押しで保存できます。`); return; }
    const data = JSON.parse(raw);
    setUIState(data.state);
    vibrate(30);
  }

  // 長押し/短押し（タップ=呼出、長押し=保存）
  function bindLongPressPreset(btn) {
    let timer = null, pressed = false;
    const slot = btn.dataset.slot;

    const start = () => {
      pressed = true;
      timer = setTimeout(() => { pressed = false; savePreset(slot); }, 650);
    };
    const end = () => {
      if (timer) clearTimeout(timer);
      if (pressed) loadPreset(slot);
      pressed = false;
    };
    btn.addEventListener('touchstart', start, {passive:true});
    btn.addEventListener('touchend', end);
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseleave', end);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('click', e => e.preventDefault()); // 二重発火防止
  }

  // === すべてのプリセットをまとめてエクスポート/インポート ===
  function dumpAllPresets() {
    const slots = [1,2,3,4];
    const data = {};
    for (const s of slots) {
      const raw = localStorage.getItem(PRESET_KEY(s));
      if (raw) data[s] = JSON.parse(raw);
    }
    return { version: 1, exportedAt: new Date().toISOString(), data };
  }
  function loadAllPresets(obj) {
    if (!obj || !obj.data) throw new Error('不正なファイルです');
    for (const s of Object.keys(obj.data)) {
      localStorage.setItem(PRESET_KEY(s), JSON.stringify(obj.data[s]));
    }
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }
  function wireExportImportButtons() {
    const btnExport = $('#btnExport');
    const btnImport = $('#btnImport');
    const inputFile = $('#importFile');

    bindTap(btnExport, () => {
      const payload = dumpAllPresets();
      downloadText('obikyo-presets.json', JSON.stringify(payload, null, 2));
    });
    bindTap(btnImport, () => inputFile && inputFile.click());
    inputFile?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        loadAllPresets(obj);
        alert('インポート完了：カスタム1〜4に読み込みました。');
      } catch (err) {
        console.error(err);
        alert('インポートに失敗しました。ファイルを確認してください。');
      } finally {
        inputFile.value = '';
      }
    });
  }

  // ========= 入力行 =========
  let cutRowCount = 0;
  function addCutInput(length = "", qty = "") {
    if (cutRowCount >= 30) return;
    const row = document.createElement('div');
    row.className = 'cut-input';
    row.innerHTML = `
      <input type="number" class="length" placeholder="長さ" aria-label="長さ(mm)" value="${length}">
      <input type="number" class="qty" placeholder="個数" aria-label="個数(本)" value="${qty}">
    `;
    $('#cutInputs').appendChild(row);
    cutRowCount++;
  }
  function resetCuts() {
    $('#cutInputs').innerHTML = '';
    cutRowCount = 0;
    $('#result').textContent = '';
  }

  // ========= 演算ロジック =========
  function alertError(msg){ try { alert(msg); } catch(e){} vibrate(240); }

  function buildCutsForCalc(tolerance){
    const cuts=[];
    const lengths=$$('#cutInputs .length');
    const qtys=$$('#cutInputs .qty');
    for(let i=0;i<lengths.length;i++){
      const target=Number(lengths[i].value);
      const qty=Number(qtys[i].value);
      if(!target||!qty) continue;
      const input=r1(target-Number(tolerance)); // 機械設定
      for(let j=0;j<qty;j++) cuts.push({target:r1(target), input});
    }
    return cuts;
  }

  function statsFromCuts(cuts,kerf){
    const map=new Map(); let totalCuts=0,totalUsage=0;
    for(const c of cuts){ map.set(c.target,(map.get(c.target)||0)+1); totalCuts++; totalUsage+=r1(c.target+kerf); }
    return {countByTarget:map,totalCuts,totalUsage};
  }

  function assignBoardsDescending(cuts,stockLength,stockCount,grip,kerf){
    const boards=Array.from({length:stockCount},(_,i)=>({id:i+1,cuts:[],used:0}));
    let remaining=cuts.slice().sort((a,b)=>b.target-a.target);
    const CANDIDATE_LIMIT=60, NODE_LIMIT=20000;
    for(const board of boards){
      if(remaining.length===0) break;
      const capacity=r1(stockLength-grip);
      const pool=remaining.slice(0,Math.min(CANDIDATE_LIMIT,remaining.length));
      let bestPlan=[],bestUsed=0,nodes=0;
      (function dfs(idx,used,chosen){
        if(++nodes>NODE_LIMIT) return;
        if(used>bestUsed){bestUsed=used;bestPlan=chosen.slice();}
        for(let i=idx;i<pool.length;i++){
          const c=pool[i], need=r1(c.target+kerf);
          if(used+need>capacity) continue;
          chosen.push(c); dfs(i+1,r1(used+need),chosen); chosen.pop();
        }
      })(0,0,[]);
      board.cuts=bestPlan;
      board.used=bestPlan.reduce((s,c)=>r1(s+c.target+kerf),0);
      const set=new Set(bestPlan);
      remaining=remaining.filter(x=>!set.has(x));
    }
    return {boards,remaining};
  }

  function gapFill(boards,remaining,stockLength,grip,kerf){
    remaining.sort((a,b)=>a.target-b.target);
    for(const board of boards){
      let cap=r1((stockLength-grip)-board.used); if(cap<=0) continue;
      for(let i=0;i<remaining.length && cap>0;){
        const c=remaining[i], need=r1(c.target+kerf);
        if(need<=cap+1e-9){ board.cuts.push(c); board.used=r1(board.used+need); cap=r1(cap-need); remaining.splice(i,1); }
        else break;
      }
      const capMax=r1(stockLength-grip); if(board.used>capMax) board.used=capMax;
    }
    return remaining;
  }

  function tallyCuts(cuts){
    const map=new Map();
    for(const c of cuts){
      const key=`${c.input}->${c.target}`;
      if(!map.has(key)) map.set(key,{input:c.input,target:c.target,count:0,meta:c.meta||''});
      map.get(key).count++;
    }
    return Array.from(map.values()).sort((a,b)=>a.target-b.target||a.input-b.input);
  }

  function compressIds(ids){
    ids.sort((a,b)=>a-b); const ranges=[]; let s=ids[0],p=ids[0];
    for(let i=1;i<ids.length;i++){ const c=ids[i]; if(c===p+1){p=c;continue;} ranges.push(s===p?`${s}`:`${s}〜${p}`); s=p=c; }
    ranges.push(s===p?`${s}`:`${s}〜${p}`); return ranges.join(',');
  }

  function renderOutput(boards,shortageMap,stockLength,grip,audit){
    const SL=Number(stockLength), GR=Number(grip);
    const sigMap=new Map();
    for(const b of boards){
      if(!b?.cuts?.length) continue;
      const tally=tallyCuts(b.cuts);
      const rEx=Math.max(0, r1((SL-GR)-b.used));
      const rIn=Math.max(0, r1(SL-b.used));
      const sig=JSON.stringify({tally,rEx:+rEx.toFixed(3),rIn:+rIn.toFixed(3)});
      if(!sigMap.has(sig)) sigMap.set(sig,{ids:[],tally,rEx,rIn});
      sigMap.get(sig).ids.push(b.id);
    }

    let totalRemain=0, rowsHtml='';
    for(const {ids,tally,rEx,rIn} of Array.from(sigMap.values()).sort((a,b)=>a.ids[0]-b.ids[0])){
      totalRemain += rIn * ids.length;
      const group=`部材${compressIds(ids)}`;
      const remainCell=`<td class="num" rowspan="${tally.length}">${rIn.toFixed(1)}</td><td class="num" rowspan="${tally.length}">${rEx.toFixed(1)}</td>`;
      tally.forEach((row,i)=>{
        const inp=Number(row.input).toFixed(1);
        const tgt=Number(row.target).toFixed(1);
        const qty=row.count;
        const usedLen=(Number(row.target)*qty).toFixed(1);
        const kerfSum=(qty*Number($('#kerf').value)).toFixed(1);
        rowsHtml += `<tr>
          ${i===0?`<td class="group-head" rowspan="${tally.length}">${group}</td>`:``}
          <td class="num">${tgt}${row.meta==='URAMODE' ? ' <span class="subtle">(捨て切り)</span>' : ''}</td>
          <td class="num y">${inp}</td>
          <td class="num y">${qty}</td>
          ${i===0?remainCell:``}
          <td class="num">${usedLen}</td>
          <td class="num subtle">${kerfSum}</td>
        </tr>`;
      });
    }

    const tableHtml = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>部材</th><th class="num">実長</th><th class="num">機械設定</th><th class="num">本数</th>
              <th class="num">余り</th><th class="num">有効残長</th><th class="num">実使用長</th><th class="num">削れ合計</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="8" class="subtle">切断結果がありません</td></tr>`}</tbody>
        </table>
      </div>`;

    const keys=[...shortageMap.keys()].sort((a,b)=>a-b);
    let below = `<div style="margin-top:8px">合計余り（掴みしろ含む・全材）：<b>${totalRemain.toFixed(1)} mm</b></div>`;
    if(keys.length>0){
      below += `<div style="margin-top:6px"><b class="danger">切断不足：</b>` +
               keys.map(k=>` <span class="danger">${Number(k).toFixed(1)}mm × ${shortageMap.get(k)}本</span>`).join(' / ') + `</div>`;
      alertError('切断不足があります。入力や条件をご確認ください。');
    }else{
      below += `<div style="margin-top:6px"><b>切断不足：</b>なし</div>`;
    }
    below += `<div style="margin-top:8px" class="subtle">
      --- 監査 ---　要求 ${audit.demandUsage.toFixed(1)}mm ／ 容量 ${audit.totalCapacity.toFixed(1)}mm ／ 実割当 ${audit.assignedUsage.toFixed(1)}mm ／ 不足発生 ${audit.demandUsage>audit.totalCapacity?'はい':'いいえ'}
    </div>`;
    $('#result').innerHTML = tableHtml + below;
  }

  function applyUraMode(boards, stockLength, grip, kerf, tolerance, spareTarget){
    if(!(spareTarget>0) || spareTarget<=grip) return;
    const MIN_EFFECTIVE = 50;
    for(const b of boards){
      const rIn = r1(stockLength - b.used);
      const rEx = r1((stockLength - grip) - b.used);
      const diff = r1(rIn - spareTarget);
      if(rEx >= MIN_EFFECTIVE && diff > kerf + 1e-9){
        const dropActual = r1(diff - kerf);
        if(dropActual>0){
          const dropInput = r1(dropActual - tolerance);
          b.cuts.push({target: dropActual, input: dropInput, meta:'URAMODE'});
          b.used = r1(b.used + dropActual + kerf);
        }
      }
    }
  }

  function run(secret=false){
    try{
      const stockLength = r1(Number($('#stockLength').value));
      const stockCount  = Math.trunc(Number($('#stockCount').value));
      const grip        = r1(Number($('#grip').value));
      const kerf        = r1(Number($('#kerf').value));
      const tolerance   = r1(Number($('#tolerance').value));
      const spareTarget = $('#spareTarget').value===''? null : r1(Number($('#spareTarget').value));
      $('#result').textContent='';

      const cuts=buildCutsForCalc(tolerance);
      if(cuts.length===0 || stockCount<=0 || stockLength<=0){
        $('#result').textContent='入力が不足しています。'; return;
      }
      const demand=statsFromCuts(cuts,kerf);
      const totalCapacity=r1((stockLength-grip)*stockCount);

      let {boards,remaining}=assignBoardsDescending(cuts,stockLength,stockCount,grip,kerf);
      remaining=gapFill(boards,remaining,stockLength,grip,kerf);

      if(secret){ applyUraMode(boards, stockLength, grip, kerf, tolerance, spareTarget); }

      const assignedCutsArray=boards.flatMap(b=>b.cuts);
      const assigned=statsFromCuts(assignedCutsArray,kerf);

      const shortageMap=new Map();
      for(const c of remaining) shortageMap.set(c.target,(shortageMap.get(c.target)||0)+1);
      if(shortageMap.size===0){
        for(const [t,need] of demand.countByTarget.entries()){
          const done=assigned.countByTarget.get(t)||0;
          if(done<need) shortageMap.set(t,need-done);
        }
      }
      const audit={ demandUsage:demand.totalUsage, totalCapacity, assignedUsage:assigned.totalUsage };
      renderOutput(boards,shortageMap,stockLength,grip,audit);
    }catch(err){
      console.error('run() failed:', err);
      alertError('演算中にエラーが発生しました。入力を確認してください。');
    }
  }

  // ========= イベント配線 =========
  function wire() {
    // 操作ボタン（tap/click対応）
    bindTap($('#btnAdd'),   () => addCutInput());
    bindTap($('#btnReset'), () => resetCuts());
    bindTap($('#btnCalc'),  () => run(false));
    bindTap($('#btnUra'),   () => run(true));

    // プリセット（4枠）
    $$('.btn-preset').forEach(bindLongPressPreset);

    // エクスポート/インポート
    wireExportImportButtons();

    // 初期行（3行）
    for (let i = 0; i < 3; i++) addCutInput();
  }

  document.addEventListener('DOMContentLoaded', wire);

  // ====== 互換のためグローバル公開（他の古いHTMLからも呼べるように） ======
  window.addCutInput = addCutInput;
  window.resetCuts   = resetCuts;
  window.run         = run;
})();
