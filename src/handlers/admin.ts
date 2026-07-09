/**
 * Admin Panel Handler
 *
 * @module handlers/admin
 */

import type { Context } from "hono";
import { pregenerateCatalogs, regenerateAllCatalogs } from "../services/catalog-pregenerate.js";
import { getCatalog, invalidateUser, scanKeys } from "../services/cache.js";
import { getConfiguration, listConfigurations, deleteConfiguration } from "../services/configuration.js";
import { decrypt, importKey } from "../services/encryption.js";
import { fetchWatchHistory } from "../services/nuvio-sync.js";
import { getAdminPassword, getEncryptionKey } from "../lib/config.js";
import { query } from "../lib/db.js";
import { catalogQueue } from "../lib/queue.js";

function checkAuth(c: Context): Response | null {
  const expected = getAdminPassword();
  if (c.req.header("X-Admin-Password") !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export async function handleAdminPage(c: Context): Promise<Response> {
  return c.html(ADMIN_HTML);
}

export async function handleAdminListUsers(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  try {
    const users = await listConfigurations();
    return c.json(users.map((u) => ({
      uuid: u.uuid, ai_provider: u.ai_provider, languages: u.languages,
      country_filter: u.country_filter, genre_exclusions: u.genre_exclusions,
      genre_preferences: u.genre_preferences, fine_tuning_params: u.fine_tuning_params,
      created_at: u.created_at, updated_at: u.updated_at,
    })));
  } catch { return c.json({ error: "Failed to fetch users" }, 500); }
}

export async function handleAdminGetRecommendations(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  const uuid = c.req.param("uuid") ?? "";
  const movieCatalog = await getCatalog(uuid, "ai-recommendations-movie") || [];
  const seriesCatalog = await getCatalog(uuid, "ai-recommendations-series") || [];
  const bywCatalogs: Record<string, unknown[]> = {};
  try {
    const keys = await scanKeys("catalog:" + uuid + ":byw-*");
    for (const key of keys) {
      const catalogId = key.replace("catalog:" + uuid + ":", "");
      const data = await getCatalog(uuid, catalogId);
      if (data) bywCatalogs[catalogId] = data;
    }
  } catch { /* non-fatal */ }
  return c.json({ uuid, catalogs: { movie: movieCatalog, series: seriesCatalog, byw: bywCatalogs } });
}

export async function handleAdminGetWatchHistory(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  const uuid = c.req.param("uuid") ?? "";
  try {
    const config = await getConfiguration(uuid);
    if (!config) return c.json({ error: "User not found" }, 404);
    const cryptoKey = importKey(getEncryptionKey());
    const nuvioCredentials = decrypt(config.nuvio_credentials, config.nuvio_credentials_iv, cryptoKey);
    const watchHistory = await fetchWatchHistory(nuvioCredentials, uuid);
    return c.json({ uuid, watchHistory });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed" }, 500);
  }
}

export async function handleAdminForceRefresh(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  const uuid = c.req.param("uuid") ?? "";
  try {
    await pregenerateCatalogs(uuid);
    return c.json({ success: true, message: "Recommendations regenerated" });
  } catch (error) {
    return c.json({ success: false, message: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
}

export async function handleAdminDeleteUser(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  const uuid = c.req.param("uuid") ?? "";
  try { await deleteConfiguration(uuid); } catch { return c.json({ error: "Failed to delete" }, 500); }
  try { await invalidateUser(uuid); } catch { /* non-fatal */ }
  return c.json({ success: true, message: "User deleted" });
}

/**
 * POST /admin/api/regenerate-all — triggers regeneration for all users.
 */
export async function handleAdminRegenerateAll(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  try {
    // Run in background, don't await
    regenerateAllCatalogs().catch(() => {});
    return c.json({ success: true, message: "Regeneration triggered for all users" });
  } catch {
    return c.json({ error: "Failed to trigger regeneration" }, 500);
  }
}

/**
 * GET /admin/api/queue-status — returns BullMQ queue counts.
 */
export async function handleAdminQueueStatus(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      catalogQueue.getWaitingCount(),
      catalogQueue.getActiveCount(),
      catalogQueue.getCompletedCount(),
      catalogQueue.getFailedCount(),
    ]);
    return c.json({ waiting, active, completed, failed });
  } catch {
    return c.json({ error: "Failed to fetch queue status" }, 500);
  }
}

/**
 * GET /admin/api/logs/:uuid — returns recent generation logs for a user.
 */
export async function handleAdminUserLogs(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  const uuid = c.req.param("uuid") ?? "";
  try {
    const result = await query(
      `SELECT * FROM generation_logs WHERE user_uuid = $1 ORDER BY created_at DESC LIMIT 50`,
      [uuid]
    );
    return c.json(result.rows);
  } catch {
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
}

/**
 * GET /admin/api/logs — returns recent generation logs for all users.
 */
export async function handleAdminAllLogs(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;
  try {
    const result = await query(
      `SELECT * FROM generation_logs ORDER BY created_at DESC LIMIT 50`
    );
    return c.json(result.rows);
  } catch {
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Admin - Muxvyr AI</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#0a0a1a;color:#e2e8f0;min-height:100vh}
.wrap{max-width:1400px;margin:0 auto;padding:24px 20px}
h1{font-size:1.5rem;font-weight:700;margin-bottom:24px;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
h3{color:#a5b4fc;font-size:1rem;font-weight:600;margin:16px 0 10px}
h4{color:#c4b5fd;font-size:0.88rem;font-weight:600;margin:14px 0 8px}
.login{max-width:380px;margin:80px auto;background:rgba(25,25,50,0.7);backdrop-filter:blur(16px);border:1px solid rgba(99,102,241,0.15);border-radius:20px;padding:36px;text-align:center}
.login h2{color:#a5b4fc;margin-bottom:20px;font-size:1.1rem}
.login input{width:100%;padding:12px 16px;background:rgba(10,10,26,0.8);border:1px solid rgba(99,102,241,0.25);border-radius:10px;color:#e2e8f0;font-size:0.9rem;outline:none;margin-bottom:12px}
.login input:focus{border-color:#6366f1}
.btn{padding:10px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:0.84rem;font-weight:600;transition:all 0.2s}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(99,102,241,0.3)}
.btn-full{width:100%}
.btn-sm{padding:5px 10px;font-size:0.72rem;border-radius:7px}
.btn-red{background:linear-gradient(135deg,#ef4444,#dc2626)}
.btn-green{background:linear-gradient(135deg,#22c55e,#16a34a)}
.btn-ghost{background:none;border:1px solid rgba(99,102,241,0.3);color:#a5b4fc}
.btn-icon{background:none;border:1px solid rgba(99,102,241,0.25);cursor:pointer;font-size:0.8rem;padding:6px 10px;border-radius:8px;transition:all 0.2s;color:#a5b4fc;display:inline-flex;align-items:center;gap:4px}
.btn-icon:hover{background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.4)}
.btn-icon svg{width:14px;height:14px;fill:currentColor}
.tbl-wrap{overflow-x:auto;border-radius:12px;border:1px solid rgba(99,102,241,0.1);background:rgba(20,20,45,0.5);backdrop-filter:blur(8px)}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 12px;text-align:left;font-size:0.8rem;white-space:nowrap}
th{color:#a5b4fc;font-weight:600;background:rgba(99,102,241,0.05);border-bottom:1px solid rgba(99,102,241,0.12)}
td{border-bottom:1px solid rgba(99,102,241,0.05)}
tr:hover td{background:rgba(99,102,241,0.03)}
.mono{font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:#94a3b8}
.actions{display:flex;gap:5px;flex-wrap:wrap}
.card{background:rgba(20,20,45,0.6);backdrop-filter:blur(12px);border:1px solid rgba(99,102,241,0.12);border-radius:14px;padding:20px;margin:16px 0}
.card-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.tabs{display:flex;gap:3px;background:rgba(10,10,26,0.6);padding:3px;border-radius:9px;width:fit-content}
.tab{padding:7px 16px;border-radius:7px;cursor:pointer;font-size:0.78rem;font-weight:500;color:#94a3b8;transition:all 0.2s;border:none;background:none}
.tab:hover{color:#e2e8f0}
.tab.on{background:rgba(99,102,241,0.2);color:#a5b4fc}
.item{display:flex;gap:10px;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,0.03);align-items:center;border-radius:6px}
.item:hover{background:rgba(99,102,241,0.03)}
.item:last-child{border-bottom:none}
.item img{width:38px;height:56px;object-fit:cover;border-radius:5px;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
.item .ph{width:38px;height:56px;border-radius:5px;background:rgba(99,102,241,0.08);display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#64748b;flex-shrink:0}
.item .t{font-size:0.82rem;font-weight:500}
.item .m{font-size:0.7rem;color:#94a3b8;margin-top:1px}
.byw-box{margin:8px 0;padding:12px;background:rgba(124,58,237,0.04);border:1px solid rgba(124,58,237,0.1);border-radius:10px}
.byw-box .byw-hdr{font-size:0.78rem;font-weight:600;color:#c4b5fd;margin-bottom:6px}
.empty{color:#64748b;font-size:0.8rem;padding:8px 0;font-style:italic}
.toast{position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:10px;font-size:0.84rem;font-weight:500;z-index:2000;opacity:0;transform:translateY(-10px);transition:all 0.3s;pointer-events:none}
.toast.show{opacity:1;transform:translateY(0)}
.toast.ok{background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#86efac}
.toast.err{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;visibility:hidden;transition:all 0.25s}
.overlay.show{opacity:1;visibility:visible}
.modal{background:rgba(20,20,50,0.97);backdrop-filter:blur(16px);border:1px solid rgba(99,102,241,0.2);border-radius:20px;padding:32px;max-width:420px;width:90%;transform:scale(0.92);transition:transform 0.25s;box-shadow:0 24px 64px rgba(0,0,0,0.5)}
.overlay.show .modal{transform:scale(1)}
.modal h2{color:#fca5a5;font-size:1.15rem;margin-bottom:10px}
.modal p{color:#94a3b8;font-size:0.86rem;line-height:1.5;margin-bottom:20px}
.modal .uuid-box{font-family:monospace;font-size:0.72rem;color:#94a3b8;background:rgba(10,10,26,0.6);padding:8px 12px;border-radius:8px;margin-bottom:20px;word-break:break-all}
.modal .btns{display:flex;gap:10px;justify-content:flex-end}
.loading{color:#94a3b8;font-size:0.82rem;padding:12px 0;display:flex;align-items:center;gap:8px}
.loading::before{content:'';width:14px;height:14px;border:2px solid rgba(99,102,241,0.3);border-top-color:#6366f1;border-radius:50%;animation:spin 0.7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.queue-status{display:inline-flex;gap:12px;font-size:0.75rem;color:#94a3b8;margin-left:12px}
.queue-status span{display:inline-flex;align-items:center;gap:4px}
.queue-status .dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.queue-status .dot-w{background:#f59e0b}
.queue-status .dot-a{background:#22c55e}
.log-item{padding:8px 10px;border-bottom:1px solid rgba(99,102,241,0.05);font-size:0.78rem}
.log-item .log-type{color:#a5b4fc;font-weight:600}
.log-item .log-time{color:#64748b;font-size:0.7rem}
.log-item .log-err{color:#fca5a5;font-size:0.72rem}
@media(max-width:768px){.wrap{padding:16px 12px}th,td{padding:7px 8px;font-size:0.72rem}.actions{flex-direction:column;gap:3px}}
</style>
</head>
<body>
<div class="wrap">
<h1>Muxvyr Admin</h1>
<div id="login-view">
<div class="login"><h2>Admin Login</h2><input type="password" id="pw" placeholder="Password" autocomplete="current-password"><button class="btn btn-full" onclick="login()">Login</button></div>
</div>
<div id="app" style="display:none"></div>
<div id="panel"></div>
</div>
<div class="overlay" id="del-overlay" onclick="if(event.target===this)closeModal()">
<div class="modal">
<h2>Delete User</h2>
<p>This will permanently remove the user configuration and all cached recommendations. This cannot be undone.</p>
<div class="uuid-box" id="del-uuid"></div>
<div class="btns"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-red" id="del-confirm">Delete</button></div>
</div>
</div>
<div class="toast" id="toast"></div>
<script>
var P='',delUuid='';
document.getElementById('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login()});
function login(){P=document.getElementById('pw').value;if(!P)return;loadUsers()}
function toast(m,t){var el=document.getElementById('toast');el.textContent=m;el.className='toast show '+t;setTimeout(function(){el.className='toast'},4000)}
function api(p,o){return fetch(p,Object.assign({headers:{'X-Admin-Password':P}},o||{})).then(function(r){return r.json()}).catch(function(){return{error:'Network error'}})}

function loadUsers(){
api('/admin/api/users').then(function(d){
if(d.error){toast(d.error,'err');return}
document.getElementById('login-view').style.display='none';
document.getElementById('app').style.display='block';
var h='<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><button class="btn btn-green" onclick="regenerateAll()">Regenerate All Users</button><div class="queue-status" id="queue-status"></div></div>';
h+='<div class="tbl-wrap"><table><thead><tr><th>UUID</th><th>Provider</th><th>Languages</th><th>Countries</th><th>Updated</th><th>Actions</th></tr></thead><tbody>';
d.forEach(function(u){
h+='<tr><td><span class="mono">'+u.uuid.slice(0,8)+'\\u2026</span></td><td>'+u.ai_provider+'</td><td>'+((u.languages||[]).join(', ')||'\\u2014')+'</td><td>'+((u.country_filter||[]).join(', ')||'\\u2014')+'</td><td>'+new Date(u.updated_at).toLocaleDateString()+'</td><td><div class="actions"><button class="btn btn-sm btn-ghost" onclick="viewUser(\\''+u.uuid+'\\')">View</button><button class="btn btn-sm btn-green" onclick="refresh(\\''+u.uuid+'\\')">Refresh</button><button class="btn btn-sm btn-red" onclick="openDel(\\''+u.uuid+'\\')">Delete</button></div></td></tr>';
});
h+='</tbody></table></div>';
document.getElementById('app').innerHTML=h;
toast('Loaded '+d.length+' user(s)','ok');
loadQueueStatus();
})
}

function loadQueueStatus(){
api('/admin/api/queue-status').then(function(d){
if(d.error)return;
var el=document.getElementById('queue-status');
if(el)el.innerHTML='<span><span class="dot dot-w"></span>Waiting: '+d.waiting+'</span><span><span class="dot dot-a"></span>Active: '+d.active+'</span><span>Done: '+d.completed+'</span><span>Failed: '+d.failed+'</span>';
})
}

function regenerateAll(){toast('Triggering regeneration for all users\\u2026','ok');api('/admin/api/regenerate-all',{method:'POST'}).then(function(d){toast(d.success?'Regeneration triggered!':'Error: '+(d.message||d.error),d.success?'ok':'err')})}

function openDel(uuid){delUuid=uuid;document.getElementById('del-uuid').textContent=uuid;document.getElementById('del-overlay').classList.add('show');document.getElementById('del-confirm').onclick=function(){confirmDel()}}
function closeModal(){document.getElementById('del-overlay').classList.remove('show');delUuid=''}
function confirmDel(){if(!delUuid)return;closeModal();toast('Deleting\\u2026','ok');api('/admin/api/delete/'+delUuid,{method:'DELETE'}).then(function(d){toast(d.success?'Deleted':'Error: '+(d.message||d.error),d.success?'ok':'err');if(d.success){loadUsers();document.getElementById('panel').innerHTML=''}})}

function viewUser(uuid){
var p=document.getElementById('panel');
p.innerHTML='<div class="card"><div class="card-hdr"><h3>'+uuid.slice(0,8)+'\\u2026</h3><div style="display:flex;gap:8px;align-items:center"><button class="btn-icon" title="Refresh panel" onclick="viewUser(\\''+uuid+'\\')"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>Refresh</button><button class="btn btn-sm btn-green" onclick="refresh(\\''+uuid+'\\')">Regenerate All</button><button class="btn btn-sm btn-ghost" onclick="clearCache(\\''+uuid+'\\')">Clear Cache</button><button class="btn btn-sm btn-ghost" onclick="copyUuid(\\''+uuid+'\\')">Copy UUID</button></div></div><div class="tabs"><button class="tab on" onclick="switchTab(this,\\'recs\\',\\''+uuid+'\\')">Catalogs</button><button class="tab" onclick="switchTab(this,\\'history\\',\\''+uuid+'\\')">Watch History</button><button class="tab" onclick="switchTab(this,\\'logs\\',\\''+uuid+'\\')">Logs</button><button class="tab" onclick="switchTab(this,\\'config\\',\\''+uuid+'\\')">Config</button></div><div id="detail"><div class="loading">Loading\\u2026</div></div></div>';
loadRecs(uuid);
p.scrollIntoView({behavior:'smooth'});
}

function switchTab(el,tab,uuid){el.parentElement.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on')});el.classList.add('on');if(tab==='recs')loadRecs(uuid);else if(tab==='history')loadHistory(uuid);else if(tab==='logs')loadLogs(uuid);else loadConfig(uuid)}

function loadRecs(uuid){
var el=document.getElementById('detail');el.innerHTML='<div class="loading">Loading catalogs\\u2026</div>';
api('/admin/api/recommendations/'+uuid).then(function(d){
if(d.error){el.innerHTML='<div class="empty">'+d.error+'</div>';return}
var h='';
h+='<h4>\\ud83c\\udfac Movies ('+d.catalogs.movie.length+')</h4>';
h+=items(d.catalogs.movie);
h+='<h4>\\ud83d\\udcfa Series ('+d.catalogs.series.length+')</h4>';
h+=items(d.catalogs.series);
var bk=Object.keys(d.catalogs.byw||{});
if(bk.length>0){
h+='<h4>\\ud83d\\udd17 Because You Watched ('+bk.length+')</h4>';
bk.forEach(function(k){var arr=d.catalogs.byw[k];h+='<div class="byw-box"><div class="byw-hdr">'+esc(k)+' ('+arr.length+')</div>'+items(arr)+'</div>'});
}else{h+='<h4>\\ud83d\\udd17 Because You Watched</h4><div class="empty">No BYW catalogs cached yet</div>'}
el.innerHTML=h;
})}

function loadHistory(uuid){
var el=document.getElementById('detail');el.innerHTML='<div class="loading">Loading watch history\\u2026</div>';
api('/admin/api/watch-history/'+uuid).then(function(d){
if(d.error){el.innerHTML='<div class="empty" style="color:#fca5a5">'+d.error+'</div>';return}
if(!d.watchHistory||!d.watchHistory.length){el.innerHTML='<div class="empty">No watch history</div>';return}
var h='<h4>Watch History ('+d.watchHistory.length+')</h4>';
d.watchHistory.forEach(function(w){h+='<div class="item"><div class="ph">\\ud83c\\udfac</div><div><span class="t">'+esc(w.title||'?')+'</span><br><span class="m">'+w.type+' \\u2022 '+(w.imdb_id||'\\u2014')+' \\u2022 '+new Date(w.watched_at).toLocaleDateString()+'</span></div></div>'});
el.innerHTML=h;
})}

function loadLogs(uuid){
var el=document.getElementById('detail');el.innerHTML='<div class="loading">Loading generation logs\\u2026</div>';
api('/admin/api/logs/'+uuid).then(function(d){
if(d.error){el.innerHTML='<div class="empty" style="color:#fca5a5">'+d.error+'</div>';return}
if(!d||!d.length){el.innerHTML='<div class="empty">No generation logs yet</div>';return}
var h='<h4>Generation Logs ('+d.length+')</h4>';
d.forEach(function(l){
h+='<div class="log-item"><span class="log-type">'+esc(l.catalog_type)+'</span> '+(l.content_type||'')+' \\u2022 '+l.items_generated+' items \\u2022 '+(l.duration_ms||0)+'ms <span class="log-time">'+new Date(l.created_at).toLocaleString()+'</span>';
if(l.error)h+='<br><span class="log-err">\\u26a0 '+esc(l.error)+'</span>';
h+='</div>';
});
el.innerHTML=h;
})}

function items(arr){
if(!arr||!arr.length)return'<div class="empty">No items cached</div>';
var h='';arr.forEach(function(m){h+='<div class="item">'+(m.poster?'<img src="'+ea(m.poster)+'" loading="lazy">':'<div class="ph">\\ud83c\\udfac</div>')+'<div><span class="t">'+esc(m.name||'?')+'</span><br><span class="m">'+(m.id||'')+(m.releaseInfo?' \\u2022 '+m.releaseInfo:'')+'</span></div></div>'});
return h;
}

function refresh(uuid){toast('Regenerating all catalogs\\u2026','ok');api('/admin/api/refresh/'+uuid,{method:'POST'}).then(function(d){toast(d.success?'All catalogs regenerated!':'Error: '+(d.message||d.error),d.success?'ok':'err')})}

function clearCache(uuid){api('/admin/api/refresh/'+uuid,{method:'POST'}).then(function(){toast('Cache cleared & regenerated','ok')})}
function copyUuid(uuid){navigator.clipboard.writeText(uuid).then(function(){toast('UUID copied','ok')})}

function loadConfig(uuid){
var el=document.getElementById('detail');el.innerHTML='<div class="loading">Loading config\\u2026</div>';
api('/admin/api/users').then(function(users){
var u=users.find(function(x){return x.uuid===uuid});
if(!u){el.innerHTML='<div class="empty">Not found</div>';return}
var h='<h4>Configuration Details</h4>';
h+='<table style="font-size:0.8rem"><tr><td style="color:#a5b4fc;width:140px">UUID</td><td class="mono">'+u.uuid+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Provider</td><td>'+u.ai_provider+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Languages</td><td>'+((u.languages||[]).join(', ')||'\\u2014')+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Countries</td><td>'+((u.country_filter||[]).join(', ')||'\\u2014')+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Genre Exclusions</td><td>'+((u.genre_exclusions||[]).join(', ')||'\\u2014')+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Genre Preferences</td><td>'+((u.genre_preferences||[]).join(', ')||'\\u2014')+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Fine Tuning</td><td>'+(u.fine_tuning_params||'\\u2014')+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Created</td><td>'+new Date(u.created_at).toLocaleString()+'</td></tr>';
h+='<tr><td style="color:#a5b4fc">Updated</td><td>'+new Date(u.updated_at).toLocaleString()+'</td></tr></table>';
el.innerHTML=h;
})}

function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
function ea(s){return(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}
</script>
</body>
</html>`;
