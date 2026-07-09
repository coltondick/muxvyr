/**
 * Admin Panel Handler
 *
 * @module handlers/admin
 */

import type { Context } from "hono";
import { pregenerateCatalogs } from "../services/catalog-pregenerate.js";
import { getCatalog, invalidateUser, scanKeys } from "../services/cache.js";
import { getConfiguration, listConfigurations, deleteConfiguration } from "../services/configuration.js";
import { decrypt, importKey } from "../services/encryption.js";
import { fetchWatchHistory } from "../services/nuvio-sync.js";
import { getAdminPassword, getEncryptionKey } from "../lib/config.js";

const ADMIN_PASSWORD_FALLBACK = "xFRcPRzSje5HOKPtb8cUsFjOnL4I4Be6";

function checkAuth(c: Context): Response | null {
  const expected = getAdminPassword() || ADMIN_PASSWORD_FALLBACK;
  if (c.req.header("X-Admin-Password") !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export async function handleAdminPage(c: Context): Promise<Response> {
  return c.html(getAdminHtml());
}

export async function handleAdminListUsers(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;

  try {
    const users = await listConfigurations();
    const safeUsers = users.map((u) => ({
      uuid: u.uuid,
      ai_provider: u.ai_provider,
      languages: u.languages,
      country_filter: u.country_filter,
      genre_exclusions: u.genre_exclusions,
      genre_preferences: u.genre_preferences,
      fine_tuning_params: u.fine_tuning_params,
      created_at: u.created_at,
      updated_at: u.updated_at,
    }));
    return c.json(safeUsers);
  } catch {
    return c.json({ error: "Failed to fetch users" }, 500);
  }
}

export async function handleAdminGetRecommendations(c: Context): Promise<Response> {
  const authErr = checkAuth(c);
  if (authErr) return authErr;

  const uuid = c.req.param("uuid") ?? "";
  const movieCatalog = await getCatalog(uuid, "ai-recommendations-movie") || [];
  const seriesCatalog = await getCatalog(uuid, "ai-recommendations-series") || [];

  const bywCatalogs: Record<string, unknown[]> = {};
  try {
    const keys = await scanKeys(`catalog:${uuid}:byw-*`);
    for (const key of keys) {
      const catalogId = key.replace(`catalog:${uuid}:`, "");
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
    return c.json({ error: error instanceof Error ? error.message : "Failed to fetch watch history" }, 500);
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

  try {
    await deleteConfiguration(uuid);
  } catch {
    return c.json({ error: "Failed to delete user" }, 500);
  }

  try { await invalidateUser(uuid); } catch { /* non-fatal */ }

  return c.json({ success: true, message: "User deleted" });
}

function getAdminHtml(): string {
  return ADMIN_HTML;
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Admin - AI Recommendations</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0f0f23;color:#e2e8f0;min-height:100vh;}
.container{max-width:1400px;margin:0 auto;padding:24px 20px;}
h1{font-size:1.6rem;font-weight:700;margin-bottom:24px;color:#e2e8f0;display:flex;align-items:center;gap:10px;}
h1 span{color:#6366f1;}
h3{color:#a5b4fc;margin:16px 0 10px;font-size:1.05rem;font-weight:600;}
h4{color:#a5b4fc;margin:14px 0 8px;font-size:0.9rem;font-weight:600;letter-spacing:0.02em;}
.login-card{background:rgba(30,30,60,0.5);backdrop-filter:blur(12px);border:1px solid rgba(99,102,241,0.15);border-radius:16px;padding:32px;max-width:400px;margin:60px auto;}
.login-card h2{color:#a5b4fc;font-size:1.2rem;margin-bottom:20px;text-align:center;}
.login-card .input-group{display:flex;flex-direction:column;gap:12px;}
.login-card input{width:100%;padding:12px 16px;background:rgba(15,15,35,0.8);border:1px solid rgba(99,102,241,0.25);border-radius:10px;color:#e2e8f0;font-size:0.95rem;outline:none;}
.login-card input:focus{border-color:#6366f1;}
.btn{padding:10px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:0.85rem;font-weight:600;}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(99,102,241,0.3);}
.btn-full{width:100%;}
.btn-sm{padding:6px 12px;font-size:0.75rem;border-radius:8px;}
.btn-danger{background:linear-gradient(135deg,#ef4444,#dc2626);}
.btn-success{background:linear-gradient(135deg,#22c55e,#16a34a);}
.btn-outline{background:none;border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;}
.table-wrap{overflow-x:auto;border-radius:12px;border:1px solid rgba(99,102,241,0.12);background:rgba(30,30,60,0.4);}
table{width:100%;border-collapse:collapse;}
th,td{padding:12px 14px;text-align:left;font-size:0.82rem;white-space:nowrap;}
th{color:#a5b4fc;font-weight:600;background:rgba(99,102,241,0.06);border-bottom:1px solid rgba(99,102,241,0.15);}
td{border-bottom:1px solid rgba(99,102,241,0.06);}
.actions{display:flex;gap:6px;flex-wrap:wrap;}
.card{background:rgba(30,30,60,0.5);border:1px solid rgba(99,102,241,0.15);border-radius:14px;padding:20px;margin:20px 0;}
.item{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04);align-items:center;}
.item img{width:40px;height:60px;object-fit:cover;border-radius:6px;}
.item .t{font-size:0.85rem;font-weight:500;}
.item .m{font-size:0.72rem;color:#94a3b8;margin-top:2px;}
.byw-group{margin:10px 0;padding:12px;background:rgba(124,58,237,0.04);border:1px solid rgba(124,58,237,0.1);border-radius:10px;}
.byw-group .byw-title{font-size:0.8rem;font-weight:600;color:#c4b5fd;margin-bottom:8px;}
#status{margin:12px 0;padding:10px 16px;border-radius:10px;display:none;font-size:0.84rem;}
#status.ok{display:block;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);color:#86efac;}
#status.err{display:block;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#fca5a5;}
.empty{color:#64748b;font-size:0.82rem;padding:12px 0;font-style:italic;}
.tabs{display:flex;gap:4px;margin-bottom:16px;background:rgba(15,15,35,0.5);padding:4px;border-radius:10px;width:fit-content;}
.tab{padding:8px 18px;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:500;color:#94a3b8;border:none;background:none;}
.tab.active{background:rgba(99,102,241,0.2);color:#a5b4fc;font-weight:600;}
.loading{display:flex;align-items:center;gap:8px;padding:16px;color:#94a3b8;font-size:0.85rem;}
</style>
</head>
<body>
<div class="container">
<h1><span>&#9881;</span> Admin Panel</h1>
<div id="login-section">
<div class="login-card"><h2>Authentication Required</h2><div class="input-group"><input type="password" id="pw" placeholder="Enter admin password"><button class="btn btn-full" onclick="login()">Login</button></div></div>
</div>
<div id="status"></div>
<div id="main" style="display:none;"></div>
<div id="user-panel"></div>
</div>
<script>
var P='';
function login(){P=document.getElementById('pw').value;if(!P){st('Please enter a password','err');return;}loadUsers();}
document.getElementById('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login();});
function st(m,t){var s=document.getElementById('status');s.textContent=m;s.className=t;if(t==='ok')setTimeout(function(){s.style.display='none';},5000);}
function api(path,opts){return fetch(path,Object.assign({headers:{'X-Admin-Password':P}},opts||{})).then(function(r){return r.json();}).catch(function(){return{error:'Network error'};});}
function loadUsers(){api('/admin/api/users').then(function(d){if(d.error){st(d.error,'err');return;}document.getElementById('login-section').style.display='none';document.getElementById('main').style.display='block';var h='<div class="table-wrap"><table><thead><tr><th>UUID</th><th>Provider</th><th>Languages</th><th>Countries</th><th>Updated</th><th>Actions</th></tr></thead><tbody>';d.forEach(function(u){h+='<tr><td>'+u.uuid.substring(0,8)+'\\u2026</td><td>'+(u.ai_provider||'\\u2014')+'</td><td>'+((u.languages||[]).join(', ')||'\\u2014')+'</td><td>'+((u.country_filter||[]).join(', ')||'\\u2014')+'</td><td>'+new Date(u.updated_at).toLocaleDateString()+'</td><td><div class="actions"><button class="btn btn-sm btn-outline" onclick="viewUser(\\''+u.uuid+'\\')">View</button><button class="btn btn-sm btn-success" onclick="refreshUser(\\''+u.uuid+'\\')">Refresh</button><button class="btn btn-sm btn-danger" onclick="deleteUser(\\''+u.uuid+'\\')">Delete</button></div></td></tr>';});h+='</tbody></table></div>';document.getElementById('main').innerHTML=h;st('Loaded '+d.length+' users','ok');});}
function viewUser(uuid){var panel=document.getElementById('user-panel');panel.innerHTML='<div class="card"><h3>User: '+uuid.substring(0,8)+'\\u2026</h3><div class="tabs"><button class="tab active" onclick="loadRecs(\\''+uuid+'\\')">Recommendations</button><button class="tab" onclick="loadHistory(\\''+uuid+'\\')">Watch History</button></div><div id="detail-content"><div class="loading">Loading...</div></div></div>';loadRecs(uuid);}
function loadRecs(uuid){var el=document.getElementById('detail-content');el.innerHTML='<div class="loading">Loading...</div>';api('/admin/api/recommendations/'+uuid).then(function(d){if(d.error){el.innerHTML='<div class="empty">Error: '+d.error+'</div>';return;}var h='<h4>Movies ('+d.catalogs.movie.length+')</h4>'+renderItems(d.catalogs.movie)+'<h4>Series ('+d.catalogs.series.length+')</h4>'+renderItems(d.catalogs.series);var bk=Object.keys(d.catalogs.byw||{});if(bk.length>0){h+='<h4>BYW ('+bk.length+')</h4>';bk.forEach(function(k){h+='<div class="byw-group"><div class="byw-title">'+k+' ('+d.catalogs.byw[k].length+')</div>'+renderItems(d.catalogs.byw[k])+'</div>';});}el.innerHTML=h;});}
function loadHistory(uuid){var el=document.getElementById('detail-content');el.innerHTML='<div class="loading">Loading...</div>';api('/admin/api/watch-history/'+uuid).then(function(d){if(d.error){el.innerHTML='<div class="empty">Error: '+d.error+'</div>';return;}if(!d.watchHistory||d.watchHistory.length===0){el.innerHTML='<div class="empty">No watch history</div>';return;}var h='<h4>Watch History ('+d.watchHistory.length+')</h4>';d.watchHistory.forEach(function(w){h+='<div class="item"><div><span class="t">'+esc(w.title)+'</span><br><span class="m">'+(w.type||'')+' - '+(w.imdb_id||'')+'</span></div></div>';});el.innerHTML=h;});}
function renderItems(items){if(!items||items.length===0)return'<div class="empty">No items</div>';var h='';items.forEach(function(m){h+='<div class="item">'+(m.poster?'<img src="'+esc(m.poster)+'" loading="lazy">':'')+'<div><span class="t">'+esc(m.name||'')+'</span><br><span class="m">'+(m.id||'')+(m.releaseInfo?' - '+m.releaseInfo:'')+'</span></div></div>';});return h;}
function refreshUser(uuid){st('Refreshing...','ok');api('/admin/api/refresh/'+uuid,{method:'POST'}).then(function(d){st(d.success?'Done':'Error: '+d.message,d.success?'ok':'err');});}
function deleteUser(uuid){if(!confirm('Delete user '+uuid+'?'))return;api('/admin/api/delete/'+uuid,{method:'DELETE'}).then(function(d){st(d.success?'Deleted':'Error: '+d.message,d.success?'ok':'err');if(d.success)loadUsers();});}
function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
</script>
</body>
</html>`;
