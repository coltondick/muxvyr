/**
 * Configuration Page Frontend
 *
 * Returns self-contained HTML for the configuration page with
 * dark glassmorphism theme, chip-based multi-selects, and inline JS.
 *
 * @module frontend/configure
 */

export interface ConfigPageData {
  uuid: string;
  ai_provider: string;
  masked_api_key: string;
  languages: string[];
  has_nuvio_credentials: boolean;
  nuvio_profile_id?: number;
  nuvio_profiles?: Array<{ profile_index: number; name: string }>;
  fine_tuning_params: string | null;
  country_filter: string[];
  genre_exclusions: string[];
  genre_preferences: string[];
}

/**
 * Returns the complete HTML string for the configuration page.
 *
 * @param configData - Existing config data for pre-filling (null for new config)
 * @param uuid - The user's UUID (empty string for new config)
 * @returns Complete HTML page string
 */
export function getConfigureHtml(configData: ConfigPageData | null, uuid: string): string {
  const configJson = configData ? JSON.stringify(configData) : "null";
  const safeUuid = uuid ? escapeHtml(uuid) : "";

  return CONFIGURE_HTML
    .replace("__CONFIG_DATA__", configJson)
    .replace(/__UUID__/g, safeUuid);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const CONFIGURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Configure - AI Recommendations</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f23;color:#e2e8f0;line-height:1.6;min-height:100vh;}
.app-bar{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:20px 24px;border-bottom:1px solid rgba(99,102,241,0.2);text-align:center;}
.app-bar h1{font-size:1.4rem;font-weight:600;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.container{max-width:820px;margin:0 auto;padding:24px 16px 48px;}
.banner{display:none;padding:16px 20px;border-radius:12px;margin-bottom:20px;font-size:0.9rem;align-items:center;gap:12px;}
.banner-success{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#86efac;}
.banner-error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;}
.banner .copy-btn{margin-left:auto;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.8rem;white-space:nowrap;}
.banner .copy-btn:hover{background:rgba(255,255,255,0.2);}
.card{background:rgba(30,30,60,0.6);backdrop-filter:blur(20px);border:1px solid rgba(99,102,241,0.15);border-radius:16px;padding:28px;margin-bottom:20px;}
.card-title{font-size:1.1rem;font-weight:600;margin-bottom:20px;color:#c7d2fe;}
.form-group{margin-bottom:22px;}
.form-label{display:block;font-size:0.85rem;font-weight:500;color:#a5b4fc;margin-bottom:8px;}
.radio-group{display:flex;gap:10px;flex-wrap:wrap;}
.radio-pill{position:relative;}
.radio-pill input{position:absolute;opacity:0;pointer-events:none;}
.radio-pill label{display:inline-block;padding:8px 20px;border-radius:20px;border:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.05);color:#a5b4fc;cursor:pointer;font-size:0.85rem;font-weight:500;transition:all 0.2s ease;}
.radio-pill input:checked+label{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-color:transparent;box-shadow:0 4px 15px rgba(99,102,241,0.3);}
.radio-pill label:hover{border-color:rgba(99,102,241,0.6);background:rgba(99,102,241,0.1);}
.text-input{width:100%;padding:12px 16px;background:rgba(15,15,35,0.8);border:1px solid rgba(99,102,241,0.2);border-radius:12px;color:#e2e8f0;font-size:0.9rem;transition:border-color 0.2s ease,box-shadow 0.2s ease;outline:none;}
.text-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.15);}
.text-input::placeholder{color:#64748b;}
textarea.text-input{resize:vertical;min-height:80px;}
.multi-select{position:relative;}
.multi-select-display{min-height:44px;padding:8px 12px;background:rgba(15,15,35,0.8);border:1px solid rgba(99,102,241,0.2);border-radius:12px;cursor:pointer;display:flex;flex-wrap:wrap;gap:6px;align-items:center;transition:border-color 0.2s ease,box-shadow 0.2s ease;}
.multi-select-display:hover{border-color:rgba(99,102,241,0.4);}
.multi-select-display.open{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.15);}
.ms-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2));border:1px solid rgba(99,102,241,0.3);border-radius:16px;font-size:0.78rem;color:#c7d2fe;}
.ms-chip .remove{cursor:pointer;opacity:0.7;font-size:0.9rem;}
.ms-chip .remove:hover{opacity:1;}
.ms-placeholder{color:#64748b;font-size:0.85rem;}
.multi-select-dropdown{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1e1e3c;border:1px solid rgba(99,102,241,0.3);border-radius:12px;max-height:200px;overflow-y:auto;z-index:100;box-shadow:0 8px 32px rgba(0,0,0,0.4);padding:6px;}
.multi-select-dropdown .ms-option{padding:8px 12px;border-radius:8px;cursor:pointer;font-size:0.85rem;color:#cbd5e1;transition:background 0.15s ease;display:flex;align-items:center;gap:8px;}
.multi-select-dropdown .ms-option:hover{background:rgba(99,102,241,0.15);}
.multi-select-dropdown .ms-option.selected{background:rgba(99,102,241,0.2);color:#a5b4fc;}
.multi-select-dropdown .ms-option.selected::before{content:'\\2713';font-size:0.75rem;color:#818cf8;}
.nuvio-section{background:rgba(124,58,237,0.05);border:1px solid rgba(124,58,237,0.2);border-radius:12px;padding:20px;margin-top:4px;}
.nuvio-section .form-label{color:#c4b5fd;}
.nuvio-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;}
.nuvio-row .text-input{flex:1;min-width:140px;}
.nuvio-btn{padding:10px 20px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:12px;font-size:0.85rem;font-weight:500;cursor:pointer;transition:all 0.2s ease;white-space:nowrap;}
.nuvio-btn:hover{box-shadow:0 4px 15px rgba(124,58,237,0.4);transform:translateY(-1px);}
.nuvio-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;box-shadow:none;}
.nuvio-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:20px;color:#86efac;font-size:0.8rem;font-weight:500;margin-top:10px;}
.nuvio-badge::before{content:'\\2713';font-weight:700;}
.profile-select{margin-top:14px;}
.profile-select select{padding:10px 14px;background:rgba(15,15,35,0.8);border:1px solid rgba(124,58,237,0.3);border-radius:10px;color:#e2e8f0;font-size:0.85rem;outline:none;cursor:pointer;}
.profile-select select:focus{border-color:#7c3aed;}
.optional-header{display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0;user-select:none;}
.optional-header:hover .card-title{color:#a5b4fc;}
.chevron{font-size:1.2rem;color:#a5b4fc;transition:transform 0.3s ease;}
.chevron.rotated{transform:rotate(180deg);}
.optional-content{display:none;}
.submit-btn{width:100%;padding:14px 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:14px;font-size:1rem;font-weight:600;cursor:pointer;transition:all 0.2s ease;margin-top:8px;}
.submit-btn:hover{box-shadow:0 6px 24px rgba(99,102,241,0.4);transform:translateY(-2px);}
.submit-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;box-shadow:none;}
.masked-info{font-size:0.78rem;color:#64748b;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
@media(max-width:600px){.container{padding:16px 12px 40px;}.card{padding:20px;}.nuvio-row{flex-direction:column;}.nuvio-row .text-input{min-width:100%;}}
</style>
</head>
<body>
<div class="app-bar"><h1>AI Recommendations &mdash; Configure</h1></div>
<div class="container">
<div class="banner banner-error" id="errorBanner"><span id="errorMsg"></span></div>
<form id="configForm" autocomplete="off">
<div class="card">
<div class="card-title">Required Settings</div>
<div class="form-group">
<div class="form-label">AI Provider</div>
<div class="radio-group">
<div class="radio-pill"><input type="radio" name="ai_provider" id="provGemini" value="gemini" checked><label for="provGemini">Gemini</label></div>
<div class="radio-pill"><input type="radio" name="ai_provider" id="provOpenai" value="openai"><label for="provOpenai">OpenAI</label></div>
<div class="radio-pill"><input type="radio" name="ai_provider" id="provGrok" value="grok"><label for="provGrok">Grok</label></div>
</div>
</div>
<div class="form-group">
<label class="form-label" for="apiKey">API Key</label>
<input type="password" id="apiKey" class="text-input" placeholder="Enter your API key">
<div class="masked-info" id="maskedInfo" style="display:none;"></div>
</div>
<div class="form-group">
<div class="form-label">Languages</div>
<div class="multi-select" id="ms-languages" data-options="English,Spanish,French,German,Italian,Portuguese,Japanese,Korean,Chinese,Hindi,Arabic,Russian,Dutch,Swedish,Polish,Turkish"></div>
</div>
<div class="form-group">
<div class="form-label">Nuvio Account</div>
<div class="nuvio-section">
<div id="nuvioConnect">
<div class="nuvio-row">
<input type="text" class="text-input" id="nuvioEmail" placeholder="Nuvio email">
<input type="password" class="text-input" id="nuvioPassword" placeholder="Password">
<button type="button" class="nuvio-btn" id="nuvioVerifyBtn" onclick="verifyNuvio()">Verify &amp; Connect</button>
</div>
</div>
<div id="nuvioConnected" style="display:none;">
<div class="nuvio-badge">Nuvio Connected</div>
<div class="profile-select">
<label class="form-label" for="nuvioProfile">Profile</label>
<select id="nuvioProfile">
<option value="1">Profile 1</option>
<option value="2">Profile 2</option>
<option value="3">Profile 3</option>
<option value="4">Profile 4</option>
<option value="5">Profile 5</option>
<option value="6">Profile 6</option>
</select>
</div>
</div>
</div>
</div>
</div>
<div class="card">
<div class="optional-header" id="optionalHeader">
<div class="card-title" style="margin-bottom:0;">Optional Settings</div>
<span class="chevron" id="chevron">&#9660;</span>
</div>
<div class="optional-content" id="optionalContent">
<div class="form-group" style="margin-top:18px;">
<label class="form-label" for="fineTuning">Fine-tuning Parameters</label>
<textarea id="fineTuning" class="text-input" placeholder="Custom instructions for the AI (e.g., prefer newer releases, avoid remakes)"></textarea>
</div>
<div class="form-group">
<div class="form-label">Country Filter</div>
<div class="multi-select" id="ms-country_filter" data-options="US,CA,AU,NZ,GB,IE,DE,FR,ES,IT,JP,KR,IN"></div>
</div>
<div class="form-group">
<div class="form-label">Genre Exclusions</div>
<div class="multi-select" id="ms-genre_exclusions" data-options="action,adventure,animation,comedy,crime,documentary,drama,fantasy,horror,mystery,romance,sci-fi,thriller,western"></div>
</div>
<div class="form-group">
<div class="form-label">Genre Preferences</div>
<div class="multi-select" id="ms-genre_preferences" data-options="action,adventure,animation,comedy,crime,documentary,drama,fantasy,horror,mystery,romance,sci-fi,thriller,western"></div>
</div>
</div>
</div>
<button type="submit" class="submit-btn" id="submitBtn">Save Configuration</button>
<div id="saveSuccess" style="display:none;margin-top:12px;padding:12px 16px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:10px;color:#86efac;font-size:0.9rem;font-weight:500;text-align:center;">&#10003; Configuration saved successfully</div>
</form>
<div id="addonSection" style="display:none;margin-top:24px;">
<div class="card" style="border-color:rgba(99,102,241,0.3);">
<a id="installBtn" href="#" style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#818cf8,#a78bfa);color:#fff;border-radius:14px;font-size:1rem;font-weight:600;text-decoration:none;transition:all 0.2s ease;margin-bottom:12px;">&#9654; Install to Stremio</a>
<button type="button" id="copyAddonBtn" onclick="copyAddonUrl()" style="display:block;width:100%;padding:12px 24px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;border-radius:14px;font-size:0.9rem;font-weight:500;cursor:pointer;transition:all 0.2s ease;margin-bottom:20px;">&#128203; Copy Addon URL</button>
<div style="font-size:0.75rem;font-weight:600;color:#a5b4fc;letter-spacing:0.5px;margin-bottom:8px;">MANIFEST URL</div>
<div style="background:rgba(15,15,35,0.8);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:14px;">
<code id="manifestUrlDisplay" style="font-size:0.85rem;color:#94a3b8;font-family:'Fira Code',Consolas,monospace;word-break:break-all;"></code>
</div>
</div>
</div>
</div>
<script>
(function(){
var configData = __CONFIG_DATA__;
var currentUuid = "__UUID__";
window._nuvioVerified = false;
window._nuvioEmail = "";
window._nuvioPassword = "";

// --- Multi-select initialization ---
function initMultiSelect(container) {
  var options = container.getAttribute("data-options").split(",");
  var selected = [];
  var id = container.id;

  // Create display
  var display = document.createElement("div");
  display.className = "multi-select-display";
  container.appendChild(display);

  // Create dropdown
  var dropdown = document.createElement("div");
  dropdown.className = "multi-select-dropdown";
  container.appendChild(dropdown);

  // Build options
  options.forEach(function(opt) {
    var el = document.createElement("div");
    el.className = "ms-option";
    el.textContent = opt;
    el.setAttribute("data-value", opt);
    el.addEventListener("click", function(e) {
      e.stopPropagation();
      var idx = selected.indexOf(opt);
      if (idx === -1) {
        selected.push(opt);
      } else {
        selected.splice(idx, 1);
      }
      renderDropdown();
      renderDisplay();
    });
    dropdown.appendChild(el);
  });

  // Display click toggles dropdown
  display.addEventListener("click", function(e) {
    e.stopPropagation();
    var isOpen = dropdown.style.display === "block";
    closeAllDropdowns();
    if (!isOpen) {
      dropdown.style.display = "block";
      display.classList.add("open");
    }
  });

  function renderDisplay() {
    display.innerHTML = "";
    if (selected.length === 0) {
      var ph = document.createElement("span");
      ph.className = "ms-placeholder";
      ph.textContent = "Click to select...";
      display.appendChild(ph);
    } else {
      selected.forEach(function(val) {
        var chip = document.createElement("span");
        chip.className = "ms-chip";
        chip.innerHTML = val + ' <span class="remove" data-val="' + val + '">&times;</span>';
        chip.querySelector(".remove").addEventListener("click", function(ev) {
          ev.stopPropagation();
          var i = selected.indexOf(val);
          if (i !== -1) selected.splice(i, 1);
          renderDisplay();
          renderDropdown();
        });
        display.appendChild(chip);
      });
    }
  }

  function renderDropdown() {
    var opts = dropdown.querySelectorAll(".ms-option");
    opts.forEach(function(el) {
      var v = el.getAttribute("data-value");
      if (selected.indexOf(v) !== -1) {
        el.classList.add("selected");
      } else {
        el.classList.remove("selected");
      }
    });
  }

  // Expose methods
  container._getSelected = function() { return selected.slice(); };
  container._setSelected = function(vals) {
    selected = vals.filter(function(v) { return options.indexOf(v) !== -1; });
    renderDisplay();
    renderDropdown();
  };

  renderDisplay();
}

function closeAllDropdowns() {
  document.querySelectorAll(".multi-select-dropdown").forEach(function(dd) {
    dd.style.display = "none";
  });
  document.querySelectorAll(".multi-select-display").forEach(function(d) {
    d.classList.remove("open");
  });
}

// Close dropdowns on outside click
document.addEventListener("click", function() {
  closeAllDropdowns();
});

// Init all multi-selects
document.querySelectorAll(".multi-select").forEach(function(ms) {
  initMultiSelect(ms);
});

// --- Optional section toggle ---
var optionalHeader = document.getElementById("optionalHeader");
var optionalContent = document.getElementById("optionalContent");
var chevron = document.getElementById("chevron");

optionalHeader.addEventListener("click", function() {
  if (optionalContent.style.display === "none" || optionalContent.style.display === "") {
    optionalContent.style.display = "block";
    chevron.classList.add("rotated");
  } else {
    optionalContent.style.display = "none";
    chevron.classList.remove("rotated");
  }
});

// --- Pre-fill from config data ---
if (configData) {
  // AI Provider
  var providerRadio = document.querySelector('input[name="ai_provider"][value="' + configData.ai_provider + '"]');
  if (providerRadio) providerRadio.checked = true;

  // Masked API key info
  if (configData.masked_api_key) {
    document.getElementById("apiKey").placeholder = "Leave blank to keep current key";
    document.getElementById("apiKey").value = "";
    document.getElementById("maskedInfo").style.display = "block";
    document.getElementById("maskedInfo").textContent = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + configData.masked_api_key.slice(-4);
  }

  // Languages
  if (configData.languages && configData.languages.length > 0) {
    document.getElementById("ms-languages")._setSelected(configData.languages);
  }

  // Nuvio
  if (configData.has_nuvio_credentials) {
    document.getElementById("nuvioConnect").style.display = "none";
    document.getElementById("nuvioConnected").style.display = "block";
    window._nuvioVerified = true;
    // Populate profile selector with real names
    if (configData.nuvio_profiles && configData.nuvio_profiles.length > 0) {
      var select = document.getElementById("nuvioProfile");
      select.innerHTML = "";
      configData.nuvio_profiles.forEach(function(p) {
        var opt = document.createElement("option");
        opt.value = String(p.profile_index);
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    }
    if (configData.nuvio_profile_id) {
      document.getElementById("nuvioProfile").value = String(configData.nuvio_profile_id);
    }
  }

  // Optional fields
  if (configData.fine_tuning_params) {
    document.getElementById("fineTuning").value = configData.fine_tuning_params;
  }
  if (configData.country_filter && configData.country_filter.length > 0) {
    document.getElementById("ms-country_filter")._setSelected(configData.country_filter);
  }
  if (configData.genre_exclusions && configData.genre_exclusions.length > 0) {
    document.getElementById("ms-genre_exclusions")._setSelected(configData.genre_exclusions);
  }
  if (configData.genre_preferences && configData.genre_preferences.length > 0) {
    document.getElementById("ms-genre_preferences")._setSelected(configData.genre_preferences);
  }

  // Show addon section for existing configs
  if (currentUuid) {
    showAddonSection(currentUuid);
  }
}

// --- Nuvio Verification ---
window.verifyNuvio = function() {
  var email = document.getElementById("nuvioEmail").value.trim();
  var password = document.getElementById("nuvioPassword").value;
  if (!email || !password) {
    showError("Please enter Nuvio email and password.");
    return;
  }
  var btn = document.getElementById("nuvioVerifyBtn");
  btn.disabled = true;
  btn.textContent = "Verifying...";

  fetch("/api/verify-nuvio", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email: email, password: password})
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.verified) {
      window._nuvioVerified = true;
      window._nuvioEmail = email;
      window._nuvioPassword = password;
      document.getElementById("nuvioConnect").style.display = "none";
      document.getElementById("nuvioConnected").style.display = "block";
      // Populate profile selector with actual names from Nuvio
      if (data.profiles && data.profiles.length > 0) {
        var select = document.getElementById("nuvioProfile");
        select.innerHTML = "";
        data.profiles.forEach(function(p) {
          var opt = document.createElement("option");
          opt.value = String(p.profile_index);
          opt.textContent = p.name;
          select.appendChild(opt);
        });
      }
    } else {
      showError(data.message || "Nuvio verification failed.");
      btn.disabled = false;
      btn.textContent = "Verify & Connect";
    }
  })
  .catch(function() {
    showError("Network error verifying Nuvio credentials.");
    btn.disabled = false;
    btn.textContent = "Verify & Connect";
  });
};

// --- Copy manifest URL ---
window.copyManifest = function() {
  copyAddonUrl();
};

// --- Addon section ---
var _addonUrl = "";

function showAddonSection(uuid) {
  var manifestUrl = location.origin + "/" + uuid + "/manifest.json";
  _addonUrl = manifestUrl;
  document.getElementById("addonSection").style.display = "block";
  document.getElementById("installBtn").href = "stremio:///" + encodeURIComponent(manifestUrl);
  document.getElementById("manifestUrlDisplay").textContent = manifestUrl;
}

window.copyAddonUrl = function() {
  if (_addonUrl && navigator.clipboard) {
    navigator.clipboard.writeText(_addonUrl);
    document.getElementById("copyAddonBtn").textContent = "\u2713 Copied!";
    setTimeout(function() { document.getElementById("copyAddonBtn").innerHTML = "&#128203; Copy Addon URL"; }, 2000);
  }
};

// --- Form submission ---
document.getElementById("configForm").addEventListener("submit", function(e) {
  e.preventDefault();
  hideMessages();

  var provider = document.querySelector('input[name="ai_provider"]:checked').value;
  var apiKey = document.getElementById("apiKey").value;
  var languages = document.getElementById("ms-languages")._getSelected();
  var profileId = parseInt(document.getElementById("nuvioProfile").value, 10);

  // Validation
  if (!configData && !apiKey) {
    showError("API Key is required.");
    return;
  }
  if (languages.length === 0) {
    showError("Please select at least one language.");
    return;
  }
  if (!window._nuvioVerified) {
    showError("Please verify your Nuvio account before saving.");
    return;
  }

  var payload = {
    ai_provider: provider,
    api_key: apiKey || undefined,
    languages: languages,
    nuvio_credentials: JSON.stringify({
      email: window._nuvioEmail || "",
      password: window._nuvioPassword || "",
      profile_id: profileId
    }),
    fine_tuning_params: document.getElementById("fineTuning").value || undefined,
    country_filter: document.getElementById("ms-country_filter")._getSelected(),
    genre_exclusions: document.getElementById("ms-genre_exclusions")._getSelected(),
    genre_preferences: document.getElementById("ms-genre_preferences")._getSelected()
  };

  // Clean empty arrays
  if (payload.country_filter.length === 0) delete payload.country_filter;
  if (payload.genre_exclusions.length === 0) delete payload.genre_exclusions;
  if (payload.genre_preferences.length === 0) delete payload.genre_preferences;

  var submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  var endpoint = currentUuid ? "/" + currentUuid + "/configure" : "/configure";
  var method = "POST";

  fetch(endpoint, {
    method: method,
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  })
  .then(function(res) { return res.json().then(function(d) { return {status: res.status, data: d}; }); })
  .then(function(result) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save Configuration";
    if (result.status >= 200 && result.status < 300) {
      var theUuid = result.data.uuid || currentUuid;
      currentUuid = theUuid;
      // Mark as existing config so subsequent saves use update path
      if (!configData) configData = {};
      configData.uuid = theUuid;
      document.getElementById("saveSuccess").style.display = "block";
      showAddonSection(theUuid);
    } else {
      var msg = result.data.error || result.data.message || "Save failed.";
      if (result.data.fields) {
        msg += " " + Object.values(result.data.fields).join(", ");
      }
      showError(msg);
    }
  })
  .catch(function() {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save Configuration";
    showError("Network error. Please try again.");
  });
});

function showError(msg) {
  document.getElementById("errorMsg").textContent = msg;
  document.getElementById("errorBanner").style.display = "flex";
}

function hideMessages() {
  document.getElementById("errorBanner").style.display = "none";
  var ss = document.getElementById("saveSuccess");
  if (ss) ss.style.display = "none";
}

})();
</script>
</body>
</html>`;
