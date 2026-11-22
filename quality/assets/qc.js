/* BCT Quality Control — shared client (Supabase BCT_HUB 프로젝트)
   publishable key는 브라우저에 두도록 설계된 공개 키입니다. 데이터 보호는 RLS(로그인 사용자만)로 합니다. */
const QC_CONFIG = {
  SUPABASE_URL: 'https://xvwmmwgevyvuqskudvst.supabase.co',
  SUPABASE_KEY: 'sb_publishable_YwuQ7HuxRB8IKZfrJv-I-w_JDRobdDC',
  BUCKET: 'qc-files',
};
const QC_NAV = [
  { key:'home',        label:'QC Home',   href:'./index.html' },
  { key:'instruments', label:'계측기 관리', href:'./instruments.html' },
  { key:'env',         label:'온습도 관리', href:'./env.html' },
  { key:'5s',          label:'3정5S',     href:'./5s.html' },
  { key:'workers',     label:'작업자 인증', href:'./workers.html' },
  { key:'kpi',         label:'품질 지표',   href:'./kpi.html' },
  { key:'docs',        label:'문서 관리',   href:'./documents.html' },
];

const QC = (() => {
  const sb = window.supabase.createClient(QC_CONFIG.SUPABASE_URL, QC_CONFIG.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bct-hub-auth' }
  });
  const S = { user:null, profile:null };

  const esc = v => v == null ? '' : String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const todayKST = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
  const fmtDate = d => d ? String(d).slice(0,10) : '';
  const icon = {
    plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    x:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    print:'<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/></svg>',
    dl:'<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
    cam:'<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    edit:'<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  };

  /* ---------- toast ---------- */
  let tt;
  function toast(msg, err){
    let el = document.querySelector('.toast');
    if(!el){ el = document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.toggle('err', !!err); el.classList.add('show');
    clearTimeout(tt); tt = setTimeout(()=>el.classList.remove('show'), err ? 4200 : 2400);
  }

  /* ---------- files ---------- */
  // './…' 또는 http(s) = 정적 파일, 그 외 = Storage(qc-files) 경로 → 서명 URL(1시간)
  const urlCache = new Map();
  async function fileUrl(path){
    if(!path) return null;
    if(/^(\.\/|https?:)/.test(path)) return path;
    const c = urlCache.get(path);
    if(c && c.exp > Date.now()) return c.url;
    const { data, error } = await sb.storage.from(QC_CONFIG.BUCKET).createSignedUrl(path, 3600);
    if(error) return null;
    urlCache.set(path, { url:data.signedUrl, exp:Date.now() + 3500e3 });
    return data.signedUrl;
  }
  // 사진은 업로드 전에 긴 변 1600px JPEG로 줄여 저장 용량을 아낍니다.
  async function shrinkImage(file, max=1600, q=.82){
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file).catch(()=>null);
    if(!bmp) return file;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width*k); cv.height = Math.round(bmp.height*k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/,'.jpg'), {type:'image/jpeg'}) : file;
  }
  async function upload(file, folder){
    const f = await shrinkImage(file);
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await sb.storage.from(QC_CONFIG.BUCKET).upload(path, f, { contentType:f.type, upsert:false });
    if(error) throw error;
    return path;
  }

  /* ---------- shell ---------- */
  function renderTop(active){
    const top = document.createElement('header');
    top.className = 'qc-top no-print';
    top.innerHTML = `<div class="in">
      <a class="qc-brand" href="../hub.html" title="BCT Business Hub"><img src="https://raw.githubusercontent.com/bctechsemi/bct/refs/heads/main/images/bct_logo_transparent.png" alt="BCT"><span>QUALITY</span></a>
      <nav class="qc-nav">${QC_NAV.map(n=>`<a href="${n.href}" class="${n.key===active?'on':''} ${n.soon?'soon':''}">${n.label}</a>`).join('')}</nav>
      <div class="qc-user"><span class="nm"><b id="qcName"></b></span><span class="role hidden" id="qcRole">ADMIN</span><button type="button" id="qcOut">LOGOUT</button></div>
    </div>`;
    document.body.prepend(top);
    top.querySelector('#qcOut').onclick = logout;
  }
  function fillUser(){
    const n = document.getElementById('qcName');
    if(n) n.textContent = (S.profile && S.profile.name) || (S.user && S.user.email) || '';
    const r = document.getElementById('qcRole');
    if(r) r.classList.toggle('hidden', !isAdmin());
  }
  const isAdmin = () => !!(S.profile && S.profile.role === 'admin');

  // 서버 세션이 이미 만료된 경우 signOut()이 오류를 내며 저장된 세션을 남기므로, 저장값을 직접 지운 뒤 Hub로 이동합니다.
  async function logout(){
    try{ await sb.auth.signOut({ scope:'local' }); }catch(_){}
    try{ localStorage.removeItem('bct-hub-auth'); localStorage.removeItem('bct-hub-auth-code-verifier'); }catch(_){}
    location.replace('../hub.html');
  }

  async function loadProfile(){
    const { data } = await sb.from('profiles').select('id,email,name,role').eq('id', S.user.id).maybeSingle();
    S.profile = data;
  }

  /** 페이지 시작: 상단바 → 로그인 확인 → onReady() */
  async function init(active, onReady){
    renderTop(active);
    // 로그인은 Business Hub(hub.html)에서 한 번만 합니다. 같은 storageKey를 쓰므로 Hub 세션을 그대로 사용합니다.
    const { data:{ session } } = await sb.auth.getSession();
    if(!session){ location.replace('../hub.html'); return; }
    S.user = session.user;
    await loadProfile();
    fillUser();
    sb.auth.onAuthStateChange((ev) => { if(ev === 'SIGNED_OUT') location.replace('../hub.html'); });
    await onReady();
  }

  function csv(rows, filename){
    const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
    const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();}, 500);
  }

  function lightbox(src){
    const d = document.createElement('div'); d.className='lightbox'; d.innerHTML = `<img src="${esc(src)}" alt="">`;
    d.onclick = () => d.remove(); document.body.appendChild(d);
  }

  /* ---------- 공통 모달 폼 ---------- */
  let modalEl, onSubmit;
  function ensureModal(){
    if(modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.className = 'modal';
    modalEl.innerHTML = `<form class="mbox" novalidate>
      <div class="mh"><h3></h3><button class="x" type="button" data-close aria-label="닫기">${icon.x}</button></div>
      <div class="mb"></div>
      <div class="mf"><span class="ferr"></span><button class="btn danger hidden" type="button" data-extra></button><button class="btn" type="button" data-close>취소</button><button class="btn pri" type="submit">저장</button></div>
    </form>`;
    document.body.appendChild(modalEl);
    const f = modalEl.querySelector('form');
    modalEl.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && modalEl.classList.contains('show')) closeModal(); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const ok = f.querySelector('[type=submit]'), err = f.querySelector('.ferr');
      const bad = [...f.querySelectorAll('[required]')].find(i => !i.value.trim());
      if(bad){ err.textContent = (bad.dataset.label || '필수 항목') + '을(를) 입력하세요'; bad.focus(); return; }
      ok.disabled = true; err.textContent = '';
      try{ await onSubmit(new FormData(f), f); closeModal(); }
      catch(x){ err.textContent = x.message || String(x); }
      finally{ ok.disabled = false; }
    });
    return modalEl;
  }
  /** openModal(title, html, submit(fd, form), {ok, extra:{label, run}}) */
  function openModal(title, html, submit, opt={}){
    const m = ensureModal(), f = m.querySelector('form');
    m.querySelector('h3').textContent = title;
    m.querySelector('.mb').innerHTML = html;
    m.querySelector('.ferr').textContent = '';
    const ok = f.querySelector('[type=submit]'); ok.textContent = opt.ok || '저장'; ok.disabled = false;
    const ex = f.querySelector('[data-extra]');
    ex.classList.toggle('hidden', !opt.extra);
    if(opt.extra){ ex.textContent = opt.extra.label; ex.onclick = async () => { try{ if(await opt.extra.run() !== false) closeModal(); }catch(x){ f.querySelector('.ferr').textContent = x.message; } }; }
    onSubmit = submit; m.classList.add('show');
    setTimeout(() => { const i = f.querySelector('.mb input:not([type=file]):not([type=hidden]),.mb select'); i && i.focus(); }, 60);
    return f;
  }
  function closeModal(){ modalEl && modalEl.classList.remove('show'); }
  const fld = (name, label, val, opt={}) => `<div class="f ${opt.full?'full':''}"><label>${label}${opt.req?'<em>*</em>':''}</label>
    ${opt.options ? `<select name="${name}" ${opt.attr||''}>${(Array.isArray(opt.options)?opt.options:Object.entries(opt.options)).map(([v,t])=>`<option value="${esc(v)}" ${String(val??'')===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select>`
    : opt.area ? `<textarea name="${name}" ${opt.req?`required data-label="${label}"`:''} ${opt.attr||''}>${esc(val)}</textarea>`
    : `<input name="${name}" type="${opt.type||'text'}" value="${esc(val)}" ${opt.req?`required data-label="${label}"`:''} ${opt.attr||''}>`}
    ${opt.hint?`<div class="hint">${opt.hint}</div>`:''}</div>`;
  const nz = v => { v = (v ?? '').toString().trim(); return v === '' ? null : v; };

  /* ---------- 날짜/시간 (KST) ---------- */
  const fmtKST = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const fmtDT = d => d ? fmtKST.format(new Date(d)) : '';
  const hmKST = d => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(d));
  const dateKST = d => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(d));
  // datetime-local 입력값(KST 기준) ↔ ISO
  const toLocalInput = d => { const s = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(d)); return s.replace(' ','T'); };
  const fromLocalInput = v => new Date(v + ':00+09:00').toISOString();

  return { sb, S, init, isAdmin, esc, todayKST, fmtDate, icon, toast, fileUrl, upload, csv, lightbox,
           openModal, closeModal, fld, nz, fmtDT, hmKST, dateKST, toLocalInput, fromLocalInput, CONFIG:QC_CONFIG };
})();
