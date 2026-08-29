
(function() {
  // ===== SUPABASE STORAGE: ОБЩИЕ ЛОГОТИПЫ, АВАТАРЫ И ВИДЕО =====
  const LTL_MEDIA_BUCKET = 'ltl-media';
  function ltlSupabaseConfig() {
    const cfg = window.LTL_SUPABASE_CONFIG || {};
    const url = (cfg.url || window.LTL_SUPABASE_URL || window.SUPABASE_URL || '').replace(/\/$/, '');
    const key = cfg.key || window.LTL_SUPABASE_PUBLISHABLE_KEY || window.LTL_SUPABASE_ANON_KEY || window.SUPABASE_PUBLISHABLE_KEY || window.SUPABASE_ANON_KEY || '';
    return { url, key };
  }
  function ltlHasSupabaseStorage() { const c = ltlSupabaseConfig(); return !!(c.url && c.key); }
  function ltlSafeFileName(name) { return String(name || 'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'file'; }
  function ltlStoragePublicUrl(path) { const c = ltlSupabaseConfig(); return c.url + '/storage/v1/object/public/' + LTL_MEDIA_BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'); }
  function ltlStoragePathFromUrl(url) {
    try {
      const marker = '/storage/v1/object/public/' + LTL_MEDIA_BUCKET + '/';
      const i = String(url || '').indexOf(marker);
      return i >= 0 ? decodeURIComponent(String(url).slice(i + marker.length)) : null;
    } catch(e) { return null; }
  }
  async function ltlUploadMedia(file, folder) {
    if (!ltlHasSupabaseStorage()) throw new Error('Supabase Storage не настроен. Проверьте URL и Publishable/anon key.');
    if (!file) throw new Error('Файл не выбран.');
    const c = ltlSupabaseConfig();
    const path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + ltlSafeFileName(file.name);
    const res = await fetch(c.url + '/storage/v1/object/' + LTL_MEDIA_BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), {
      method: 'POST',
      headers: { 'apikey': c.key, 'Authorization': 'Bearer ' + c.key, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': '31536000' },
      body: file
    });
    if (!res.ok) { let msg = ''; try { msg = await res.text(); } catch(_) {} throw new Error('Ошибка загрузки файла (' + res.status + '): ' + msg); }
    return { path, url: ltlStoragePublicUrl(path), size: file.size, type: file.type || 'application/octet-stream', name: file.name };
  }
  async function ltlDeleteMediaUrl(url) {
    const path = ltlStoragePathFromUrl(url);
    if (!path || !ltlHasSupabaseStorage()) return;
    const c = ltlSupabaseConfig();
    try { await fetch(c.url + '/storage/v1/object/' + LTL_MEDIA_BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE', headers: { 'apikey': c.key, 'Authorization': 'Bearer ' + c.key } }); } catch(e) { console.warn('Не удалось удалить файл из Storage:', e); }
  }
  function ltlMediaSource(src) { return src || ''; }
  async function ltlMigrateLegacyMedia() {
    if (!ltlHasSupabaseStorage()) return;
    try {
      let changed = false;
      const logo = localStorage.getItem('nexus_site_logo');
      if (logo && logo.indexOf('data:') === 0) {
        const m = logo.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          const bin = atob(m[2]); const arr = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
          const blob = new Blob([arr], {type:m[1]}); const ext = (m[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi,'');
          const uploaded = await ltlUploadMedia(new File([blob], 'site-logo.'+ext, {type:m[1]}), 'site');
          localStorage.setItem('nexus_site_logo', uploaded.url); changed = true;
        }
      }
      const teams = JSON.parse(localStorage.getItem('nexus_teams') || '[]');
      let teamsChanged = false;
      for (const team of teams) {
        if (team && team.avatar && String(team.avatar).indexOf('data:') === 0) {
          const m = String(team.avatar).match(/^data:([^;]+);base64,(.+)$/); if (!m) continue;
          const bin = atob(m[2]); const arr = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
          const blob = new Blob([arr], {type:m[1]}); const ext=(m[1].split('/')[1]||'png').replace(/[^a-z0-9]/gi,'');
          const uploaded=await ltlUploadMedia(new File([blob], 'team-logo.'+ext,{type:m[1]}), 'teams/'+ltlSafeFileName(team.id || team.name));
          team.avatar=uploaded.url; teamsChanged=true;
        }
      }
      if (teamsChanged) { localStorage.setItem('nexus_teams', JSON.stringify(teams)); changed=true; }
      const highlights = JSON.parse(localStorage.getItem('nexus_highlights') || '{}');
      let highlightsChanged=false;
      for (const key of Object.keys(highlights)) {
        const list = Array.isArray(highlights[key]) ? highlights[key] : [];
        for (const h of list) {
          if (h && h.video && String(h.video).indexOf('data:video/') === 0) {
            const m=String(h.video).match(/^data:([^;]+);base64,(.+)$/); if (!m) continue;
            const bin=atob(m[2]); const arr=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
            const blob=new Blob([arr],{type:m[1]}); const ext=(m[1].split('/')[1]||'mp4').replace(/[^a-z0-9]/gi,'');
            const uploaded=await ltlUploadMedia(new File([blob], 'highlight.'+ext,{type:m[1]}), 'highlights/'+ltlSafeFileName(key));
            h.video=uploaded.url; h.videoType=uploaded.type; h.videoSize=uploaded.size; highlightsChanged=true;
          }
        }
      }
      if (highlightsChanged) { localStorage.setItem('nexus_highlights', JSON.stringify(highlights)); changed=true; }
      if (changed && typeof forceRenderAll === 'function') forceRenderAll();
    } catch(e) { console.warn('Миграция старых медиа не завершена:', e); }
  }

  // ===== КЛЮЧИ ХРАНЕНИЯ =====
  const STORAGE_KEYS = {
    USERS: 'nexus_users',
    SESSION: 'nexus_session',
    THEME: 'nexus_theme',
    VIEW_MODE: 'nexus_view_mode',
    NEWS: 'nexus_news',
    MATCHES: 'nexus_matches',
    TEAMS: 'nexus_teams',
    PLAYERS: 'nexus_players',
    TOURNAMENTS: 'nexus_tournaments',
    KDA: 'nexus_kda',
    MATCH_GAMES: 'nexus_match_games',
    HIGHLIGHTS: 'nexus_highlights',
    SERVER_TEXT: 'nexus_server_text',
    ABOUT_TEXT: 'nexus_about_text',
    GLOBAL_STREAM: 'nexus_global_stream',
    SITE_TITLE: 'nexus_site_title',
    SITE_LOGO: 'nexus_site_logo',
    SUPPORT_MESSAGES: 'nexus_support_messages',
    AVATAR_PREFIX: 'nexus_avatar_',
    ONLINE: 'nexus_online',
    SEO_KEYWORDS: 'nexus_seo_keywords',
    SEO_DESCRIPTION: 'nexus_seo_description',
    ACCENT_COLOR: 'nexus_accent_color',
    // НОВЫЙ КЛЮЧ ДЛЯ ФАЙЛОВ
    FILES: 'nexus_files'
  };

  // Одноразовый полный сброс данных текущей базы. После сброса сайт остаётся полностью рабочим,
  // но создаёт только пустое состояние без тестовых команд/турниров/игроков.
  const LTL_DB_RESET_MARKER = 'ltl_database_reset_v2_done';
  const LTL_DB_RESET_ENABLED = false;

  function ltlClearLocalDatabaseKeys() {
    const keep = new Set([STORAGE_KEYS.THEME, STORAGE_KEYS.VIEW_MODE]);
    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('nexus_') === 0 && !keep.has(key)) remove.push(key);
    }
    remove.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('ltl_hidden_top_players');
    localStorage.removeItem('ltl_current_route');
  }

  async function ltlResetDatabaseOnce() {
    if (!LTL_DB_RESET_ENABLED || localStorage.getItem(LTL_DB_RESET_MARKER) === '1') return false;
    try {
      // V3: no direct browser access to the legacy database table.
      // Database reset/migration must be performed from the Supabase SQL Editor.
      ltlApplyingRemote = true;
      ltlClearLocalDatabaseKeys();
      ltlApplyingRemote = false;
      localStorage.setItem(LTL_DB_RESET_MARKER, '1');
      return true;
    } catch (e) {
      ltlApplyingRemote = false;
      console.error('Полный сброс базы не выполнен:', e);
      return false;
    }
  }

  // ===== LTL V14: ЕДИНОЕ ХРАНИЛИЩЕ nexus_users =====
  // Данные сайта больше не лежат в localStorage. localStorage используется только
  // для UI-настроек/сессии. Источник истины — public.nexus_users через RPC.
  let ltlSupabase = null;
  let ltlBackendReady = false;
  let ltlApplyingRemote = false;
  let ltlState = {};
  let ltlStatePoll = null;
  // Надёжная синхронизация: изменения не должны затираться 15-секундным polling.
  const ltlPendingWrites = new Map();
  const ltlWriteTimers = new Map();
  const ltlLastRemoteAt = new Map();

  function ltlQueueWrite(key, value, delay = 250) {
    if (!ltlIsSharedKey(key) || ltlApplyingRemote || !ltlBackendReady) return;
    ltlPendingWrites.set(key, value);
    if (ltlWriteTimers.has(key)) clearTimeout(ltlWriteTimers.get(key));
    const timer = setTimeout(() => {
      ltlWriteTimers.delete(key);
      ltlFlushKey(key);
    }, delay);
    ltlWriteTimers.set(key, timer);
  }

  async function ltlFlushKey(key) {
    if (!ltlPendingWrites.has(key) || !ltlBackendReady || ltlApplyingRemote) return;
    const value = ltlPendingWrites.get(key);
    const sb = ltlGetSupabaseClient();

/* ===== V2.6 LOGIN HARDENING =====
   Login form accepts username + password.
   Password is ALWAYS verified by Supabase Auth.
   Username is resolved server-side through nexus_resolve_login.
*/
async function resolveLoginEmail(loginValue){
  const login = String(loginValue || '').trim();
  if(!login) throw new Error('Введите логин');

  // Email input remains supported for existing accounts.
  if(login.includes('@')) return login.toLowerCase();

  const { data, error } = await sb.rpc('nexus_resolve_login', {
    p_username: login
  });
  if(error) throw new Error('Не удалось найти аккаунт');
  const email = typeof data === 'string' ? data : (Array.isArray(data) ? data[0]?.email : data?.email);
  if(!email) throw new Error('Неверный логин или пароль');
  return String(email).trim().toLowerCase();
}

async function loginWithUsername(loginValue, passwordValue){
  const password = String(passwordValue || '');
  if(!password) throw new Error('Введите пароль');

  const email = await resolveLoginEmail(loginValue);
  const { data, error } = await sb.auth.signInWithPassword({email, password});
  if(error) throw new Error('Неверный логин или пароль');
  return data;
}

    if (!sb) return;
    try {
      if (key === STORAGE_KEYS.USERS && currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) {
        const profile = ltlState[key]?.[String(currentUser || '').toLowerCase()];
        if (profile) {
          const { error } = await sb.rpc('nexus_update_my_profile', { p_profile: profile });
          if (error) throw error;
        }
      } else {
        const { error } = await sb.rpc('nexus_set_state', { p_key: key, p_value: value });
        if (error) throw error;
      }
      // Не удаляем более новое изменение, если оно появилось во время запроса.
      if (ltlPendingWrites.get(key) === value) ltlPendingWrites.delete(key);
    } catch (e) {
      console.warn('LTL: запись будет повторена:', key, e);
      // Оставляем pending; фоновый retry повторит запись.
    }
  }

  function ltlFlushPending() {
    for (const key of ltlPendingWrites.keys()) ltlFlushKey(key);
  }

  setInterval(ltlFlushPending, 3000);

  function ltlGetSupabaseClient() {
    if (ltlSupabase) return ltlSupabase;
    const c = ltlSupabaseConfig();
    if (!c.url || !c.key || !window.supabase || typeof window.supabase.createClient !== 'function') return null;
    try {
      ltlSupabase = window.supabase.createClient(c.url, c.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 10 } }
      });
      return ltlSupabase;
    } catch (e) {
      console.warn('Не удалось создать Supabase client:', e);
      return null;
    }
  }

  const LTL_LOCAL_ONLY_KEYS = new Set([
    STORAGE_KEYS.SESSION,
    STORAGE_KEYS.THEME,
    STORAGE_KEYS.VIEW_MODE,
    STORAGE_KEYS.ONLINE
  ]);
  function ltlIsSharedKey(key) {
    return typeof key === 'string' && key.indexOf('nexus_') === 0 && !LTL_LOCAL_ONLY_KEYS.has(key);
  }
  function ltlRenderAfterRemoteSync(key) {
    try {
      if (typeof forceRenderAll === 'function') forceRenderAll();
      else if (typeof renderAll === 'function') renderAll();
      if (key === STORAGE_KEYS.USERS && typeof renderRoleList === 'function') renderRoleList();
      if (typeof updateTotalUsersCount === 'function') updateTotalUsersCount();
    } catch (e) { console.warn('V2 render error:', e); }
  }

  async function ltlPushKey(key, value) {
    if (!ltlIsSharedKey(key) || ltlApplyingRemote || !ltlBackendReady) return;
    ltlQueueWrite(key, value);
  }

  // Перехват shared localStorage: данные остаются только в памяти страницы,
  // а не в persistent localStorage.
  try {
    const _getItem = Storage.prototype.getItem;
    const _setItem = Storage.prototype.setItem;
    const _removeItem = Storage.prototype.removeItem;
    Storage.prototype.getItem = function(key) {
      if (this === window.localStorage && ltlIsSharedKey(key)) {
        if (!Object.prototype.hasOwnProperty.call(ltlState, key)) return null;
        const v = ltlState[key];
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
      return _getItem.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (this === window.localStorage && ltlIsSharedKey(key)) {
        let parsed = value;
        try { parsed = JSON.parse(value); } catch (_) {}
        ltlState[key] = parsed;
        if (!ltlApplyingRemote) ltlPushKey(key, parsed);
        return;
      }
      _setItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function(key) {
      if (this === window.localStorage && ltlIsSharedKey(key)) {
        delete ltlState[key];
        return;
      }
      _removeItem.call(this, key);
    };
  } catch (e) { console.warn('V2 Storage hook unavailable:', e); }

  async function ltlBootstrapBackend() {
    const sb = ltlGetSupabaseClient();
    if (!sb) { ltlBackendReady = false; return; }
    try {
      const directoryCall = await sb.rpc('nexus_get_user_directory');
      if (directoryCall.error) throw directoryCall.error;

      let publicCall = await sb.rpc('nexus_get_public_state');
      if (publicCall.error) throw publicCall.error;

      ltlApplyingRemote = true;
      ltlState = (publicCall.data && typeof publicCall.data === 'object') ? publicCall.data : {};
      ltlState[STORAGE_KEYS.USERS] = (directoryCall.data && typeof directoryCall.data === 'object') ? directoryCall.data : {};

      if (currentUser) {
        const meCall = await sb.rpc('nexus_get_my_profile');
        if (!meCall.error && meCall.data && typeof meCall.data === 'object') {
          ltlState[STORAGE_KEYS.USERS][String(currentUser).toLowerCase()] = meCall.data;
          currentRole = meCall.data.role || ROLES.GUEST;
        }
      }

      // The RPC itself verifies staff privileges server-side. A forged local role
      // can never unlock the private state.
      if (currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD) {
        const staffCall = await sb.rpc('nexus_get_state');
        if (!staffCall.error && staffCall.data && typeof staffCall.data === 'object') {
          ltlState = staffCall.data;
          ltlState[STORAGE_KEYS.USERS] = (directoryCall.data && typeof directoryCall.data === 'object') ? directoryCall.data : {};
          const meCall = await sb.rpc('nexus_get_my_profile');
          if (!meCall.error && meCall.data && typeof meCall.data === 'object') {
            ltlState[STORAGE_KEYS.USERS][String(currentUser).toLowerCase()] = meCall.data;
          }
        }
      }

      ltlApplyingRemote = false;
      ltlBackendReady = true;
      ltlRenderAfterRemoteSync();
      // Polling avoids exposing the full table through Realtime row payloads.
      if (!ltlStatePoll) {
        ltlStatePoll = setInterval(async () => {
          try {
            const directoryCall = await sb.rpc('nexus_get_user_directory');
            if (directoryCall.error) return;
            const freshCall = await sb.rpc('nexus_get_public_state');
            if (freshCall.error || !freshCall.data) return;

            ltlApplyingRemote = true;
            const freshState = freshCall.data || {};
            // Не затираем локальные изменения, пока они не подтверждены сервером.
            for (const [dirtyKey, dirtyValue] of ltlPendingWrites.entries()) freshState[dirtyKey] = dirtyValue;
            ltlState = freshState;
            ltlState[STORAGE_KEYS.USERS] = ltlPendingWrites.has(STORAGE_KEYS.USERS)
              ? (ltlState[STORAGE_KEYS.USERS] || {})
              : (directoryCall.data || {});

            if (currentUser) {
              const meCall = await sb.rpc('nexus_get_my_profile');
              if (!meCall.error && meCall.data) {
                ltlState[STORAGE_KEYS.USERS][String(currentUser).toLowerCase()] = meCall.data;
                currentRole = meCall.data.role || ROLES.GUEST;
              }
            }

            if (currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD) {
              const staffCall = await sb.rpc('nexus_get_state');
              if (!staffCall.error && staffCall.data) {
                ltlState = staffCall.data;
                ltlState[STORAGE_KEYS.USERS] = directoryCall.data || {};
              }
            }

            ltlApplyingRemote = false;
            ltlRenderAfterRemoteSync();
          } catch (_) {}
        }, 15000);
      }
    } catch (e) {
      ltlApplyingRemote = false;
      ltlBackendReady = false;
      console.error('LTL V2 storage недоступно:', e);
    }
  }

  // ===== ОБЩИЙ ОНЛАЙН ЧЕРЕЗ SUPABASE REALTIME PRESENCE =====
  // Канал должен быть объявлен до первого чтения: иначе счётчик падал с ReferenceError.
  let ltlOnlineChannel = null;
  let ltlPresenceSubscribed = false;
  let ltlClientId = sessionStorage.getItem('ltl_client_id');
  if (!ltlClientId) {
    ltlClientId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    sessionStorage.setItem('ltl_client_id', ltlClientId);
  }

  function ltlUpdatePresenceCount() {
    const el = document.getElementById('onlineCount');
    if (!el) return;
    if (!ltlOnlineChannel || !ltlPresenceSubscribed) {
      el.textContent = '1';
      return;
    }
    try {
      const state = ltlOnlineChannel.presenceState ? ltlOnlineChannel.presenceState() : {};
      const count = Math.max(1, Object.keys(state || {}).length);
      el.textContent = String(count);
    } catch (e) {
      console.warn('Не удалось получить online presence:', e);
      el.textContent = '1';
    }
  }

  async function ltlStartOnlinePresence() {
    const sb = ltlGetSupabaseClient();
    if (!sb || ltlOnlineChannel) return;
    ltlOnlineChannel = sb.channel('ltl-online', { config: { presence: { key: ltlClientId } } });
    ltlOnlineChannel
      .on('presence', { event: 'sync' }, ltlUpdatePresenceCount)
      .on('presence', { event: 'join' }, ltlUpdatePresenceCount)
      .on('presence', { event: 'leave' }, ltlUpdatePresenceCount)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          ltlPresenceSubscribed = true;
          try {
            await ltlOnlineChannel.track({ clientId: ltlClientId, username: currentUser || 'Гость', at: Date.now() });
          } catch (e) {
            console.warn('Не удалось зарегистрировать online presence:', e);
          }
          ltlUpdatePresenceCount();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          ltlPresenceSubscribed = false;
          const el = document.getElementById('onlineCount');
          if (el) el.textContent = '1';
          console.warn('Supabase Realtime status:', status);
        }
      });
  }

  async function updateOnlineCounter() {
    if (!ltlOnlineChannel) {
      const el = document.getElementById('onlineCount');
      if (el) el.textContent = '1';
      await ltlStartOnlinePresence();
    } else {
      ltlUpdatePresenceCount();
    }
  }

  async function updateUserOnline() {
    if (!ltlOnlineChannel) {
      await ltlStartOnlinePresence();
      return;
    }
    if (ltlPresenceSubscribed) {
      try {
        await ltlOnlineChannel.track({ clientId: ltlClientId, username: currentUser || 'Гость', at: Date.now() });
        ltlUpdatePresenceCount();
        return;
      } catch (e) {
        console.warn('Presence update failed:', e);
      }
    }
    await ltlStartOnlinePresence();
  }

  const ROLES = { GUEST: 'guest', PLAYER: 'player', CAPTAIN: 'captain', ADMIN: 'admin', HEAD: 'head' };
  const ROLE_NAMES = { guest: 'Гость', player: 'Игрок', captain: 'Капитан', admin: 'Админ', head: 'Глава' };
  const ROLE_CLASSES = { guest: 'guest', player: 'player', captain: 'captain', admin: 'admin', head: 'head' };
  const HEAD_ACCOUNT = { username: 'LOWTABERN1KONYCH', role: ROLES.HEAD };

  let currentUser = null;
  let currentRole = ROLES.GUEST;
  let editingTeamId = null;
  let editingPlayerName = null;
  let editingPlayerTeamId = null;
  let playerDetailOrigin = 'teams';
  let editingMatchId = null;
  let editingTournamentId = null;
  let isRankEditMode = false;
  let isPlayerRankEditMode = false;
  let isBracketEditMode = false;
  let pageHistory = [];
  let currentMatchId = null;
  let currentTournamentId = null;
  let pendingConfirmAction = null;
  let totalSeconds = 0;
  let timerInterval = null;
  let notificationTimeout = null;
  let autoUpdateInterval = null;
  let matchNotificationInterval = null;
  let notifiedMatches = new Set();

  // ===== ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ =====
  function getFiles() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.FILES)) || [];
  }
  function setFiles(files) {
    localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(files));
  }

  function renderFiles() {
    const files = getFiles();
    const container = document.getElementById('fileList');
    if (files.length === 0) {
      container.innerHTML = '<p style="color:var(--muted); font-size:14px; text-align:center; padding:20px 0;">Нет загруженных файлов</p>';
      return;
    }
    container.innerHTML = files.map((f, index) => {
      const icon = f.type.startsWith('image/') ? 'fa-image' : 'fa-file-pdf';
      const preview = f.type.startsWith('image/') ? `<img src="${f.data}" style="max-width:100px; max-height:100px; border-radius:8px; object-fit:cover; border:1px solid var(--line);">` : '';
      return `
        <div style="display:flex; align-items:center; gap:16px; padding:12px 16px; background:var(--bg2); border-radius:12px; border:1px solid var(--line);">
          <div style="width:60px; height:60px; display:flex; align-items:center; justify-content:center; background:var(--paper); border-radius:12px; border:1px solid var(--line);">
            ${preview || `<i class="fas ${icon}" style="font-size:28px; color:var(--accent);"></i>`}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:15px; word-break:break-all;">${f.name}</div>
            <div style="font-size:12px; color:var(--muted);">${(f.size / 1024).toFixed(1)} KB · ${new Date(f.uploaded).toLocaleString('ru-RU')}</div>
            <div style="font-size:11px; color:var(--accent);">${f.type || 'application/octet-stream'}</div>
          </div>
          <div style="display:flex; gap:8px; flex-shrink:0;">
            <a href="${f.data}" download="${f.name}" target="_blank" style="padding:6px 12px; border-radius:8px; background:var(--accent); color:#fff; text-decoration:none; font-weight:700; font-size:12px; border:none; cursor:pointer;">⬇ Скачать</a>
            <button class="delete-file-btn" data-index="${index}" style="padding:6px 12px; border-radius:8px; border:1px solid #ef5350; background:transparent; color:#ef5350; cursor:pointer; font-weight:700; font-size:12px;">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.delete-file-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const index = parseInt(this.dataset.index);
        showConfirm('Удаление файла', 'Вы уверены, что хотите удалить этот файл?', function() {
          const files = getFiles();
          files.splice(index, 1);
          setFiles(files);
          renderFiles();
          showNotification('Файл удалён', '', 'fa-trash');
        });
      });
    });
  }

  // ===== УВЕДОМЛЕНИЯ О МАТЧАХ =====
  function startMatchNotifications() {
    if (matchNotificationInterval) { clearInterval(matchNotificationInterval); matchNotificationInterval = null; }
  }

  // ===== ИНИЦИАЛИЗАЦИЯ БАЗЫ =====
  function initDatabase() {
    let users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || {};
    if (!localStorage.getItem(STORAGE_KEYS.NEWS)) {
      localStorage.setItem(STORAGE_KEYS.NEWS, JSON.stringify([
        { id: 1, date: '20.08.2026', title: 'Team Liquid выходит в полуфинал', desc: 'Team Liquid победила Yandex со счётом 2:1 и выходит в полуфинал.', full: 'Team Liquid показала отличную игру в решающей карте. Мидлейнер Nisha сделал трипл-килл на 35-й минуте.', featured: true },
        { id: 2, date: '19.08.2026', title: '«Мы готовы к Double Elimination»', desc: 'Капитан Team Liquid поделился ожиданиями от плей-офф.', full: 'Капитан Team Liquid Топ-сон дал интервью перед стартом плей-офф.', featured: false },
        { id: 3, date: '18.08.2026', title: 'Расписание Play-in', desc: '10 команд поборются за 5 слотов в плей-офф.', full: 'Опубликовано расписание Play-in стадии. Матчи начнутся 21 августа в 10:00.', featured: false },
        { id: 4, date: '18.08.2026', title: 'Определились первые полуфиналисты', desc: 'После завершения четвертьфиналов определились первые полуфиналисты.', full: 'Первыми полуфиналистами стали Team Liquid и Team Spirit.', featured: false }
      ]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.TEAMS)) {
      localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify([
        { id: 'liquid', name: 'Team Liquid', region: '🇪🇺 Европа', icon: 'TL', description: 'Одна из сильнейших команд мира по Dota 2.', roster: ['Micke', 'Nisha', 'zai', 'Boxi', 'Insania'], wins: 121, losses: 115, prize: '2 845 000 ₽', points: 2845, avatar: null },
        { id: 'xtreme', name: 'Xtreme Gaming', region: '🇨🇳 Китай', icon: 'XG', description: 'Китайская команда с большим потенциалом.', roster: ['Ame', 'Xm', 'Xxs', 'XinQ', 'Dy'], wins: 108, losses: 107, prize: '2 670 000 ₽', points: 2670, avatar: null },
        { id: 'spirit', name: 'Team Spirit', region: '🇷🇺 Россия', icon: 'TS', description: 'Действующие чемпионы The International.', roster: ['Yatoro', 'Collapse', 'Larl', 'Mira', 'Miposhka'], wins: 95, losses: 94, prize: '2 510 000 ₽', points: 2510, avatar: null },
        { id: 'og', name: 'OG', region: '🇪🇺 Европа', icon: 'OG', description: 'Легендарная команда с двумя победами на TI.', roster: ['Yuragi', 'bzm', 'ATF', 'Taiga', 'Chu'], wins: 98, losses: 112, prize: '2 350 000 ₽', points: 2350, avatar: null },
        { id: 'falcons', name: 'Falcons', region: '🇸🇦 Саудовская Аравия', icon: 'F', description: 'Новая сила на мировой сцене.', roster: ['Sneyking', 'skiter', 'Malr1ne', 'Ace', 'Cr1t-'], wins: 87, losses: 69, prize: '2 200 000 ₽', points: 2200, avatar: null },
        { id: 'parivision', name: 'PARIVISION', region: '🇪🇺 Европа', icon: 'P', description: 'Европейский коллектив с амбициозными целями.', roster: ['No[o]ne', 'DM', 'Kiyotaka', '9class', 'Antares'], wins: 52, losses: 43, prize: '2 050 000 ₽', points: 2050, avatar: null },
        { id: 'heroic', name: 'HEROIC', region: '🇪🇺 Европа', icon: 'H', description: 'Команда с молодыми и талантливыми игроками.', roster: ['Parker', 'Chris Luck', 'Wisper', 'Scofield', 'KJ'], wins: 45, losses: 43, prize: '1 900 000 ₽', points: 1900, avatar: null },
        { id: 'betboom', name: 'BetBoom Team', region: '🇷🇺 Россия', icon: 'BB', description: 'Российский коллектив, набирающий обороты.', roster: ['Nightfall', 'gpk', 'MieRo', 'Save-', 'TORONTOTOKYO'], wins: 70, losses: 45, prize: '1 850 000 ₽', points: 1850, avatar: null }
      ]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.TOURNAMENTS)) {
      localStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify([
        { id: 't1', name: 'LTL WORLD CUP 2026', game: 'Dota 2', start: '2026-08-12', end: '2026-08-28', prize: '200 000 000 ₽', location: 'Шанхай, Китай', teamsCount: 8, description: 'Главный турнир года по Dota 2. Double Elimination.', bracket: [] },
        { id: 't2', name: 'CYBER CLASH 2026', game: 'CS2', start: '2026-09-05', end: '2026-09-20', prize: '150 000 000 ₽', location: 'Кёльн, Германия', teamsCount: 8, description: 'Крупнейший турнир по CS2 в Европе. Double Elimination.', bracket: [] },
        { id: 't3', name: 'MASTERS ARENA', game: 'Valorant', start: '2026-10-01', end: '2026-10-10', prize: '80 000 000 ₽', location: 'Лос-Анджелес, США', teamsCount: 8, description: 'Турнир по Valorant с участием 8 лучших команд мира. Double Elimination.', bracket: [] }
      ]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.PLAYERS)) localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify({}));
    if (!localStorage.getItem(STORAGE_KEYS.KDA)) localStorage.setItem(STORAGE_KEYS.KDA, JSON.stringify({}));
    if (!localStorage.getItem(STORAGE_KEYS.MATCH_GAMES)) localStorage.setItem(STORAGE_KEYS.MATCH_GAMES, JSON.stringify({}));
    if (!localStorage.getItem(STORAGE_KEYS.HIGHLIGHTS)) localStorage.setItem(STORAGE_KEYS.HIGHLIGHTS, JSON.stringify({}));
    if (!localStorage.getItem(STORAGE_KEYS.MATCHES)) localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify([]));
    if (!localStorage.getItem(STORAGE_KEYS.SERVER_TEXT)) localStorage.setItem(STORAGE_KEYS.SERVER_TEXT, 'Добро пожаловать в LTL | LOW TABE LEAGUE — главную киберспортивную платформу!');
    if (!localStorage.getItem(STORAGE_KEYS.ABOUT_TEXT)) localStorage.setItem(STORAGE_KEYS.ABOUT_TEXT, 'Киберспортивная платформа для проведения турниров, матчей и отслеживания рейтингов команд и игроков. LTL | LOW TABE LEAGUE — это место, где собираются лучшие киберспортсмены и фанаты.');
    if (!localStorage.getItem(STORAGE_KEYS.SUPPORT_MESSAGES)) localStorage.setItem(STORAGE_KEYS.SUPPORT_MESSAGES, JSON.stringify([]));
    if (!localStorage.getItem(STORAGE_KEYS.SEO_KEYWORDS)) localStorage.setItem(STORAGE_KEYS.SEO_KEYWORDS, 'LTL, LOW TABE LEAGUE, киберспорт, турниры, Dota 2, CS2');
    if (!localStorage.getItem(STORAGE_KEYS.SEO_DESCRIPTION)) localStorage.setItem(STORAGE_KEYS.SEO_DESCRIPTION, 'LTL | LOW TABE LEAGUE — киберспортивная платформа для проведения турниров и матчей');
    if (!localStorage.getItem(STORAGE_KEYS.FILES)) localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify([]));
  }

  function getUsers() { return (ltlState[STORAGE_KEYS.USERS] && typeof ltlState[STORAGE_KEYS.USERS] === 'object') ? ltlState[STORAGE_KEYS.USERS] : {}; }
  function setUsers(users) {
    ltlState[STORAGE_KEYS.USERS] = users || {};
    if (ltlBackendReady) ltlPushKey(STORAGE_KEYS.USERS, ltlState[STORAGE_KEYS.USERS]);
  }
  function getNews() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.NEWS)) || []; }
  function setNews(news) { localStorage.setItem(STORAGE_KEYS.NEWS, JSON.stringify(news)); }
  function getMatches() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.MATCHES)) || []; }
  function setMatches(matches) { localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(matches)); }
  function getTeams() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.TEAMS)) || []; }
  function setTeams(teams) { localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams)); }
  function getPlayers() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAYERS)) || {}; }
  function setPlayers(players) { localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players)); }
  function getTournaments() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.TOURNAMENTS)) || []; }
  function setTournaments(tournaments) { localStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify(tournaments)); }
  function getKDA() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.KDA)) || {}; }
  function getMatchGamesStore() { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.MATCH_GAMES)) || {}; } catch(e) { return {}; } }
  function setMatchGamesStore(store) { localStorage.setItem(STORAGE_KEYS.MATCH_GAMES, JSON.stringify(store)); }
  function getMatchGames(matchId) { const st = getMatchGamesStore(); return Array.isArray(st[matchId]) ? st[matchId] : []; }
  function setMatchGames(matchId, games) { const st = getMatchGamesStore(); st[matchId] = games; setMatchGamesStore(st); }
  function setKDA(kda) { localStorage.setItem(STORAGE_KEYS.KDA, JSON.stringify(kda)); }
  function getHighlights() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.HIGHLIGHTS)) || {}; }
  function setHighlights(highlights) { localStorage.setItem(STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(highlights)); }
  function getSupportMessages() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SUPPORT_MESSAGES)) || []; }
  function setSupportMessages(messages) { localStorage.setItem(STORAGE_KEYS.SUPPORT_MESSAGES, JSON.stringify(messages)); }
  function getTeamRoster(teamName) { const team = getTeams().find(t => t.name === teamName); return (team && team.roster && team.roster.length > 0) ? team.roster : null; }
  // Единый профиль игрока: один ключ на аккаунт, независимо от команды.
  // Благодаря этому ТОП, страница команды и личный профиль всегда читают одни и те же данные.
  function canonicalPlayerKey(playerName) { return 'player_' + String(playerName || '').trim().toLowerCase(); }
  function migratePlayerRecord(teamId, playerName) {
    const players = getPlayers();
    const canonical = canonicalPlayerKey(playerName);
    if (!playerName) return null;
    if (players[canonical]) {
      players[canonical].name = players[canonical].name || playerName;
      players[canonical].teamId = teamId ?? players[canonical].teamId ?? null;
      return players[canonical];
    }
    const candidates = [playerStorageKey(teamId, playerName), String(teamId || '') + '_' + String(playerName || ''), playerStorageKey(null, playerName)];
    let found = null;
    for (const key of candidates) { if (players[key]) { found = players[key]; break; } }
    if (!found) {
      const lower = String(playerName).toLowerCase();
      const anyKey = Object.keys(players).find(k => players[k] && String(players[k].name || '').toLowerCase() === lower);
      if (anyKey) found = players[anyKey];
    }
    if (!found) {
      found = { name: playerName, teamId: teamId || null, role: 'Игрок', matches: 0, wins: 0, losses: 0, earnings: '0 ₽', bio: 'Биография игрока пока не заполнена.', rating: 1000, lts: 0 };
    } else {
      found = { name: playerName, teamId: teamId ?? found.teamId ?? null, role: 'Игрок', matches: 0, wins: 0, losses: 0, earnings: '0 ₽', bio: 'Биография игрока пока не заполнена.', rating: 1000, lts: 0, ...found, teamId: teamId ?? found.teamId ?? null, name: playerName };
    }
    players[canonical] = found;
    candidates.forEach(k => { if (k !== canonical && players[k]) delete players[k]; });
    setPlayers(players);
    return found;
  }
  function getPlayerData(teamId, playerName) { return migratePlayerRecord(teamId, playerName); }
  function savePlayerData(teamId, playerName, data) {
    const players = getPlayers();
    const key = canonicalPlayerKey(playerName);
    players[key] = { ...data, name: playerName, teamId: teamId ?? data.teamId ?? null };
    // Удаляем старые team-specific записи этого игрока, чтобы больше не было двух источников истины.
    const lower = String(playerName || '').toLowerCase();
    Object.keys(players).forEach(k => { if (k !== key && players[k] && String(players[k].name || '').toLowerCase() === lower) delete players[k]; });
    setPlayers(players);
  }

  function showNotification(title, text, icon = 'fa-bolt') {
    document.getElementById('notifTitle').textContent = title;
    document.getElementById('notifText').textContent = text;
    document.querySelector('.notif-icon i').className = 'fas ' + icon;
    const notification = document.getElementById('notification');
    notification.classList.add('show');
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => notification.classList.remove('show'), 5000);
  }

  function updateSupportBadge() {
    const messages = getSupportMessages();
    const unread = messages.filter(m => !m.read).length;
    const badge = document.getElementById('supportBadge');
    if (unread > 0 && (currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD)) {
      badge.style.display = 'flex';
      badge.textContent = unread;
    } else badge.style.display = 'none';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    document.getElementById('themeLabel').textContent = theme === 'dark' ? 'Тёмная' : 'Светлая';
    document.getElementById('themeIcon').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }

  // ===== ЗАЩИЩЁННАЯ АВТОРИЗАЦИЯ SUPABASE =====
  function ltlAuthEmail(username) {
    const raw = String(username || '').trim();
    const bytes = new TextEncoder().encode(raw.toLowerCase());
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    const token = btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return 'u-' + token.slice(0, 48) + '@auth.ltl.invalid';
  }
  async function ltlGetAuthUser() {
    const sb = ltlGetSupabaseClient();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getUser();
      return data && data.user ? data.user : null;
    } catch (_) { return null; }
  }
  async function ltlSignOutAuth() {
    const sb = ltlGetSupabaseClient();
    if (sb) { try { await sb.auth.signOut(); } catch (_) {} }
  }

  // ===== АВТОРИЗАЦИЯ =====
  function loginUser(username, role, showNotif = true) {
    currentUser = username;
    currentRole = role || ROLES.GUEST;
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ username, role: currentRole }));
    
    document.getElementById('authButtons').classList.add('hidden');
    document.getElementById('loginIconBtn')?.classList.add('hidden');
    document.getElementById('loginBtn')?.classList.add('hidden');
    document.getElementById('registerBtn')?.classList.add('hidden');
    document.getElementById('userProfile').classList.remove('hidden');
    document.querySelectorAll('.auth-buttons-mobile').forEach(el => el.classList.add('hidden'));
    document.getElementById('teamRegisterBtn').classList.add('show');
    document.getElementById('profileUsername').textContent = username;
    document.getElementById('profileRole').textContent = ROLE_NAMES[role] || 'Гость';
    document.getElementById('profileRole').className = 'role-badge ' + (ROLE_CLASSES[role] || 'guest');
    document.getElementById('profileFullName').textContent = username;
    const profileEmailEl = document.getElementById('profileEmail'); if (profileEmailEl) profileEmailEl.textContent = '';
    document.getElementById('profileRoleBadge').textContent = ROLE_NAMES[role] || 'Гость';
    document.getElementById('profileRoleBadge').className = 'role-badge ' + (ROLE_CLASSES[role] || 'guest');
    
    document.getElementById('mobileAuthButtons').style.display = 'none';
    document.getElementById('mobileUserProfile').style.display = 'flex';
    document.getElementById('mobileProfileUsername').textContent = username;
    document.getElementById('mobileProfileRole').textContent = ROLE_NAMES[role] || 'Гость';
    
    loadAvatar();
    
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    const isHead = currentRole === ROLES.HEAD;
    document.getElementById('adminPanel').classList.toggle('show', isAdmin);
    document.getElementById('profileAdminPanel').classList.toggle('show', isAdmin);
    document.getElementById('serverTextEdit').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('teamsAdminControls').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('teamAdminControls').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('matchesAdminControls').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('tournamentAdminControls').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('roleManagementPanel').style.display = isHead ? 'block' : 'none';
    document.getElementById('aboutAdminPanel').style.display = isAdmin ? 'block' : 'none';
    
    updateAdminVisibility();
    renderAdminNews();
    renderRoleList();
    renderAll();
    updateTotalUsersCount();
    updateSupportBadge();
    updateUserOnline();
    if (showNotif) showNotification('Добро пожаловать!', 'Вы вошли как ' + username, 'fa-user-check');
  }

  async function logoutUser() {
    const username = currentUser;
    currentUser = null;
    currentRole = ROLES.GUEST;
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    await ltlSignOutAuth();
    updateUserOnline();
    
    document.getElementById('authButtons').classList.remove('hidden');
    document.getElementById('loginIconBtn')?.classList.remove('hidden');
    document.getElementById('loginBtn')?.classList.remove('hidden');
    document.getElementById('registerBtn')?.classList.remove('hidden');
    document.getElementById('userProfile').classList.add('hidden');
    document.querySelectorAll('.auth-buttons-mobile').forEach(el => el.classList.remove('hidden'));
    document.getElementById('teamRegisterBtn').classList.remove('show');
    document.getElementById('adminPanel').classList.remove('show');
    document.getElementById('roleManagementPanel').style.display = 'none';
    document.getElementById('profileAdminPanel').classList.remove('show');
    document.getElementById('serverTextEdit').style.display = 'none';
    document.getElementById('teamsAdminControls').style.display = 'none';
    document.getElementById('teamAdminControls').style.display = 'none';
    document.getElementById('matchesAdminControls').style.display = 'none';
    document.getElementById('tournamentAdminControls').style.display = 'none';
    document.getElementById('aboutAdminPanel').style.display = 'none';
    
    document.getElementById('mobileAuthButtons').style.display = 'flex';
    document.getElementById('mobileUserProfile').style.display = 'none';
    
    updateAdminVisibility();
    document.querySelector('#nav button[data-page="home"]').click();
    showNotification('До свидания!', 'Вы вышли из аккаунта', 'fa-sign-out-alt');
  }

  async function restoreSession() {
    try {
      const sb = ltlGetSupabaseClient();
      if (!sb) return false;
      const { data: sessionData } = await sb.auth.getSession();
      const session = sessionData && sessionData.session;
      if (!session || !session.user) return false;
      const username = String(session.user.user_metadata?.username || session.user.email || '').trim();
      if (!username) return false;

      // Never restore a role from localStorage/public cache: ask the protected RPC.
      const { data: myProfile, error: profileError } = await sb.rpc('nexus_get_my_profile');
      if (profileError || !myProfile || !myProfile.username) {
        await sb.auth.signOut();
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        return false;
      }
      const serverUsername = String(myProfile.username);
      const serverRole = myProfile.role || ROLES.GUEST;
      ltlState[STORAGE_KEYS.USERS] = {
        ...getUsers(),
        [serverUsername.toLowerCase()]: myProfile
      };
      loginUser(serverUsername, serverRole, false);
      return true;
    } catch (e) {
      console.warn('Не удалось восстановить защищённую сессию:', e);
      return false;
    }
  }

  // ===== ОБЩИЕ АВАТАРЫ ИГРОКОВ =====
  // Аватар хранится в Supabase Storage, а его публичный URL — в nexus_users.
  // localStorage используется только как совместимый локальный кэш/резерв.
  function getAvatarKey(username) { return STORAGE_KEYS.AVATAR_PREFIX + (username || 'guest'); }

  function getSharedUserAvatar(username) {
    if (!username) return '';
    try {
      const users = getUsers();
      const user = users[String(username).toLowerCase()];
      if (user && user.avatar_url) return String(user.avatar_url);
      if (user && user.avatar) return String(user.avatar);
    } catch (_) {}
    return '';
  }

  function setAvatarVisuals(avatarData) {
    const ids = ['headerAvatarImg', 'profileAvatarImg', 'mobileHeaderAvatarImg'];
    const placeholders = ['headerAvatarPlaceholder', 'profileAvatarPlaceholder', 'mobileHeaderAvatarPlaceholder'];
    if (!avatarData) {
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      placeholders.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; });
      return;
    }
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.src = avatarData;
      el.style.display = 'block';
    });
    placeholders.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  }

  async function saveSharedUserAvatar(avatarUrl) {
    if (!currentUser) return;
    const users = getUsers();
    const userKey = String(currentUser).toLowerCase();
    const user = users[userKey];
    if (!user) return;
    if (avatarUrl) {
      user.avatar_url = avatarUrl;
      user.avatar = avatarUrl; // совместимость со старым кодом
    } else {
      delete user.avatar_url;
      delete user.avatar;
    }
    users[userKey] = user;
    setUsers(users); // nexus_users сохраняется через защищённый RPC
  }

  async function updateAvatar(avatarData) {
    if (!currentUser) return;
    if (!avatarData) {
      const oldAvatar = getSharedUserAvatar(currentUser);
      await saveSharedUserAvatar('');
      setAvatarVisuals('');
      if (oldAvatar && oldAvatar.indexOf('/storage/v1/object/public/' + LTL_MEDIA_BUCKET + '/') >= 0) {
        ltlDeleteMediaUrl(oldAvatar);
      }
      return;
    }
    await saveSharedUserAvatar(avatarData);
    setAvatarVisuals(avatarData);
  }

  async function loadAvatar() {
    let savedAvatar = getSharedUserAvatar(currentUser);
    // Мигрируем старый Base64-аватар текущего пользователя в Storage.
    try {
      const legacy = localStorage.getItem(getAvatarKey(currentUser));
      if (legacy && String(legacy).startsWith('data:image/')) {
        const m = String(legacy).match(/^data:([^;]+);base64,(.+)$/);
        if (m && ltlHasSupabaseStorage()) {
          const bin = atob(m[2]);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const blob = new Blob([arr], {type:m[1]});
          const ext = (m[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi,'');
          const uploaded = await ltlUploadMedia(
            new File([blob], 'avatar.' + ext, {type:m[1]}),
            'avatars/' + ltlSafeFileName(String(currentUser).toLowerCase())
          );
          await saveSharedUserAvatar(uploaded.url);
          savedAvatar = uploaded.url;
        }
      }
    } catch (e) {
      console.warn('Не удалось мигрировать старый аватар в Supabase Storage:', e);
    }

    setAvatarVisuals(savedAvatar || '');
  }

  function getPlayerAvatarUrl(username) {
    const shared = getSharedUserAvatar(username);
    if (shared) return shared;
    try {
      const target = String(username || '').toLowerCase();
      const players = getPlayers();
      for (const key of Object.keys(players)) {
        const data = players[key];
        if (data && data.name && String(data.name).toLowerCase() === target && data.avatar_url) return String(data.avatar_url);
      }
    } catch (_) {}
    return '';
  }

  function playerAvatarMarkup(username, className, extraClass='') {
    const url = getPlayerAvatarUrl(username);
    const safeName = String(username || '?').replace(/[<>&"]/g, '');
    const initial = safeName.charAt(0).toUpperCase();
    if (url) {
      const safeUrl = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      return `<span class="avatar-adaptive-wrap ${extraClass}" style="--avatar-fallback:var(--accent);--avatar-glow:rgba(255,77,28,.18);" aria-label="${safeName}"><img class="avatar-adaptive-bg" src="${safeUrl}" alt="" aria-hidden="true" loading="lazy"><img class="${className}" src="${safeUrl}" alt="${safeName}" loading="lazy" onload="this.parentElement.classList.add('has-avatar')" onerror="this.style.display='none';this.parentElement.querySelector('.avatar-adaptive-bg')?.remove();this.parentElement.querySelector('.avatar-adaptive-fallback').style.display='grid';"><span class="avatar-adaptive-fallback" style="display:none;">${initial}</span></span>`;
    }
    return `<span class="avatar-adaptive-wrap ${extraClass}" style="--avatar-fallback:var(--accent);--avatar-glow:rgba(255,77,28,.12);"><span class="avatar-adaptive-fallback">${initial}</span></span>`;
  }

  function refreshAdaptiveAvatarEffects(root=document) {
    try {
      root.querySelectorAll?.('.avatar-adaptive-wrap').forEach(w => {
        const img = w.querySelector('.player-avatar-shared');
        const bg = w.querySelector('.avatar-adaptive-bg');
        if (img && bg && img.complete && img.naturalWidth > 0) w.classList.add('has-avatar');
      });
    } catch (_) {}
  }

  function renderRoleBadge(role) {
    const name = ROLE_NAMES[role] || 'Гость';
    const cls = ROLE_CLASSES[role] || 'guest';
    return `<span class="role-badge ${cls}">${name}</span>`;
  }

  function renderRoleList() {
    if (currentRole !== ROLES.HEAD) return;
    const roleList = document.getElementById('roleList');
    if (!roleList) return;
    roleList.innerHTML = '';
    const users = getUsers() || {};
    const searchEl = document.getElementById('roleUserSearch');
    const filterEl = document.getElementById('roleQuickFilter');
    const search = String(searchEl?.value || '').trim().toLowerCase();
    const filter = String(filterEl?.value || 'all');

    const entries = Object.keys(users).map(key => users[key]).filter(Boolean).filter(user => {
      const role = user.role || ROLES.GUEST;
      const name = String(user.username || '').toLowerCase();
      return (!search || name.includes(search)) && (filter === 'all' || role === filter);
    });

    if (!entries.length) {
      roleList.innerHTML = '<div style="padding:18px;color:var(--muted);text-align:center;border:1px dashed var(--line);border-radius:12px;">Пользователи не найдены</div>';
    }

    entries.forEach(user => {
      const role = user.role || ROLES.GUEST;
      const username = String(user.username || '');
      const div = document.createElement('div');
      div.className = 'role-item';
      div.innerHTML = `
        <span class="user-name" style="flex:1">${escHtml(username)}</span>
        <span>${renderRoleBadge(role)}</span>
        ${role !== ROLES.HEAD ? `
          <select class="role-select" data-user="${escHtml(username)}" aria-label="Роль пользователя ${escHtml(username)}">
            <option value="guest" ${role === ROLES.GUEST ? 'selected' : ''}>Гость</option>
            <option value="player" ${role === ROLES.PLAYER ? 'selected' : ''}>Игрок</option>
            <option value="captain" ${role === ROLES.CAPTAIN ? 'selected' : ''}>Капитан</option>
            <option value="admin" ${role === ROLES.ADMIN ? 'selected' : ''}>Админ</option>
          </select>
          <div class="role-quick-actions" data-user="${escHtml(username)}">
            <button type="button" data-role="guest">Гость</button>
            <button type="button" data-role="player">Игрок</button>
            <button type="button" data-role="captain">Капитан</button>
            <button type="button" data-role="admin">Админ</button>
          </div>
          ${role === ROLES.ADMIN ? `<button class="remove-admin-btn" data-user="${escHtml(username)}" style="padding:7px 9px;border-radius:6px;border:1px solid #ef5350;background:transparent;color:#ef5350;cursor:pointer;font-size:11px;">✕ Снять</button>` : ''}
          <div class="v9-role-quick" style="width:100%;display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <button type="button" data-v9-role="guest" data-user="${escHtml(username)}" style="padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;font-size:11px;">Гость</button>
            <button type="button" data-v9-role="player" data-user="${escHtml(username)}" style="padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;font-size:11px;">Игрок</button>
            <button type="button" data-v9-role="captain" data-user="${escHtml(username)}" style="padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;font-size:11px;">Капитан</button>
            <button type="button" data-v9-role="admin" data-user="${escHtml(username)}" style="padding:6px 9px;border:1px solid var(--accent);border-radius:8px;background:var(--paper);color:var(--accent);cursor:pointer;font-size:11px;font-weight:700;">Админ</button>
          </div>
          <div class="head-points-actions">
            <button type="button" class="minus" data-points-action="lts-minus" data-user="${escHtml(username)}">LTS −10</button>
            <button type="button" class="plus" data-points-action="lts-plus" data-user="${escHtml(username)}">LTS +10</button>
            <button type="button" class="minus" data-points-action="rating-minus" data-user="${escHtml(username)}">Рейтинг −10</button>
            <button type="button" class="plus" data-points-action="rating-plus" data-user="${escHtml(username)}">Рейтинг +10</button>
            <button type="button" data-points-action="custom" data-user="${escHtml(username)}">✎ Свое значение</button>
          </div>
        ` : '<span style="color:var(--muted);font-size:12px;white-space:nowrap;">👑 Глава</span>'}
      `;
      roleList.appendChild(div);
    });

    roleList.querySelectorAll('.role-select').forEach(select => {
      select.addEventListener('change', async function() {
        const username = this.dataset.user;
        const newRole = this.value;
        if (currentRole !== ROLES.HEAD) return;
        const currentUsers = getUsers() || {};
        const userKey = String(username).toLowerCase();
        const target = currentUsers[userKey];
        if (!target || target.role === ROLES.HEAD) return;
        target.role = newRole;
        if (newRole !== ROLES.PLAYER && newRole !== ROLES.CAPTAIN) target.teamId = null;
        setUsers(currentUsers);
        if (newRole === ROLES.PLAYER) addPlayerToTop(target.username, target.teamId || null);
        renderTopPlayers();
        renderRoleList();
        if (String(currentUser || '').toLowerCase() === userKey) {
          currentRole = newRole;
          updateAdminVisibility();
          renderRoleList();
        }
        showNotification('Роль изменена!', 'Пользователь ' + username + ' теперь ' + ROLE_NAMES[newRole], 'fa-user-cog');
      });
    });
    roleList.querySelectorAll('.role-quick-actions button').forEach(btn => {
      btn.addEventListener('click', function() {
        const username = this.closest('.role-quick-actions')?.dataset.user || '';
        const select = roleList.querySelector(`.role-select[data-user="${CSS.escape(username)}"]`);
        if (!select) return;
        select.value = this.dataset.role || 'guest';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    roleList.querySelectorAll('[data-v9-role]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        const username = this.dataset.user;
        const newRole = this.dataset.v9Role;
        const currentUsers = getUsers() || {};
        const userKey = String(username).toLowerCase();
        const target = currentUsers[userKey];
        if (!target || target.role === ROLES.HEAD) return;
        target.role = newRole;
        if (newRole !== ROLES.PLAYER && newRole !== ROLES.CAPTAIN) target.teamId = null;
        setUsers(currentUsers);
        renderRoleList();
        renderTopPlayers();
        if (String(currentUser || '').toLowerCase() === userKey) {
          currentRole = newRole;
          updateAdminVisibility();
        }
        showNotification('Роль изменена!', 'Пользователь ' + username + ' теперь ' + ROLE_NAMES[newRole], 'fa-user-cog');
      });
    });

    roleList.querySelectorAll('.remove-admin-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const username = this.dataset.user;
        showConfirm('Снять с должности Админа', 'Вы уверены, что хотите снять пользователя ' + username + ' с должности Администратора?', function() {
          const currentUsers = getUsers() || {};
          const userKey = String(username).toLowerCase();
          if (currentUsers[userKey] && currentUsers[userKey].role === ROLES.ADMIN) {
            currentUsers[userKey].role = ROLES.GUEST;
            currentUsers[userKey].teamId = null;
            setUsers(currentUsers);
            renderRoleList();
            renderTopPlayers();
            showNotification('Должность снята!', username + ' больше не Администратор', 'fa-user-slash');
          }
        });
      });
    });

    roleList.parentElement.querySelector('.head-team-points')?.remove();
    const teamWrap = document.createElement('div');
    teamWrap.className = 'head-team-points';
    const teamsForHead = getTeams() || [];
    teamWrap.innerHTML = `<h4>🏆 Очки рейтинга команд</h4><div class="head-team-points-list">${teamsForHead.length ? teamsForHead.map(team => `
      <div class="head-team-points-item">
        <div><strong>${escHtml(team.name || 'Команда')}</strong><div style="font-size:11px;color:var(--muted);margin-top:2px;">Рейтинг: ${Number(team.points || 0)}</div></div>
        <div class="head-team-points-actions">
          <button class="minus" type="button" data-team-points="-10" data-team-id="${escHtml(String(team.id))}">−10</button>
          <button class="plus" type="button" data-team-points="10" data-team-id="${escHtml(String(team.id))}">+10</button>
          <button type="button" data-team-points="custom" data-team-id="${escHtml(String(team.id))}">✎</button>
        </div>
      </div>`).join('') : '<div style="color:var(--muted);font-size:12px;">Команд пока нет</div>'}</div>`;
    roleList.parentElement.appendChild(teamWrap);

    roleList.querySelectorAll('[data-points-action]').forEach(btn => {
      btn.addEventListener('click', function() {
        if (currentRole !== ROLES.HEAD) return;
        const username = this.dataset.user;
        const action = this.dataset.pointsAction;
        const usersNow = getUsers() || {};
        const key = String(username).toLowerCase();
        const user = usersNow[key];
        if (!user || user.role === ROLES.HEAD) return;
        const data = getPlayerData(user.teamId || null, username);
        let field = action.startsWith('lts') ? 'lts' : 'rating';
        let delta = action.endsWith('plus') ? 10 : action.endsWith('minus') ? -10 : null;
        if (action === 'custom') {
          const kind = prompt(`Что изменить для ${username}? Введите LTS или RATING`, 'LTS');
          if (!kind) return;
          field = String(kind).trim().toLowerCase() === 'rating' ? 'rating' : 'lts';
          const amount = prompt(`Введите изменение ${field.toUpperCase()} (например 25 или -25):`, '10');
          if (amount === null) return;
          delta = Number(amount);
        }
        if (!Number.isFinite(delta) || delta === 0) { showNotification('Ошибка', 'Введите ненулевое число.', 'fa-times-circle'); return; }
        const oldValue = Number(data[field] ?? (field === 'rating' ? 1000 : 0));
        data[field] = field === 'lts' ? Math.max(0, oldValue + delta) : Math.max(0, oldValue + delta);
        savePlayerData(user.teamId || null, username, data);
        renderTopPlayers();
        renderRoleList();
        if (editingPlayerName && String(editingPlayerName).toLowerCase() === key) window.showPlayerDetail(editingPlayerName, user.teamId || null);
        showNotification('Очки изменены', `${username}: ${field.toUpperCase()} ${delta > 0 ? '+' : ''}${delta}`, 'fa-star');
      });
    });

    teamWrap.querySelectorAll('[data-team-points]').forEach(btn => {
      btn.addEventListener('click', function() {
        if (currentRole !== ROLES.HEAD) return;
        const team = (getTeams() || []).find(t => String(t.id) === String(this.dataset.teamId));
        if (!team) return;
        let delta = Number(this.dataset.teamPoints);
        if (this.dataset.teamPoints === 'custom') {
          const amount = prompt(`Изменение рейтинга команды "${team.name}". Можно + и -:`, '10');
          if (amount === null) return;
          delta = Number(amount);
        }
        if (!Number.isFinite(delta) || delta === 0) { showNotification('Ошибка', 'Введите ненулевое число.', 'fa-times-circle'); return; }
        const teamsNow = getTeams();
        const target = teamsNow.find(t => String(t.id) === String(team.id));
        target.points = Math.max(0, Number(target.points || 0) + delta);
        setTeams(teamsNow);
        forceRenderAll();
        renderRoleList();
        showNotification('Рейтинг команды изменён', `${target.name}: ${delta > 0 ? '+' : ''}${delta}`, 'fa-star');
      });
    });

    if (searchEl && !searchEl.dataset.bound) {
      searchEl.dataset.bound = '1';
      searchEl.addEventListener('input', renderRoleList);
    }
    if (filterEl && !filterEl.dataset.bound) {
      filterEl.dataset.bound = '1';
      filterEl.addEventListener('change', renderRoleList);
    }
  }

  function updateAdminVisibility() {
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    document.querySelectorAll('.admin-only').forEach(el => {
      if ((el.id === 'addLTSBtn' || el.id === 'addTeamPointsDetailBtn' || el.id === 'playerRankToggleEdit') && currentRole !== ROLES.HEAD) {
        el.classList.remove('show'); el.style.display = 'none'; return;
      }
      if (isAdmin) {
        el.classList.add('show');
        if (el.id === 'matchScoreEdit' || el.id === 'matchStreamEdit' || el.id === 'bracketEditControls' || el.id === 'kdaEdit') el.style.display = 'flex';
        else if (el.id === 'serverTextEdit') el.style.display = 'block';
        else if (el.id === 'aboutAdminPanel') el.style.display = 'block';
        else if (el.classList.contains('admin-only-inline')) el.style.display = 'inline-flex';
        else el.style.display = 'flex';
      } else {
        el.classList.remove('show');
        if (el.id === 'matchScoreEdit' || el.id === 'matchStreamEdit' || el.id === 'bracketEditControls' || el.id === 'kdaEdit') el.style.display = 'none';
        else if (el.id === 'serverTextEdit') el.style.display = 'none';
        else if (el.id === 'aboutAdminPanel') el.style.display = 'none';
        else el.style.display = 'none';
      }
    });
    document.querySelectorAll('.bracket-match .match-actions-small').forEach(el => {
      el.style.display = isAdmin ? 'flex' : 'none';
    });
  }

  function updateTotalUsersCount() {
    const el = document.getElementById('totalUsersCount');
    if (el) el.textContent = 'Всего пользователей: ' + Object.keys(getUsers()).length;
  }

  function openModal(modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
  function closeModal(modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
  function showConfirm(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    pendingConfirmAction = callback;
    document.getElementById('confirmModal').classList.add('active');
  }

  function getNextMatch() {
    const matches = getMatches();
    const now = new Date();
    const upcoming = matches.filter(m => m.status === 'upcoming' || m.status === 'live');
    if (upcoming.length === 0) return null;
    let nearest = null;
    let minDiff = Infinity;
    upcoming.forEach(m => {
      if (m.dateTime) {
        const matchDate = new Date(m.dateTime);
        const diff = Math.abs(matchDate - now);
        if (diff < minDiff) { minDiff = diff; nearest = m; }
      } else if (!nearest) { nearest = m; }
    });
    if (!nearest && matches.length > 0) nearest = matches[0];
    return nearest;
  }

  function updateHeroNextMatch() {
    const match = getNextMatch();
    if (match) {
      document.getElementById('nextMatchTitle').textContent = match.teamA + '\nvs ' + match.teamB;
      document.getElementById('nextMatchTeams').classList.remove('no-match');
      document.getElementById('nextTeamA').textContent = match.teamA;
      document.getElementById('nextTeamB').textContent = match.teamB;
      document.getElementById('nextMatchLabel').textContent = match.status === 'live' ? 'Сейчас в эфире!' : 'Следующий матч';
      document.getElementById('nextMatchTimeLabel').textContent = match.dateTime ? 'СТАРТ • ' + new Date(match.dateTime).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Дата не указана';
      if (match.stream) {
        document.getElementById('heroLive').style.display = 'inline-flex';
        document.getElementById('heroLive').textContent = 'Смотреть LIVE →';
      } else {
        document.getElementById('heroLive').style.display = 'inline-flex';
        document.getElementById('heroLive').textContent = match.status === 'live' ? 'В эфире без ссылки' : 'Смотреть →';
      }
    } else {
      document.getElementById('nextMatchTitle').textContent = 'Нет матчей';
      document.getElementById('nextMatchTeams').classList.add('no-match');
      document.getElementById('nextTeamA').textContent = '—';
      document.getElementById('nextTeamB').textContent = '—';
      document.getElementById('nextMatchLabel').textContent = 'Следующий матч';
      document.getElementById('nextMatchTimeLabel').textContent = 'СТАРТ • —';
      document.getElementById('heroLive').style.display = 'none';
    }
    autoStartTimer();
  }

  function isGrandFinalMatch(match) {
    if (!match) return false;
    if (match.isGrandFinal === true) return true;
    const label = String(match.roundName || match.stage || match.name || '').toLowerCase();
    if (label.includes('гранд') || label.includes('grand final')) return true;
    try {
      const tournaments = getTournaments();
      const t = tournaments.find(x => x.name === match.tournament || x.id === match.tournament);
      const b = t && Array.isArray(t.bracket) ? t.bracket.find(x => x.isGrandFinal && samePair(x.teamA, x.teamB, match.teamA, match.teamB)) : null;
      return !!b;
    } catch (_) { return false; }
  }
  function getSeriesFormat(match) { return isGrandFinalMatch(match) ? { bestOf: 5, winsNeeded: 3, label: 'BO5' } : { bestOf: 3, winsNeeded: 2, label: 'BO3' }; }
  function parseSeriesScore(score) {
    const m = String(score || '').trim().match(/^(\d+)\s*:\s*(\d+)$/);
    if (!m) return null;
    return { a: Number(m[1]), b: Number(m[2]) };
  }
  function isValidSeriesScore(score, match, requireWinner = false) {
    const p = parseSeriesScore(score);
    if (!p || p.a < 0 || p.b < 0) return false;
    const fmt = getSeriesFormat(match);
    if (p.a >= fmt.winsNeeded && p.b >= fmt.winsNeeded) return false;
    if (p.a > fmt.winsNeeded || p.b > fmt.winsNeeded) return false;
    const finished = p.a === fmt.winsNeeded || p.b === fmt.winsNeeded;
    if (requireWinner && !finished) return false;
    return true;
  }
  function determineWinner(score, teamA, teamB, match = null) {
    const p = parseSeriesScore(score);
    if (!p) return null;
    const fmt = getSeriesFormat(match || {});
    if (p.a === fmt.winsNeeded && p.b < fmt.winsNeeded) return teamA;
    if (p.b === fmt.winsNeeded && p.a < fmt.winsNeeded) return teamB;
    return null;
  }

  // ===== СИНХРОНИЗАЦИЯ МАТЧЕЙ И ТУРНИРНОЙ СЕТКИ (ДВУСТОРОННЯЯ) =====
  let isSyncing = false;

  function normTeam(n) { return (n || '').toString().trim().toLowerCase(); }
  function isRealTeam(n) { return !!n && n !== 'TBD' && normTeam(n) !== 'tbd'; }
  function samePair(a1, b1, a2, b2) {
    const x1 = normTeam(a1), y1 = normTeam(b1), x2 = normTeam(a2), y2 = normTeam(b2);
    return (x1 === x2 && y1 === y2) || (x1 === y2 && y1 === x2);
  }
  function scoreFilled(s) { return !!s && s !== '' && s !== '0:0'; }
  function statusRank(s) { return s === 'finished' ? 3 : (s === 'live' ? 2 : 1); }
  function stamp(o) { return Number(o && o.updatedAt) || 0; }
  function touch(o) { o.updatedAt = Date.now(); }

  // Определяет, какая сторона (сетка или матч) содержит более свежие данные
  function pickFresher(bm, m) {
    const tb = stamp(bm), tm = stamp(m);
    if (tb !== tm) return tb > tm ? 'bracket' : 'match';
    const sb = statusRank(bm.status), sm = statusRank(m.status);
    if (sb !== sm) return sb > sm ? 'bracket' : 'match';
    const fb = scoreFilled(bm.score), fm = scoreFilled(m.score);
    if (fb !== fm) return fb ? 'bracket' : 'match';
    return 'match';
  }

  function syncMatchesWithBracket() {
    if (isSyncing) return false;
    isSyncing = true;
    let changed = false;
    try {
      const matches = getMatches();
      const tournaments = getTournaments();

      tournaments.forEach(tourn => {
        if (!tourn || !Array.isArray(tourn.bracket) || tourn.bracket.length === 0) return;
        const usedMatchIds = [];

        tourn.bracket.forEach(bm => {
          if (!bm) return;
          if (!isRealTeam(bm.teamA) || !isRealTeam(bm.teamB) || normTeam(bm.teamA) === normTeam(bm.teamB)) {
            // Команды ещё не определены — разрываем устаревшую связь
            if (bm.matchId) {
              const orphan = matches.find(m => m.id === bm.matchId);
              if (orphan) { delete orphan.bracketId; changed = true; }
              delete bm.matchId;
              changed = true;
            }
            return;
          }

          // 1) Поиск связанного матча: по явной связи, затем по парам команд
          let matchInList = bm.matchId ? matches.find(m => m.id === bm.matchId) : null;
          if (!matchInList) {
            matchInList = matches.find(m =>
              m.bracketId === bm.id && m.tournament === tourn.name
            );
          }
          if (!matchInList) {
            matchInList = matches.find(m =>
              m.tournament === tourn.name &&
              !usedMatchIds.includes(m.id) &&
              (!m.bracketId || m.bracketId === bm.id) &&
              samePair(m.teamA, m.teamB, bm.teamA, bm.teamB)
            );
          }

          // 2) Матча нет — создаём его в списке матчей
          if (!matchInList) {
            const winner = bm.winner || determineWinner(bm.score, bm.teamA, bm.teamB, bm);
            matchInList = {
              id: 'm' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              dateTime: bm.dateTime || (tourn.start ? tourn.start + 'T12:00' : 'Дата не указана'),
              teamA: bm.teamA,
              teamB: bm.teamB,
              score: bm.score || '0:0',
              status: bm.status || 'upcoming',
              game: tourn.game || 'Матч',
              tournament: tourn.name,
              stage: bm.roundName || '',
              stream: '',
              winner: winner || null,
              isGrandFinal: !!bm.isGrandFinal,
              bracketId: bm.id,
              updatedAt: stamp(bm) || Date.now()
            };
            matches.push(matchInList);
            bm.matchId = matchInList.id;
            changed = true;
          }

          // 3) Фиксируем взаимную связь
          if (bm.matchId !== matchInList.id) { bm.matchId = matchInList.id; changed = true; }
          if (matchInList.bracketId !== bm.id) { matchInList.bracketId = bm.id; changed = true; }
          usedMatchIds.push(matchInList.id);

          // 4) Двусторонний перенос данных
          const source = pickFresher(bm, matchInList);
          const src = source === 'bracket' ? bm : matchInList;
          const dst = source === 'bracket' ? matchInList : bm;

          const srcScore = src.score || '';
          const srcStatus = src.status || 'upcoming';
          const srcWinner = src.winner || determineWinner(srcScore, src.teamA, src.teamB, src) || null;

          if (scoreFilled(srcScore) && dst.score !== srcScore) { dst.score = srcScore; changed = true; }
          if (scoreFilled(srcScore)) { try { ensureGameForScore(matchInList.id, srcScore); } catch (e) {} }
          if (dst.status !== srcStatus) { dst.status = srcStatus; changed = true; }
          if (srcWinner && dst.winner !== srcWinner) { dst.winner = srcWinner; changed = true; }
          if (srcWinner && dst.status !== 'finished') { dst.status = 'finished'; changed = true; }

          // Команды в сетке — источник истины по составу пары
          if (matchInList.teamA !== bm.teamA || matchInList.teamB !== bm.teamB) {
            if (samePair(matchInList.teamA, matchInList.teamB, bm.teamA, bm.teamB)) {
              // тот же матч, но стороны переставлены — выравниваем счёт под сетку
              if (normTeam(matchInList.teamA) === normTeam(bm.teamB) && scoreFilled(matchInList.score)) {
                const p = (matchInList.score || '').split(':');
                if (p.length === 2) matchInList.score = (p[1] || '0') + ':' + (p[0] || '0');
              }
            }
            matchInList.teamA = bm.teamA;
            matchInList.teamB = bm.teamB;
            changed = true;
          }
          if (!matchInList.tournament) { matchInList.tournament = tourn.name; changed = true; }
          if (bm.roundName && matchInList.stage !== bm.roundName) { matchInList.stage = bm.roundName; changed = true; }
          if (!!bm.isGrandFinal !== !!matchInList.isGrandFinal) { matchInList.isGrandFinal = !!bm.isGrandFinal; changed = true; }

          // Общая метка времени, чтобы стороны не «перетягивали» друг друга
          const ts = Math.max(stamp(bm), stamp(matchInList), 1);
          if (stamp(bm) !== ts) { bm.updatedAt = ts; }
          if (stamp(matchInList) !== ts) { matchInList.updatedAt = ts; }
        });

        // 5) Матчи, чьи слоты в сетке удалены — отвязываем
        matches.forEach(m => {
          if (m.tournament === tourn.name && m.bracketId && !tourn.bracket.some(b => b && b.id === m.bracketId)) {
            delete m.bracketId;
            changed = true;
          }
        });
      });

      if (changed) {
        setMatches(matches);
        setTournaments(tournaments);
      }
    } catch (e) {
      console.error('Ошибка синхронизации сетки и матчей:', e);
    } finally {
      isSyncing = false;
    }

    if (changed) {
      renderAll();
      const activePage = document.querySelector('.page.active');
      if (activePage && activePage.id === 'tournaments' && currentTournamentId) {
        const t = getTournaments().find(x => x.id === currentTournamentId);
        if (t) renderDoubleEliminationBracket(t);
      }
    }
    return changed;
  }

  // Явно помечает элемент сетки как изменённый (приоритет при синхронизации)
  function markBracketMatchUpdated(bm) { if (bm) touch(bm); }
  // Явно помечает матч как изменённый (приоритет при синхронизации)
  function markMatchUpdated(m) { if (m) touch(m); }


  // ===== МГНОВЕННОЕ ОБНОВЛЕНИЕ =====
  function forceRenderAll() {
    renderAll();
    updateHeroNextMatch();
    syncMatchesWithBracket();
    
    const page = document.querySelector('.page.active');
    if (page) {
      if (page.id === 'tournaments' && currentTournamentId) {
        const tourn = getTournaments().find(t => t.id === currentTournamentId);
        if (tourn) renderDoubleEliminationBracket(tourn);
      }
      // Не открываем автоматически ранее выбранные команду/матч при обычном рендере.
      if (page.id === 'teams' && document.getElementById('playerDetailPage')?.classList.contains('active') && editingPlayerTeamId && editingPlayerName) {
        window.showPlayerDetail(editingPlayerTeamId, editingPlayerName);
      }
      if (page.id === 'top-players') {
        if (document.getElementById('playerDetailPage')?.classList.contains('active') && editingPlayerName) window.showPlayerDetail(editingPlayerTeamId, editingPlayerName, 'top-players');
        else renderTopPlayers();
      }
      if (page.id === 'ranking') {
        renderRanking();
      }
    }
  }

  // ===== АВТООБНОВЛЕНИЕ =====
  function startAutoUpdate() {
    if (autoUpdateInterval) { clearInterval(autoUpdateInterval); autoUpdateInterval = null; }
  }

  // ===== ОСТАЛЬНЫЕ ФУНКЦИИ РЕНДЕРА =====
  function renderTeams() {
    const teams = getTeams();
    const grid = document.getElementById('teamsGrid');
    grid.innerHTML = teams.map(t => `
      <div class="card team-card" data-team-id="${t.id}" onclick="window.showTeamDetail('${t.id}')">
        <div class="team-icon">${t.avatar ? `<img class="team-card-avatar" src="${t.avatar}" alt="${escHtml(t.name)}" loading="lazy" decoding="async" style="display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:cover;object-position:center;border-radius:inherit;">` : t.icon}</div>
        <strong>${t.name}</strong>
        <small>${t.region}</small>
        <div style="margin-top:6px;font-size:13px;color:var(--accent);font-weight:700;">⭐ ${t.points || 0}</div>
      </div>
    `).join('');
  }

  function renderRanking() {
    const teams = getTeams();
    const sorted = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0));
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    const table = document.getElementById('rankingTable');
    table.innerHTML = sorted.slice(0, 10).map((t, i) => {
      let cls = '';
      if (i === 0) cls = 'gold';
      else if (i === 1) cls = 'silver';
      else if (i === 2) cls = 'bronze';
      return `
        <div class="rank-row ${cls}">
          <div class="rank-pos">#${i+1}</div>
          <div class="rank-team">${t.name}</div>
          <div class="rank-stats">${t.wins || 0} побед</div>
          <div class="rank-points">${isRankEditMode && isAdmin ? `<input class="rank-points-input" data-team-id="${t.id}" type="number" value="${t.points || 0}" min="0" step="1">` : `${t.points || 0}`}</div>
        </div>
      `;
    }).join('');
  }

  function renderTopPlayers() {
    const allPlayers = getTopPlayersData();
    allPlayers.sort((a, b) => (b.lts || 0) - (a.lts || 0));
    const top = allPlayers.slice(0, 12);
    const grid = document.getElementById('topPlayersGrid');
    if (top.length === 0) { grid.innerHTML = '<p style="text-align:center;padding:40px 0;color:var(--muted);">Нет данных об игроках</p>'; return; }
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    grid.innerHTML = top.map((p, i) => {
      let rankClass = 'normal', avatarClass = 'normal', medalHtml = '', borderClass = '';
      if (i === 0) { rankClass = 'gold'; avatarClass = 'gold'; borderClass = 'gold-border'; medalHtml = '<div class="medal gold">🥇</div>'; }
      else if (i === 1) { rankClass = 'silver'; avatarClass = 'silver'; borderClass = 'silver-border'; medalHtml = '<div class="medal silver">🥈</div>'; }
      else if (i === 2) { rankClass = 'bronze'; avatarClass = 'bronze'; borderClass = 'bronze-border'; medalHtml = '<div class="medal bronze">🥉</div>'; }
      const ratingHtml = isPlayerRankEditMode && isAdmin ? `
        <div class="player-rating-edit"><input class="player-rating-input" data-team-id="${p.teamId}" data-player-name="${p.name}" type="number" value="${p.lts}" min="0" step="1"></div>
      ` : `<div class="player-rating">⭐ ${p.lts} LTS</div>`;
      return `
        <div class="card top-player-card ${borderClass}" data-top-player-name="${escHtml(p.name)}" data-top-team-id="${escHtml(p.teamId || '')}" role="button" tabindex="0" onclick="window.LTL_openTopPlayer(this.getAttribute('data-top-player-name'), this.getAttribute('data-top-team-id'))" style="cursor:pointer;">
          ${medalHtml}
          <div class="player-rank-num ${rankClass}">#${i+1}</div>
          <div class="player-avatar-big ${avatarClass}" style="overflow:hidden;display:grid;place-items:center;">${playerAvatarMarkup(p.name, 'player-avatar-shared', '')}</div>
          <div class="player-name">${escHtml(p.name)}</div>
          <div class="player-team-name">${escHtml(p.team)}</div>
          ${ratingHtml}
          <div class="player-stats-mini"><span>Матчи: <span>${p.matches}</span></span><span>Победы: <span>${p.wins}</span></span></div>
          ${currentRole === ROLES.HEAD ? `<button type="button" class="top-player-delete-btn" data-delete-top-player="${escHtml(p.name)}"><i class="fas fa-trash"></i> Удалить из топа</button>` : ''}
        </div>
      `;
    }).join('');

    refreshAdaptiveAvatarEffects(grid);

    if (currentRole === ROLES.HEAD) {
      grid.querySelectorAll('.top-player-delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.removePlayerFromTop(this.dataset.deleteTopPlayer || '');
        });
      });
    }

    // Карточка уже содержит inline-вызов LTL_openTopPlayer с точным teamId.
    // Не добавляем второй обработчик, чтобы профиль не открывался дважды.
    grid.querySelectorAll('.top-player-card').forEach(card => {
      card.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('button, a, input, select, textarea')) return;
        e.preventDefault();
        card.click();
      });
    });
  }

  function renderNews() {
    const news = getNews();
    const list = document.getElementById('newsList');
    let readNews = [];
    try { readNews = JSON.parse(localStorage.getItem('ltl_read_news') || '[]'); } catch(e) {}
    list.innerHTML = news.map(n => `
      <article class="card news-card ${n.featured ? 'featured' : ''} ${readNews.includes(n.id) ? 'read-news' : ''}" onclick="openFullNews(${n.id})">
        <div class="tag">${n.date} ${n.featured ? '· Редактор' : ''}</div>
        <h3>${n.title}</h3>
        <p>${n.desc}</p>
      </article>
    `).join('');
  }

  function renderAdminNews() {
    if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) return;
    const news = getNews();
    const list = document.getElementById('adminNewsList');
    list.innerHTML = news.map(n => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--paper); border-radius:12px; border:1px solid var(--line); margin-bottom:8px;">
        <div><strong>${n.title}</strong><div style="font-size:12px; color:var(--muted);">${n.date}</div></div>
        <div style="display:flex; gap:6px;">
          <button class="edit-news-admin-btn" data-id="${n.id}" style="padding:4px 12px; border-radius:8px; border:1px solid var(--line); background:var(--paper); color:var(--ink); cursor:pointer;">✏️</button>
          <button class="delete-news-admin-btn" data-id="${n.id}" style="padding:4px 12px; border-radius:8px; border:1px solid #ef5350; background:transparent; color:#ef5350; cursor:pointer;">🗑️</button>
        </div>
      </div>
    `).join('');
    
    document.querySelectorAll('.delete-news-admin-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = parseInt(this.dataset.id);
        showConfirm('Удаление новости', 'Вы уверены, что хотите удалить эту новость?', function() {
          let news = getNews();
          news = news.filter(n => n.id !== id);
          setNews(news);
          forceRenderAll();
          renderAdminNews();
          showNotification('Новость удалена', '', 'fa-trash');
        });
      });
    });
    document.querySelectorAll('.edit-news-admin-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = parseInt(this.dataset.id);
        const news = getNews().find(n => n.id === id);
        if (news) {
          document.getElementById('editNewsId').value = id;
          document.getElementById('editNewsTitleInput').value = news.title;
          document.getElementById('editNewsDesc').value = news.desc;
          document.getElementById('editNewsFull').value = news.full || news.desc;
          document.getElementById('editNewsDate').value = news.date;
          document.getElementById('editNewsFeatured').value = news.featured ? 'true' : 'false';
          document.getElementById('editNewsTitle').textContent = 'Редактировать новость';
          openModal(document.getElementById('editNewsModal'));
        }
      });
    });
  }

  function renderMatches() {
    const matches = getMatches();
    const body = document.getElementById('matchesTableBody');
    const noMsg = document.getElementById('noMatchesMessage');
    if (matches.length === 0) { body.innerHTML = ''; noMsg.style.display = 'block'; return; }
    noMsg.style.display = 'none';
    const statusMap = {
      'upcoming': '<span class="match-status upcoming">Предстоящий</span>',
      'live': '<span class="match-status live">В эфире</span>',
      'finished': '<span class="match-status finished">Завершён</span>',
      'past': '<span class="match-status past">Прошедший</span>'
    };
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    const sorted = [...matches].sort((a, b) => {
      const order = { live: 0, upcoming: 1, past: 2, finished: 3 };
      return (order[a.status] || 4) - (order[b.status] || 4);
    });
    body.innerHTML = sorted.map(m => {
      let progressHtml = `<span style="color:var(--muted);font-size:12px;">${m.score || '0:0'}</span>`;
      if (m.status !== 'upcoming' && m.status !== 'past' && m.score && m.score !== '0:0') {
        const parts = m.score.split(':');
        if (parts.length === 2) {
          const a = parseInt(parts[0]) || 0, b = parseInt(parts[1]) || 0;
          const total = a + b;
          if (total > 0) {
            const win = (a / total) * 100, loss = (b / total) * 100;
            progressHtml = `
              <div class="match-progress-wrap">
                <span class="match-progress-label loss">${m.teamA}</span>
                <div class="match-progress-track">
                  <div class="match-progress-win" style="width:${win}%;"></div>
                  <div class="match-progress-loss" style="width:${loss}%;"></div>
                </div>
                <span class="match-progress-label win">${m.teamB}</span>
              </div>
            `;
          }
        }
      }
      let actions = '';
      if (isAdmin) {
        actions = `
          <button class="edit-match-btn" data-id="${m.id}" onclick="event.stopPropagation(); openEditMatch('${m.id}')" style="padding:4px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;margin-right:4px;">✏️</button>
          <button class="delete-match-btn" data-id="${m.id}" onclick="event.stopPropagation(); deleteMatch('${m.id}')" style="padding:4px 10px;border-radius:8px;border:1px solid #ef5350;background:transparent;color:#ef5350;cursor:pointer;">🗑️</button>
        `;
      }
      return `
        <tr onclick="openMatchDetailPage('${m.id}')">
          <td>${m.dateTime || 'Дата не указана'}</td>
          <td><strong>${m.teamA}</strong></td>
          <td>${m.score || '0:0'}</td>
          <td><strong>${m.teamB}</strong></td>
          <td>${statusMap[m.status] || statusMap['upcoming']}</td>
          <td>${progressHtml}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
  }

  function renderHomeMatches() {
    const matches = getMatches();
    const live = matches.filter(m => m.status === 'live');
    const upcoming = matches.filter(m => m.status === 'upcoming');
    document.getElementById('liveCount').textContent = live.length + ' матчей';
    document.getElementById('upcomingCount').textContent = upcoming.length + ' матчей';
    
    const liveGrid = document.getElementById('liveMatchesGrid');
    const noLive = document.getElementById('noLiveMatches');
    if (live.length === 0) { liveGrid.innerHTML = ''; noLive.style.display = 'block'; }
    else {
      noLive.style.display = 'none';
      liveGrid.innerHTML = live.map(m => `
        <article class="card live-card" onclick="openMatchDetailPage('${m.id}')">
          <div class="tag">${m.game || 'Матч'}</div>
          <div class="teams"><div class="team">${m.teamA}</div><div class="score">${m.score || '0:0'}</div><div class="team">${m.teamB}</div></div>
          <div class="live-row"><span class="live-label">● В ЭФИРЕ</span><button class="watch" onclick="event.stopPropagation(); openMatchDetailPage('${m.id}')">Смотреть</button></div>
        </article>
      `).join('');
    }
    
    const upcomingGrid = document.getElementById('upcomingMatchesGrid');
    const noUpcoming = document.getElementById('noUpcomingMatches');
    if (upcoming.length === 0) { upcomingGrid.innerHTML = ''; noUpcoming.style.display = 'block'; }
    else {
      noUpcoming.style.display = 'none';
      upcomingGrid.innerHTML = upcoming.map(m => `
        <article class="card upcoming-card" onclick="openMatchDetailPage('${m.id}')" style="cursor:pointer;">
          <div class="match-time">${m.dateTime || 'Дата не указана'}</div>
          <div class="match-teams"><span>${m.teamA}</span><span style="color:var(--muted);font-size:13px;">vs</span><span>${m.teamB}</span></div>
        </article>
      `).join('');
    }
    updateAllStreams();

  }

  function renderTournaments(containerId, limit) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const tournaments = getTournaments();
    const list = limit ? tournaments.slice(0, limit) : tournaments;
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    container.innerHTML = list.map((t, i) => `
      <article class="card tournament" onclick="openTournamentDetail('${t.id}')">
        <div class="num">${String(i+1).padStart(2,'0')}</div>
        <div>
          <div class="t-name">${t.name}</div>
          <div class="details">${t.teamsCount} команд · ${t.start || 'Дата не указана'} — ${t.end || 'Дата не указана'}</div>
        </div>
        <div class="prize">${t.prize}<small>призовой фонд</small></div>
        ${isAdmin ? `
          <div class="tourn-actions">
            <button class="edit-tourn-btn" data-id="${t.id}" onclick="event.stopPropagation(); openEditTournament('${t.id}')" title="Редактировать">✏️</button>
            <button class="delete-tourn-btn" data-id="${t.id}" onclick="event.stopPropagation(); deleteTournament('${t.id}')" title="Удалить" style="border-color:#ef5350;color:#ef5350;">🗑️</button>
          </div>
        ` : ''}
      </article>
    `).join('');
  }

  function updateAboutStats() {
    document.getElementById('aboutTeamsCount').textContent = getTeams().length;
    document.getElementById('aboutPlayersCount').textContent = Object.keys(getPlayers()).length;
    document.getElementById('aboutMatchesCount').textContent = getMatches().length;
    document.getElementById('aboutTournamentsCount').textContent = getTournaments().length;
  }

  function ltlSharedRead(key, fallback = null) {
    try {
      const raw = Storage.prototype.getItem.call(window.localStorage, key);
      if (raw == null || raw === '') return fallback;
      const value = typeof ltlUnwrapStoredValue === 'function' ? ltlUnwrapStoredValue(raw) : raw;
      return (value == null || value === '') ? fallback : value;
    } catch (_) { return fallback; }
  }

  function updateBranding() {
    // Read and unwrap legacy values explicitly here as well. This avoids relying
    // on a browser-specific Storage.prototype hook for the first render.
    const siteTitle = ltlSharedRead(STORAGE_KEYS.SITE_TITLE, 'LTL | LOW TABE LEAGUE');
    const siteLogo = ltlSharedRead(STORAGE_KEYS.SITE_LOGO, null);
    const aboutText = ltlSharedRead(STORAGE_KEYS.ABOUT_TEXT, 'Киберспортивная платформа для проведения турниров, матчей и отслеживания рейтингов команд и игроков. LTL | LOW TABE LEAGUE — это место, где собираются лучшие киберспортсмены и фанаты.');
    const serverText = ltlSharedRead(STORAGE_KEYS.SERVER_TEXT, 'Добро пожаловать в LTL | LOW TABE LEAGUE — главную киберспортивную платформу!');
    const seoKeywords = ltlSharedRead(STORAGE_KEYS.SEO_KEYWORDS, 'LTL, LOW TABE LEAGUE, киберспорт, турниры, Dota 2, CS2');
    const seoDescription = ltlSharedRead(STORAGE_KEYS.SEO_DESCRIPTION, 'LTL | LOW TABE LEAGUE — киберспортивная платформа для проведения турниров и матчей');
    
    document.getElementById('siteTitle').textContent = siteTitle;
    document.getElementById('aboutTitle').textContent = siteTitle;
    document.getElementById('aboutText').textContent = aboutText;
    document.getElementById('aboutTextInput').value = aboutText;
    document.getElementById('heroText').textContent = serverText;
    document.getElementById('serverTextArea').value = serverText;
    document.getElementById('siteTitleInput').value = siteTitle;
    
    document.querySelector('meta[name="keywords"]')?.setAttribute('content', seoKeywords);
    document.querySelector('meta[name="description"]')?.setAttribute('content', seoDescription);
    
    const logoHtml = siteLogo ? `<img src="${siteLogo}" alt="Logo" class="logo-image">` : `
      <div class="logo-text">
        <span class="logo-line logo-line-1">LTL</span>
        <span class="logo-line logo-line-2"><span class="logo-plus">+</span> LOW</span>
        <span class="logo-line logo-line-3">TABE</span>
        <span class="logo-line logo-line-4">LEAGUE</span>
      </div>
    `;
    document.getElementById('brandLogo').innerHTML = logoHtml;
    document.getElementById('mobileBrandLogo').innerHTML = logoHtml;
    
    const accentColor = localStorage.getItem(STORAGE_KEYS.ACCENT_COLOR) || '#ff4d1c';
    document.getElementById('accentColor').value = accentColor;
    document.documentElement.style.setProperty('--accent', accentColor);
  }

  function renderAll() {
    renderTeams();
    renderRanking();
    renderTopPlayers();
    renderNews();
    renderMatches();
    renderHomeMatches();
    renderTournaments('homeTournaments', 3);
    renderTournaments('tournamentsList');
    updateAboutStats();
    updateBranding();
    updateTotalUsersCount();
    updateAdminVisibility();
    updateSupportBadge();
    updateOnlineCounter();
    updateHeroNextMatch();
    renderFiles(); // Новая функция для отображения файлов
  }

  // ===== БЕЗОПАСНЫЙ EMBED TWITCH / YOUTUBE =====
  // Поддерживает: https://www.twitch.tv/channel, player.twitch.tv URL,
  // youtube.com/watch?v=..., youtu.be/... и youtube.com/embed/... .
  // Twitch требует параметр parent, поэтому он берётся из текущего домена сайта.
  function ltlStreamEmbed(url) {
    const raw = String(url || '').trim();
    if (!raw) return null;
    let u;
    try { u = new URL(raw, window.location.origin); } catch (_) { return null; }
    const host = u.hostname.toLowerCase();
    const parent = window.location.hostname || 'localhost';

    // Twitch channel / player URL.
    if (host === 'twitch.tv' || host === 'www.twitch.tv') {
      const parts = u.pathname.split('/').filter(Boolean);
      const channel = parts[0];
      if (!channel || /^(directory|downloads|jobs|p|videos|search|settings)$/i.test(channel)) return null;
      return {
        kind: 'twitch',
        src: 'https://player.twitch.tv/?channel=' + encodeURIComponent(channel) +
          '&parent=' + encodeURIComponent(parent) + '&autoplay=false&muted=false'
      };
    }
    if (host === 'player.twitch.tv') {
      const channel = u.searchParams.get('channel');
      const video = u.searchParams.get('video');
      if (!channel && !video) return null;
      const q = new URLSearchParams();
      if (channel) q.set('channel', channel);
      if (video) q.set('video', video);
      q.set('parent', parent);
      q.set('autoplay', 'false');
      return { kind: 'twitch', src: 'https://player.twitch.tv/?' + q.toString() };
    }

    // YouTube compatibility retained from the old site.
    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      let videoId = '';
      if (host === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0];
      else if (u.pathname === '/watch') videoId = u.searchParams.get('v') || '';
      else if (u.pathname.startsWith('/embed/')) videoId = u.pathname.split('/')[2] || '';
      if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
      return { kind: 'youtube', src: 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=0' };
    }
    return null;
  }

  function renderStreamPlayer(url, title) {
    const root = document.getElementById('streamFullContent');
    if (!root) return;
    const embed = ltlStreamEmbed(url);
    root.replaceChildren();
    if (!embed) {
      const placeholder = document.createElement('div');
      placeholder.className = 'stream-placeholder';
      placeholder.innerHTML = '<i class="fas fa-video"></i><div class="title">Нет активной трансляции</div><div class="sub">Вставьте ссылку Twitch или YouTube в настройках трансляции</div>';
      root.appendChild(placeholder);
      return;
    }
    const active = document.createElement('div');
    active.className = 'stream-active';
    const iframe = document.createElement('iframe');
    iframe.src = embed.src;
    iframe.title = title || 'Прямая трансляция';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.loading = 'lazy';
    active.appendChild(iframe);
    const info = document.createElement('div');
    info.className = 'stream-info';
    const label = document.createElement('div');
    label.className = 'title-text';
    label.textContent = embed.kind === 'twitch' ? '🔴 Twitch — ' + (title || 'Прямая трансляция') : '▶️ YouTube — ' + (title || 'Прямая трансляция');
    info.appendChild(label);
    active.appendChild(info);
    root.appendChild(active);
  }

  function updateAllStreams() {
    const matches = getMatches();
    const liveMatch = matches.find(m => m.status === 'live');
    const globalStream = localStorage.getItem(STORAGE_KEYS.GLOBAL_STREAM) || '';
    const streamUrl = (liveMatch && liveMatch.stream) || globalStream;
    const streamTitle = liveMatch && liveMatch.stream ? (liveMatch.teamA + ' vs ' + liveMatch.teamB) : 'Трансляция';
    const dot = document.getElementById('streamDot');
    const dotMobile = document.getElementById('streamDotMobile');
    if (liveMatch || globalStream) { dot.style.display = 'inline-block'; dot.className = 'live-dot'; dotMobile.style.display = 'inline-block'; dotMobile.className = 'live-dot'; }
    else { dot.style.display = 'inline-block'; dot.className = 'live-dot offline'; dotMobile.style.display = 'inline-block'; dotMobile.className = 'live-dot offline'; }

    const widgetTitle = document.getElementById('widgetStreamTitle');
    const widgetSub = document.getElementById('widgetStreamSub');
    const widgetStatus = document.getElementById('widgetStreamStatus');
    const widgetStatusText = document.getElementById('widgetStatusText');

    if (liveMatch && liveMatch.stream) {
      widgetTitle.textContent = '📺 ' + liveMatch.teamA + ' vs ' + liveMatch.teamB;
      widgetSub.textContent = 'Прямая трансляция сейчас в эфире!';
      widgetStatus.className = 'stream-status live';
      widgetStatusText.textContent = 'LIVE';
    } else if (globalStream) {
      widgetTitle.textContent = '📺 Трансляция';
      widgetSub.textContent = 'Прямая трансляция настроена';
      widgetStatus.className = 'stream-status live';
      widgetStatusText.textContent = 'LIVE';
    } else if (liveMatch) {
      widgetTitle.textContent = '📺 ' + liveMatch.teamA + ' vs ' + liveMatch.teamB;
      widgetSub.textContent = 'Матч в эфире, но ссылка не добавлена';
      widgetStatus.className = 'stream-status live';
      widgetStatusText.textContent = 'LIVE';
    } else {
      widgetTitle.textContent = 'Нет активной трансляции';
      widgetSub.textContent = 'Нажмите, чтобы открыть страницу трансляции';
      widgetStatus.className = 'stream-status offline';
      widgetStatusText.textContent = 'Офлайн';
    }

    renderStreamPlayer(streamUrl, streamTitle);
  }

  function updateTimerDisplay() {
    const el = document.getElementById('countdown');
    if (!el) return;
    const h = Math.floor(Math.max(0,totalSeconds) / 3600);
    const m = Math.floor((Math.max(0,totalSeconds) % 3600) / 60);
    const s = Math.max(0,totalSeconds) % 60;
    el.textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function autoStartTimer() {
    if (timerInterval) clearInterval(timerInterval);
    const tick = () => {
      const match = getNextMatch();
      const el = document.getElementById('countdown');
      if (!el) return;
      if (!match) { totalSeconds = 0; el.textContent = '--:--:--'; return; }
      if (match.status === 'live') { totalSeconds = 0; el.textContent = 'LIVE'; return; }
      const when = match.dateTime ? new Date(match.dateTime).getTime() : NaN;
      if (!Number.isFinite(when)) { totalSeconds = 0; el.textContent = '--:--:--'; return; }
      totalSeconds = Math.max(0, Math.floor((when - Date.now()) / 1000));
      updateTimerDisplay();
    };
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function playerStorageKey(teamId, playerName) {
    return String(teamId || 'free') + '_' + String(playerName || '');
  }

  const TOP_PLAYERS_HIDDEN_KEY = 'ltl_hidden_top_players';

  function getHiddenTopPlayers() {
    try {
      const raw = JSON.parse(localStorage.getItem(TOP_PLAYERS_HIDDEN_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(v => String(v).toLowerCase()) : [];
    } catch (e) { return []; }
  }

  function setHiddenTopPlayers(list) {
    localStorage.setItem(TOP_PLAYERS_HIDDEN_KEY, JSON.stringify(Array.from(new Set(list.map(v => String(v).toLowerCase())))));
  }

  function isTopPlayerHidden(playerName) {
    return getHiddenTopPlayers().includes(String(playerName || '').toLowerCase());
  }

  function restorePlayerInTop(playerName) {
    const key = String(playerName || '').toLowerCase();
    if (!key) return;
    setHiddenTopPlayers(getHiddenTopPlayers().filter(v => v !== key));
  }

  window.removePlayerFromTop = function(playerName) {
    if (currentRole !== ROLES.HEAD) {
      showNotification('Доступ запрещён', 'Удалять игроков из Топа может только Глава', 'fa-lock');
      return;
    }
    const name = String(playerName || '').trim();
    if (!name) return;
    showConfirm('Удаление из Топ игроков', `Убрать игрока «${name}» из Топ игроков? Аккаунт, команда и статистика сохранятся.`, function() {
      const hidden = getHiddenTopPlayers();
      hidden.push(name);
      setHiddenTopPlayers(hidden);
      renderTopPlayers();
      showNotification('Игрок убран из Топа', `${name} больше не отображается в Топ игроков`, 'fa-trash');
    });
  };

  function ensurePlayerProfile(playerName, teamId = null, silent = true) {
    const data = getPlayerData(teamId, playerName);
    if (data) {
      if (data.teamId !== (teamId || null)) { data.teamId = teamId || null; savePlayerData(teamId || null, playerName, data); }
      return data;
    }
    if (!silent) showNotification('Игрок добавлен в топ!', playerName + ' теперь отображается в Топ игроков', 'fa-star');
    return data;
  }

  function addPlayerToTop(playerName, teamId) {
    // Добавлять в Топ можно только аккаунты с системной ролью ROLES.PLAYER.
    const users = getUsers();
    const user = users[String(playerName || '').toLowerCase()];
    if (!user || user.role !== ROLES.PLAYER) {
      renderTopPlayers();
      return null;
    }
    restorePlayerInTop(user.username);
    const data = ensurePlayerProfile(user.username, teamId || user.teamId || null, false);
    renderTopPlayers();
    return data;
  }

  function getTopPlayersData() {
    // В Топ игроков попадают ТОЛЬКО зарегистрированные аккаунты
    // с системной ролью ROLES.PLAYER. Данные из roster/playersStore
    // сами по себе больше не создают запись в рейтинге.
    const teams = getTeams();
    const users = getUsers();
    const playersStore = getPlayers();
    const result = [];
    const seen = new Set();
    const hiddenTopPlayers = new Set(getHiddenTopPlayers());

    Object.keys(users).forEach(key => {
      const user = users[key];
      if (!user || user.role !== ROLES.PLAYER || !user.username) return;

      const unique = String(user.username).toLowerCase();
      if (seen.has(unique) || hiddenTopPlayers.has(unique)) return;

      const team = teams.find(t => String(t.id) === String(user.teamId));
      const data = ensurePlayerProfile(user.username, user.teamId || null, true);
      seen.add(unique);

      result.push({
        name: user.username,
        team: team ? team.name : 'Без команды',
        teamId: team ? team.id : null,
        lts: data.lts || 0,
        rating: data.rating || 1000,
        matches: data.matches || 0,
        wins: data.wins || 0,
        losses: data.losses || 0
      });
    });

    // Чистим устаревшие профили игроков, которые больше не принадлежат
    // аккаунтам с ролью "Игрок". Саму статистику не удаляем.
    Object.keys(playersStore).forEach(key => {
      const data = playersStore[key];
      if (!data || !data.name) return;
      const unique = String(data.name).toLowerCase();
      const account = users[unique];
      if (!account || account.role !== ROLES.PLAYER) return;
      if (seen.has(unique) || hiddenTopPlayers.has(unique)) return;

      const team = teams.find(t => String(t.id) === String(account.teamId));
      seen.add(unique);
      result.push({
        name: account.username,
        team: team ? team.name : 'Без команды',
        teamId: team ? team.id : null,
        lts: data.lts || 0,
        rating: data.rating || 1000,
        matches: data.matches || 0,
        wins: data.wins || 0,
        losses: data.losses || 0
      });
    });

    return result;
  }

  function navigateTo(pageId, fromBack = false) {
    if (!pageId) return;
    if (pageId === 'profile' && !currentUser) { openModal(document.getElementById('loginModal')); return; }
    if (pageId === 'teams') {
      editingTeamId = null;
      document.getElementById('teamsGrid').style.display = 'grid';
      document.getElementById('teamDetailPage').style.display = 'none';
      document.getElementById('teamDetailPage').classList.remove('active');
      document.getElementById('playerDetailPage').classList.remove('active');
    }
    if (pageId === 'matches') {
      currentMatchId = null;
      document.querySelector('#matches .matches-table').style.display = '';
      document.getElementById('matchDetailPage').classList.remove('active');
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');
    document.querySelectorAll('#nav button, .nav-mobile button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`#nav button[data-page="${pageId}"], .nav-mobile button[data-page="${pageId}"]`).forEach(b => b.classList.add('active'));
    if (!fromBack && pageId !== 'stream') { pageHistory.push(pageId); if (pageHistory.length > 10) pageHistory.shift(); }
    document.getElementById('breadcrumb').textContent = 'LTL / ' + (document.querySelector(`#nav button[data-page="${pageId}"]`)?.textContent?.trim() || pageId.toUpperCase());
    try {
      localStorage.setItem('ltl_current_route', JSON.stringify({ page: pageId, at: Date.now() }));
    } catch(e) {}
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  // ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
  window.goToStream = function() { navigateTo('stream'); };
  window.openFullNews = function(id) {
    const news = getNews().find(n => n.id === id);
    if (!news) return;
    document.getElementById('fullNewsTitle').textContent = news.title;
    document.getElementById('fullNewsMeta').textContent = news.date + ' · Редактор';
    document.getElementById('fullNewsContent').textContent = news.full || news.desc;
    document.getElementById('newsList').style.display = 'none';
    document.getElementById('newsFull').classList.add('active');
    try {
      const read = JSON.parse(localStorage.getItem('ltl_read_news') || '[]');
      if (!read.includes(id)) read.push(id);
      localStorage.setItem('ltl_read_news', JSON.stringify(read));
      renderNews();
      document.getElementById('newsList').style.display = 'none';
    } catch(e) {}
  };
  window.deleteMatch = function(id) {
    showConfirm('Удаление матча', 'Вы уверены, что хотите удалить этот матч?', function() {
      let matches = getMatches();
      matches = matches.filter(m => m.id !== id);
      setMatches(matches);
      forceRenderAll();
      showNotification('Матч удалён', '', 'fa-trash');
    });
  };
  

  // ===== КАРТЫ МАТЧА: KDA / БАНЫ / СЧЁТ В ИГРЕ =====
  function escHtml(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function normalizeGame(g, i) {
    g = g || {};
    return {
      id: g.id || ('g' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      index: typeof g.index === 'number' ? g.index : (i + 1),
      seriesScore: g.seriesScore || '',
      mapName: g.mapName || '',
      ingameScore: g.ingameScore || '0:0',
      bansA: Array.isArray(g.bansA) ? g.bansA : (g.bansA ? String(g.bansA).split(',').map(x => x.trim()).filter(Boolean) : []),
      bansB: Array.isArray(g.bansB) ? g.bansB : (g.bansB ? String(g.bansB).split(',').map(x => x.trim()).filter(Boolean) : []),
      picksA: Array.isArray(g.picksA) ? g.picksA : (g.picksA ? String(g.picksA).split(',').map(x => x.trim()).filter(Boolean) : []),
      picksB: Array.isArray(g.picksB) ? g.picksB : (g.picksB ? String(g.picksB).split(',').map(x => x.trim()).filter(Boolean) : []),
      kda: g.kda && typeof g.kda === 'object' ? g.kda : {},
      createdAt: g.createdAt || Date.now()
    };
  }
  function loadMatchGames(matchId) {
    const games = getMatchGames(matchId).map(normalizeGame);
    games.forEach((g, i) => { g.index = i + 1; });
    return games;
  }
  // Создаёт новую карту (с чистым KDA, банами и счётом в игре) при каждом новом счёте серии
  function ensureGameForScore(matchId, newScore, opts) {
    if (!matchId || !newScore || typeof newScore !== 'string' || newScore.indexOf(':') === -1) return false;
    if (newScore.trim() === '0:0') return false;
    const games = loadMatchGames(matchId);
    if (games.some(g => g.seriesScore === newScore.trim())) return false;
    const game = normalizeGame({ seriesScore: newScore.trim(), index: games.length + 1 }, games.length);
    if (opts && opts.mapName) game.mapName = opts.mapName;
    games.push(game);
    setMatchGames(matchId, games);
    return true;
  }
  function renderMatchGames(match) {
    const wrap = document.getElementById('gamesList');
    if (!wrap || !match) return;
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    const controls = document.getElementById('gamesAdminControls');
    if (controls) controls.style.display = isAdmin ? 'flex' : 'none';
    const games = loadMatchGames(match.id);
    if (games.length === 0) {
      wrap.innerHTML = '<div style="color:var(--muted);font-size:13px;">Карт пока нет. Новая карта создаётся автоматически при каждом новом счёте серии.</div>';
      return;
    }
    const rosterA = getTeamRoster(match.teamA) || [];
    const rosterB = getTeamRoster(match.teamB) || [];
    let html = '';
    games.forEach(g => {
      const bansAHtml = g.bansA.length ? g.bansA.map(b => `<span class="game-ban">${escHtml(b)}</span>`).join('') : '<span style="color:var(--muted);font-size:12px;">—</span>';
      const bansBHtml = g.bansB.length ? g.bansB.map(b => `<span class="game-ban">${escHtml(b)}</span>`).join('') : '<span style="color:var(--muted);font-size:12px;">—</span>';
      const picksAHtml = g.picksA.length ? g.picksA.map(b => `<span class="game-pick">${escHtml(b)}</span>`).join('') : '<span style="color:var(--muted);font-size:12px;">—</span>';
      const picksBHtml = g.picksB.length ? g.picksB.map(b => `<span class="game-pick">${escHtml(b)}</span>`).join('') : '<span style="color:var(--muted);font-size:12px;">—</span>';
      let kdaHtml = '';
      const players = Object.keys(g.kda);
      const ordered = [...rosterA.filter(p => players.includes(p)), ...rosterB.filter(p => players.includes(p)), ...players.filter(p => !rosterA.includes(p) && !rosterB.includes(p))];
      if (ordered.length === 0) {
        kdaHtml = '<div style="color:var(--muted);font-size:12px;">KDA по этой карте ещё не заполнен</div>';
      } else {
        ordered.forEach(p => {
          const st = g.kda[p] || { kills: 0, deaths: 0, assists: 0 };
          kdaHtml += `<div class="game-kda"><span>${escHtml(p)}</span><span class="kda-stats">K: <span>${st.kills}</span> D: <span>${st.deaths}</span> A: <span>${st.assists}</span></span></div>`;
        });
      }
      html += `<div class="game-card" data-game="${escHtml(g.id)}">
        <div class="game-head">
          <div>
            <div class="game-title">Карта ${g.index}${g.mapName ? ' · ' + escHtml(g.mapName) : ''}</div>
            <div class="game-series">Счёт серии: ${escHtml(g.seriesScore || '—')}</div>
          </div>
          <div class="game-ingame">${escHtml(g.ingameScore || '0:0')}</div>
        </div>
        <div class="game-meta">
          <div class="cell"><div class="label">Баны ${escHtml(match.teamA)}</div><div class="value">${bansAHtml}</div></div>
          <div class="cell"><div class="label">Баны ${escHtml(match.teamB)}</div><div class="value">${bansBHtml}</div></div>
        </div>
        <div>${kdaHtml}</div>
        ${isAdmin ? `
        <div class="game-edit">
          <input type="text" id="gameMap_${escHtml(g.id)}" placeholder="Название карты" value="${escHtml(g.mapName)}" style="flex:1;min-width:120px;">
          <input type="text" id="gameScore_${escHtml(g.id)}" placeholder="Счёт в игре (13:9)" value="${escHtml(g.ingameScore)}" style="width:140px;">
          <input type="text" id="gameBansA_${escHtml(g.id)}" placeholder="Баны ${escHtml(match.teamA)} (через запятую)" value="${escHtml(g.bansA.join(', '))}" style="flex:1;min-width:120px;">
          <input type="text" id="gameBansB_${escHtml(g.id)}" placeholder="Баны ${escHtml(match.teamB)} (через запятую)" value="${escHtml(g.bansB.join(', '))}" style="flex:1;min-width:120px;">
          <button onclick="saveMatchGame('${escHtml(g.id)}')"><i class="fas fa-save"></i> Сохранить карту</button>
          <button class="danger" onclick="deleteMatchGame('${escHtml(g.id)}')"><i class="fas fa-trash"></i></button>
        </div>
        <div class="game-edit">
          <input type="text" id="gameKdaPlayer_${escHtml(g.id)}" placeholder="Игрок" style="flex:1;min-width:100px;" list="gamePlayers_${escHtml(g.id)}">
          <datalist id="gamePlayers_${escHtml(g.id)}">${[...rosterA, ...rosterB].map(p => `<option value="${escHtml(p)}"></option>`).join('')}</datalist>
          <input type="number" min="0" id="gameKdaK_${escHtml(g.id)}" placeholder="K" style="width:60px;">
          <input type="number" min="0" id="gameKdaD_${escHtml(g.id)}" placeholder="D" style="width:60px;">
          <input type="number" min="0" id="gameKdaA_${escHtml(g.id)}" placeholder="A" style="width:60px;">
          <button class="ghost" onclick="addGameKDA('${escHtml(g.id)}')"><i class="fas fa-plus"></i> KDA на карте</button>
        </div>` : ''}
      </div>`;
    });
    wrap.innerHTML = html;
  }
  window.saveMatchGame = function(gameId) {
    if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
    if (!currentMatchId) return;
    const games = loadMatchGames(currentMatchId);
    const g = games.find(x => x.id === gameId);
    if (!g) return;
    const mapEl = document.getElementById('gameMap_' + gameId);
    const scoreEl = document.getElementById('gameScore_' + gameId);
    const bansAEl = document.getElementById('gameBansA_' + gameId);
    const bansBEl = document.getElementById('gameBansB_' + gameId);
    const picksAEl = document.getElementById('gamePicksA_' + gameId);
    const picksBEl = document.getElementById('gamePicksB_' + gameId);
    // Обновляем только текущую карту: KDA и данные других карт не перезаписываются.
    if (mapEl) g.mapName = mapEl.value.trim();
    if (scoreEl) g.ingameScore = scoreEl.value.trim() || '0:0';
    if (bansAEl) g.bansA = bansAEl.value.split(',').map(x => x.trim()).filter(Boolean);
    if (bansBEl) g.bansB = bansBEl.value.split(',').map(x => x.trim()).filter(Boolean);
    if (picksAEl) g.picksA = picksAEl.value.split(',').map(x => x.trim()).filter(Boolean);
    if (picksBEl) g.picksB = picksBEl.value.split(',').map(x => x.trim()).filter(Boolean);
    g.updatedAt = Date.now();
    setMatchGames(currentMatchId, games);
    window.openMatchDetailPage(currentMatchId);
    showNotification('Карта сохранена', `Карта ${g.index}: ${g.ingameScore}`, 'fa-save');
  };
  window.addGameKDA = function(gameId) {
    if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
    if (!currentMatchId) return;
    const games = loadMatchGames(currentMatchId);
    const g = games.find(x => x.id === gameId);
    if (!g) return;
    const p = (document.getElementById('gameKdaPlayer_' + gameId) || {}).value || '';
    const player = p.trim();
    if (!player) { showNotification('Ошибка', 'Введите имя игрока', 'fa-times-circle'); return; }
    const kills = parseInt((document.getElementById('gameKdaK_' + gameId) || {}).value) || 0;
    const deaths = parseInt((document.getElementById('gameKdaD_' + gameId) || {}).value) || 0;
    const assists = parseInt((document.getElementById('gameKdaA_' + gameId) || {}).value) || 0;
    g.kda[player] = { kills, deaths, assists };
    setMatchGames(currentMatchId, games);
    window.openMatchDetailPage(currentMatchId);
    showNotification('KDA на карте добавлен', `${player}: ${kills}/${deaths}/${assists}`, 'fa-check-circle');
  };
  window.deleteMatchGame = function(gameId) {
    if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
    if (!currentMatchId) return;
    showConfirm('Удаление карты', 'Удалить эту карту вместе с её KDA и банами?', function() {
      let games = loadMatchGames(currentMatchId);
      games = games.filter(x => x.id !== gameId);
      games.forEach((g, i) => { g.index = i + 1; });
      setMatchGames(currentMatchId, games);
      window.openMatchDetailPage(currentMatchId);
      showNotification('Карта удалена', '', 'fa-trash');
    });
  };

  window.openMatchDetailPage = function(id) {
    const match = getMatches().find(m => m.id === id);
    if (!match) return;
    currentMatchId = id;
    document.getElementById('matchDetailTeamA').textContent = match.teamA;
    document.getElementById('matchDetailTeamB').textContent = match.teamB;
    document.getElementById('matchDetailScore').textContent = match.score || '0:0';
    document.getElementById('matchDetailScoreInput').value = match.score || '0:0';
    const statusMap = { 'upcoming': { text: 'Предстоящий', cls: 'upcoming' }, 'live': { text: 'В эфире', cls: 'live' }, 'finished': { text: 'Завершён', cls: 'finished' }, 'past': { text: 'Прошедший', cls: 'past' } };
    const statusInfo = statusMap[match.status] || statusMap['upcoming'];
    document.getElementById('matchDetailStatus').textContent = statusInfo.text;
    document.getElementById('matchDetailStatus').className = 'match-status-badge ' + statusInfo.cls;
    document.getElementById('matchDetailStatusText').textContent = statusInfo.text;
    document.getElementById('matchDetailDateTime').textContent = match.dateTime || 'Дата не указана';
    document.getElementById('matchDetailGame').textContent = match.game || '—';
    document.getElementById('matchDetailTournament').textContent = match.tournament || '—';
    const rosterA = getTeamRoster(match.teamA);
    const rosterB = getTeamRoster(match.teamB);
    document.getElementById('matchDetailRosterATeam').textContent = match.teamA;
    document.getElementById('matchDetailRosterBTeam').textContent = match.teamB;
    document.getElementById('matchDetailRosterA').textContent = (rosterA && rosterA.length > 0) ? rosterA.join(', ') : 'Не указаны';
    document.getElementById('matchDetailRosterB').textContent = (rosterB && rosterB.length > 0) ? rosterB.join(', ') : 'Не указаны';
    
    const kda = getKDA()[id] || {};
    const allPlayers = [...(rosterA || []), ...(rosterB || [])];
    let kdaHtml = '';
    if (rosterA && rosterA.length > 0) {
      kdaHtml += `<div class="kda-team"><div class="team-name">${match.teamA}</div>`;
      rosterA.forEach(player => {
        const stats = kda[player] || { kills: 0, deaths: 0, assists: 0 };
        kdaHtml += `<div class="kda-player"><span>${player}</span><span class="kda-stats">K: <span>${stats.kills}</span> D: <span>${stats.deaths}</span> A: <span>${stats.assists}</span></span></div>`;
      });
      kdaHtml += `</div>`;
    }
    if (rosterB && rosterB.length > 0) {
      kdaHtml += `<div class="kda-team"><div class="team-name">${match.teamB}</div>`;
      rosterB.forEach(player => {
        const stats = kda[player] || { kills: 0, deaths: 0, assists: 0 };
        kdaHtml += `<div class="kda-player"><span>${player}</span><span class="kda-stats">K: <span>${stats.kills}</span> D: <span>${stats.deaths}</span> A: <span>${stats.assists}</span></span></div>`;
      });
      kdaHtml += `</div>`;
    }
    document.getElementById('kdaGrid').innerHTML = kdaHtml;
    
    let listHtml = '';
    allPlayers.forEach(player => {
      const stats = kda[player] || { kills: 0, deaths: 0, assists: 0 };
      listHtml += `<span style="display:inline-block;margin:2px 8px 2px 0;background:var(--bg2);padding:2px 10px;border-radius:12px;border:1px solid var(--line);">
        ${player} (${stats.kills}/${stats.deaths}/${stats.assists})
      </span>`;
    });
    document.getElementById('kdaList').innerHTML = listHtml;
    
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    document.getElementById('matchScoreEdit').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('matchStreamEdit').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('kdaEdit').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('matchStreamInput').value = match.stream || '';
    document.getElementById('matchStreamCurrent').textContent = match.stream ? 'Текущая ссылка: ' + match.stream : 'Ссылка не добавлена';
    
    renderMatchGames(match);
    
    document.querySelector('#matches .matches-table').style.display = 'none';
    document.getElementById('noMatchesMessage').style.display = 'none';
    document.getElementById('matchDetailPage').classList.add('active');
  };
  
  window.showTeamDetail = function(teamId) {
    const team = getTeams().find(t => t.id === teamId);
    if (!team) return;
    editingTeamId = teamId;
    document.getElementById('teamDetailIcon').innerHTML = team.avatar ? `<img class="team-detail-avatar" src="${team.avatar}" alt="${escHtml(team.name)}" loading="lazy" decoding="async">` : team.icon;
    document.getElementById('teamDetailName').textContent = team.name;
    document.getElementById('teamDetailRegion').textContent = team.region;
    document.getElementById('teamDescription').textContent = team.description || 'Описание отсутствует.';
    document.getElementById('statWins').textContent = team.wins || 0;
    document.getElementById('statLosses').textContent = team.losses || 0;
    document.getElementById('statTotal').textContent = (team.wins || 0) + (team.losses || 0);
    document.getElementById('statPrize').textContent = team.prize || '0 ₽';
    document.getElementById('statRatingPoints').textContent = team.points || 0;
    const rosterGrid = document.getElementById('teamRosterGrid');
    if (team.roster && team.roster.length > 0) {
      rosterGrid.innerHTML = team.roster.map(player => `
        <div class="roster-item" onclick="window.showPlayerDetail('${team.id}', '${player}')">
          <div class="player-avatar" style="overflow:hidden;display:grid;place-items:center;">${playerAvatarMarkup(player, 'player-avatar-shared', '')}</div>
          <div><div class="player-name">${player}</div><div class="player-role">${getPlayerData(team.id, player).role || 'Игрок'}</div></div>
        </div>
      `).join('');
    } else {
      rosterGrid.innerHTML = '<p style="color:var(--muted);">Состав не указан</p>';
    }
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    document.getElementById('teamAdminControls').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('playerDetailPage').classList.remove('active');
    document.getElementById('teamsGrid').style.display = 'none';
    document.getElementById('teamDetailPage').style.display = 'block';
    document.getElementById('teamDetailPage').classList.add('active');
  };
  
  function mountPlayerDetail(origin) {
    const detail = document.getElementById('playerDetailPage');
    const target = origin === 'top-players' ? document.getElementById('top-players') : document.getElementById('teams');
    if (detail && target && detail.parentElement !== target) target.appendChild(detail);
  }

  window.showPlayerDetail = function(teamId, playerName, origin = 'teams') {
    playerDetailOrigin = origin;
    const backBtn = document.getElementById('backToTeamBtn');
    if (backBtn) backBtn.innerHTML = origin === 'top-players' ? '<i class="fas fa-arrow-left"></i> Назад к топу игроков' : '<i class="fas fa-arrow-left"></i> Назад к команде';
    mountPlayerDetail(origin);
    if (origin === 'teams') navigateTo('teams', true);
    else navigateTo('top-players', true);
    const team = teamId ? getTeams().find(t => String(t.id) === String(teamId)) : null;
    const data = teamId ? getPlayerData(teamId, playerName) : ensurePlayerProfile(playerName, null, true);
    document.getElementById('playerAvatarBig').innerHTML = playerAvatarMarkup(playerName, 'player-avatar-shared', '');
    document.getElementById('playerAvatarBig').style.overflow = 'hidden';
    document.getElementById('playerAvatarBig').style.display = 'grid';
    document.getElementById('playerAvatarBig').style.placeItems = 'center';
    refreshAdaptiveAvatarEffects(document.getElementById('playerDetailPage'));
    document.getElementById('playerName').textContent = playerName;
    document.getElementById('playerTeam').textContent = team ? team.name : 'Команда не найдена';
    document.getElementById('playerMatches').textContent = data.matches || 0;
    document.getElementById('playerWins').textContent = data.wins || 0;
    document.getElementById('playerLosses').textContent = data.losses || 0;
    document.getElementById('playerEarnings').textContent = data.earnings || '0 ₽';
    document.getElementById('playerRatingPoints').textContent = data.lts || 0;
    document.getElementById('playerBio').textContent = data.bio || 'Биография игрока пока не заполнена.';
    editingPlayerName = playerName;
    editingPlayerTeamId = teamId;
    const highlightsStore = getHighlights();
    const highlightKey = canonicalPlayerKey(playerName);
    const legacyHighlightKey = playerStorageKey(teamId, playerName);
    if (!highlightsStore[highlightKey] && highlightsStore[legacyHighlightKey]) {
      highlightsStore[highlightKey] = highlightsStore[legacyHighlightKey];
      delete highlightsStore[legacyHighlightKey];
      setHighlights(highlightsStore);
    }
    const highlights = highlightsStore[highlightKey] || [];
    const highlightsGrid = document.getElementById('highlightsGrid');
    if (highlights.length === 0) {
      highlightsGrid.innerHTML = '<p style="color:var(--muted); font-size:14px;">Пока нет добавленных моментов</p>';
    } else {
      highlightsGrid.innerHTML = highlights.map(h => `
        <div class="highlight-item">
          <div class="highlight-header">
            <span class="highlight-text">${h.text}</span>
            ${currentRole === ROLES.HEAD ? `<button type="button" class="highlight-delete" title="Удалить лучший момент" data-highlight-id="${h.id}" data-highlight-player="${encodeURIComponent(highlightKey)}">🗑️</button>` : ''}
          </div>
          ${h.video ? `<div class="highlight-video"><video controls preload="metadata" playsinline style="width:100%;max-height:420px;background:#000;border-radius:12px"><source src="${ltlMediaSource(h.video)}" type="${h.videoType || 'video/mp4'}">Ваш браузер не поддерживает видео.</video></div>` : ''}
        </div>
      `).join('');
    }
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    document.getElementById('playerAdminControls').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('addHighlightContainer').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('playerDetailPage').classList.add('active');
    if (origin === 'top-players') {
      document.getElementById('topPlayersGrid').style.display = 'none';
      document.querySelector('#top-players .section-head').style.display = 'none';
      document.getElementById('teamDetailPage').style.display = 'none';
      document.getElementById('teamsGrid').style.display = 'none';
    } else {
      document.getElementById('teamDetailPage').style.display = 'none';
      document.getElementById('teamsGrid').style.display = 'none';
    }
    try {
      localStorage.setItem('ltl_current_route', JSON.stringify({page:origin, nested:'player', teamId, playerName, at:Date.now()}));
    } catch(e) {}
  };
  
  window.openPlayerFromTop = function(playerName) {
    const users = getUsers();
    const user = users[String(playerName).toLowerCase()];
    const teams = getTeams();
    let team = user && user.teamId ? teams.find(t => String(t.id) === String(user.teamId)) : null;
    if (!team) team = teams.find(t => (t.roster || []).some(n => String(n).toLowerCase() === String(playerName).toLowerCase()));
    if (!team) ensurePlayerProfile(playerName, null, true);
    window.showPlayerDetail(team ? team.id : null, playerName, 'top-players');
  };


  // ===== ПЕРЕХОД ИЗ ТОПОВ ИГРОКОВ НА ЛИЧНУЮ СТРАНИЦУ =====
  // Сохраняем существующую страницу игрока и используем её из любых рейтингов.
  function openPlayerFromTop(playerName) {
    try {
      const name = String(playerName || '').trim();
      if (!name) return;

      // Используем существующий механизм страницы игрока, если он есть.
      if (typeof window.openPlayerFromMatch === 'function') {
        window.openPlayerFromMatch(name, '');
        return;
      }

      // Запасной вариант: передаём имя через route/hash, не ломая существующую логику.
      const encoded = encodeURIComponent(name);
      if (typeof window.openPlayerPage === 'function') {
        window.openPlayerPage(name);
      } else {
        window.location.hash = '#player=' + encoded;
      }
    } catch (e) {
      console.warn('Не удалось открыть страницу игрока:', e);
    }
  }

  function makeTopPlayerClickable(playerName, displayName) {
    const name = String(playerName || '').trim();
    const label = String(displayName || name);
    if (!name) return label;
    const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<a class="player-link top-player-link" href="javascript:void(0)" onclick="event.preventDefault();event.stopPropagation();openPlayerFromTop('${safeName}')" title="Открыть страницу игрока">${label}</a>`;
  }

  window.openPlayerFromMatch = function(playerName, teamName) {
    const team = getTeams().find(t => t.name === teamName);
    if (!team) { showNotification('Игрок не найден', 'Команда ' + teamName + ' не найдена', 'fa-exclamation-triangle'); return; }
    if (!team.roster.includes(playerName)) { showNotification('Игрок не найден', 'Игрок ' + playerName + ' не найден в составе команды ' + team.name, 'fa-exclamation-triangle'); return; }
    navigateTo('teams');
    window.showPlayerDetail(team.id, playerName);
  };
  
  window.openTournamentDetail = function(id) {
    const tourn = getTournaments().find(t => t.id === id);
    if (!tourn) return;
    currentTournamentId = id;
    document.getElementById('tournamentDetailName').textContent = tourn.name;
    document.getElementById('tournamentDetailMeta').textContent = tourn.game + ' · ' + tourn.teamsCount + ' команд · Double Elimination · ' + tourn.prize;
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    document.getElementById('tournamentDetailActions').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('bracketEditControls').style.display = isAdmin ? 'block' : 'none';
    isBracketEditMode = false;
    document.getElementById('bracketToggleEditBtn').textContent = '✏️ Режим редактирования';
    document.getElementById('bracketToggleEditBtn').classList.remove('active');
    
    const container = document.getElementById('bracketContainer');
    if (!tourn.bracket || tourn.bracket.length === 0) {
      tourn.bracket = generateEmptyBracket(tourn.teamsCount || 8);
      const tournaments = getTournaments();
      const idx = tournaments.findIndex(t => t.id === tourn.id);
      if (idx !== -1) { tournaments[idx] = tourn; setTournaments(tournaments); }
    }
    syncMatchesWithBracket();
    renderDoubleEliminationBracket(tourn);
    
    document.getElementById('tournamentsList').style.display = 'none';
    document.getElementById('tournamentDetailPage').classList.add('active');
  };
  
  window.openEditMatch = function(id) {
    const match = getMatches().find(m => m.id === id);
    if (!match) return;
    editingMatchId = id;
    document.getElementById('matchModalTitle').textContent = 'Редактировать матч';
    document.getElementById('editMatchId').value = id;
    document.getElementById('deleteMatchBtn').style.display = 'block';
    document.getElementById('matchDateTime').value = match.dateTime || '';
    document.getElementById('matchTeamA').value = match.teamA || '';
    document.getElementById('matchTeamB').value = match.teamB || '';
    document.getElementById('matchScore').value = match.score || '0:0';
    document.getElementById('matchStatus').value = match.status || 'upcoming';
    document.getElementById('matchTournament').value = match.tournament || '';
    document.getElementById('matchGame').value = match.game || '';
    document.getElementById('matchStream').value = match.stream || '';
    updateRostersPreview();
    openModal(document.getElementById('createMatchModal'));
  };
  
  window.openEditTournament = function(id) {
    const tourn = getTournaments().find(t => t.id === id);
    if (!tourn) return;
    editingTournamentId = id;
    
    document.getElementById('editTournamentId').value = id;
    document.getElementById('tournamentName').value = tourn.name || '';
    document.getElementById('tournamentGame').value = tourn.game || '';
    document.getElementById('tournamentTeams').value = tourn.teamsCount || 8;
    document.getElementById('tournamentStart').value = tourn.start || '';
    document.getElementById('tournamentEnd').value = tourn.end || '';
    document.getElementById('tournamentPrize').value = tourn.prize || '';
    document.getElementById('tournamentLocation').value = tourn.location || '';
    document.getElementById('tournamentDescription').value = tourn.description || '';
    document.getElementById('deleteTournamentBtn').style.display = 'block';
    document.getElementById('tournamentModalTitle').textContent = 'Редактировать турнир';
    
    openModal(document.getElementById('createTournamentModal'));
  };
  
  window.deleteTournament = function(id) {
    showConfirm('Удаление турнира', 'Вы уверены, что хотите удалить этот турнир?', function() {
      let tournaments = getTournaments();
      tournaments = tournaments.filter(t => t.id !== id);
      setTournaments(tournaments);
      forceRenderAll();
      showNotification('Турнир удалён', '', 'fa-trash');
    });
  };

  function generateEmptyBracket(teamsCount) {
    // Double Elimination flow. Winners stay in Upper Bracket; losers drop
    // into the corresponding Lower Bracket round. The winner of the Upper
    // Final goes to Grand Final A, the Lower Final winner goes to Grand Final B.
    const n = Math.max(2, Number(teamsCount) || 8);
    const rounds = Math.ceil(Math.log2(n));
    const bracket = [];
    let matchId = 1;
    const upper = {};
    const lower = {};
    const countForRound = r => Math.max(1, Math.pow(2, rounds - r));
    const upperName = r => r === 1 ? (rounds >= 4 ? '1/16' : rounds === 3 ? '1/8' : rounds === 2 ? '1/4' : 'Раунд 1')
      : r === 2 ? (rounds >= 4 ? '1/8' : '1/4')
      : r === 3 ? (rounds >= 4 ? '1/4' : '1/2')
      : r === rounds ? 'Финал верхней' : 'Раунд ' + r;

    // Upper bracket.
    for (let r = 1; r <= rounds; r++) {
      upper[r] = [];
      for (let i = 0; i < countForRound(r); i++) {
        const m = {
          id: 'u' + matchId++, round: r, roundName: upperName(r), section: 'upper',
          index: i, teamA: 'TBD', teamB: 'TBD', score: '', status: 'upcoming',
          winner: null, loser: null, isGrandFinal: false, flowVersion: 2
        };
        upper[r].push(m); bracket.push(m);
      }
    }

    // Lower bracket. For each pair of rounds the number of matches halves:
    // 8 teams -> 2,2,1,1; 16 teams -> 4,4,2,2,1,1.
    const lowerRounds = Math.max(0, rounds * 2 - 2);
    const lowerCount = r => {
      const pair = Math.ceil(r / 2);
      return Math.max(1, Math.pow(2, rounds - pair - 1));
    };
    const lowerName = r => {
      if (r === lowerRounds) return 'Финал нижней';
      return 'Раунд ' + r + ' нижней';
    };
    for (let r = 1; r <= lowerRounds; r++) {
      lower[r] = [];
      for (let i = 0; i < lowerCount(r); i++) {
        const m = {
          id: 'l' + matchId++, round: r, roundName: lowerName(r), section: 'lower',
          index: i, teamA: 'TBD', teamB: 'TBD', score: '', status: 'upcoming',
          winner: null, loser: null, isGrandFinal: false, flowVersion: 2
        };
        lower[r].push(m); bracket.push(m);
      }
    }

    const gf = {
      id: 'gf' + matchId++, round: 0, roundName: 'Гранд-финал', section: 'final', index: 0,
      teamA: 'TBD', teamB: 'TBD', score: '', status: 'upcoming', winner: null, loser: null,
      isGrandFinal: true, flowVersion: 2
    };
    bracket.push(gf);

    // Explicit flow links make advancement deterministic and prevent matches
    // from being placed into the first free slot of an unrelated round.
    const setSlot = (target, side, sourceId, sourceType) => {
      if (!target) return;
      target[side === 'A' ? 'sourceA' : 'sourceB'] = sourceId;
      target[side === 'A' ? 'sourceAType' : 'sourceBType'] = sourceType;
    };
    const getUpper = (r, i) => upper[r] && upper[r][i];
    const getLower = (r, i) => lower[r] && lower[r][i];

    for (let r = 1; r <= rounds; r++) {
      upper[r].forEach((m, i) => {
        if (r < rounds) {
          const next = getUpper(r + 1, Math.floor(i / 2));
          const side = i % 2 === 0 ? 'A' : 'B';
          m.nextWinMatchId = next.id;
          m.nextWinSide = side;
          setSlot(next, side, m.id, 'win');
        } else {
          m.nextWinMatchId = gf.id; m.nextWinSide = 'A';
          setSlot(gf, 'A', m.id, 'win');
        }
        const loserRound = r === 1 ? 1 : (2 * r - 2);
        const lm = getLower(loserRound, r === 1 ? Math.floor(i / 2) : i);
        if (lm) {
          m.nextLoseMatchId = lm.id;
          m.nextLoseSide = r === 1 ? (i % 2 === 0 ? 'A' : 'B') : (i % 2 === 0 ? 'B' : 'A');
          setSlot(lm, m.nextLoseSide, m.id, 'lose');
        }
      });
    }

    for (let r = 1; r <= lowerRounds; r++) {
      lower[r].forEach((m, i) => {
        if (r === lowerRounds) {
          m.nextWinMatchId = gf.id; m.nextWinSide = 'B';
          setSlot(gf, 'B', m.id, 'win');
        } else if (r % 2 === 1) {
          const next = getLower(r + 1, i);
          if (next) { m.nextWinMatchId = next.id; m.nextWinSide = 'A'; setSlot(next, 'A', m.id, 'win'); }
        } else {
          const next = getLower(r + 1, Math.floor(i / 2));
          const side = i % 2 === 0 ? 'A' : 'B';
          if (next) { m.nextWinMatchId = next.id; m.nextWinSide = side; setSlot(next, side, m.id, 'win'); }
        }
      });
    }
    return bracket;
  }

  function upgradeBracketFlow(tourn) {
    if (!tourn) return false;
    const old = Array.isArray(tourn.bracket) ? tourn.bracket : [];
    if (old.length && old.every(m => Number(m.flowVersion) === 2)) return false;
    const fresh = generateEmptyBracket(tourn.teamsCount || 8);
    const copyState = (dst, src) => {
      if (!src) return;
      ['teamA','teamB','score','status','winner','loser','dateTime','matchId','updatedAt'].forEach(k => {
        if (src[k] !== undefined && src[k] !== null && src[k] !== '') dst[k] = src[k];
      });
    };
    const byKey = new Map();
    old.forEach(m => {
      if (!m) return;
      const key = [m.section || '', m.round || 0, m.index ?? '', normTeam(m.teamA), normTeam(m.teamB)].join('|');
      byKey.set(key, m);
    });
    fresh.forEach((m, idx) => {
      let src = byKey.get([m.section, m.round || 0, m.index ?? '', normTeam(m.teamA), normTeam(m.teamB)].join('|'));
      if (!src) {
        src = old.find(x => x && x.section === m.section && Number(x.round || 0) === Number(m.round || 0) &&
          (m.section === 'final' || Number(x.index ?? -1) === Number(m.index ?? -2)));
      }
      if (src) copyState(m, src);
    });
    // Preserve meaningful manually entered first-round pairs when possible.
    old.filter(x => x && x.section === 'upper' && Number(x.round) === 1 && (isRealTeam(x.teamA) || isRealTeam(x.teamB))).forEach((src, i) => {
      const dst = fresh.find(x => x.section === 'upper' && Number(x.round) === 1 && Number(x.index) === i);
      if (dst) copyState(dst, src);
    });
    tourn.bracket = fresh;
    return true;
  }

  function renderDoubleEliminationBracket(tourn) {
    const container = document.getElementById('bracketContainer');
    let bracket = tourn.bracket || [];
    if (bracket.length === 0) { bracket = generateEmptyBracket(tourn.teamsCount || 8); tourn.bracket = bracket; setTournaments(getTournaments()); }
    if (upgradeBracketFlow(tourn)) { bracket = tourn.bracket; setTournaments(getTournaments()); }
    const isAdmin = currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    const teamNames = getTeams().map(t => t.name);
    const teamOptions = teamNames.map(name => `<option value="${name}">${name}</option>`).join('');
    const upperMatches = bracket.filter(m => m.section === 'upper');
    const lowerMatches = bracket.filter(m => m.section === 'lower');
    const finalMatches = bracket.filter(m => m.section === 'final');
    const upperGroups = {};
    upperMatches.forEach(m => { const key = m.roundName || 'Раунд ' + m.round; if (!upperGroups[key]) upperGroups[key] = []; upperGroups[key].push(m); });
    const lowerGroups = {};
    lowerMatches.forEach(m => { const key = m.roundName || 'Раунд ' + m.round; if (!lowerGroups[key]) lowerGroups[key] = []; lowerGroups[key].push(m); });
    let html = '<div class="bracket-horizontal">';
    Object.keys(upperGroups).forEach(roundName => {
      html += `<div class="bracket-column"><div class="column-header upper">⬆ ${roundName}</div>`;
      upperGroups[roundName].forEach(match => { html += renderBracketMatch(match, isAdmin, 'upper', teamOptions); });
      html += `</div>`;
    });
    Object.keys(lowerGroups).forEach(roundName => {
      html += `<div class="bracket-column"><div class="column-header lower">⬇ ${roundName}</div>`;
      lowerGroups[roundName].forEach(match => { html += renderBracketMatch(match, isAdmin, 'lower', teamOptions); });
      html += `</div>`;
    });
    if (finalMatches.length > 0) {
      html += `<div class="bracket-column"><div class="column-header final">🏆 Гранд-финал (BO5)</div>`;
      finalMatches.forEach(match => { html += renderBracketMatch(match, isAdmin, 'final', teamOptions); });
      html += `</div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  function renderBracketMatch(match, isAdmin, section, teamOptions) {
    const sectionClass = section === 'upper' ? 'upper' : section === 'lower' ? 'lower' : 'final';
    const teamA = match.teamA || 'TBD';
    const teamB = match.teamB || 'TBD';
    const scoreA = match.score ? match.score.split(':')[0] || '' : '';
    const scoreB = match.score ? match.score.split(':')[1] || '' : '';
    let teamAClass = '', teamBClass = '';
    if (match.status === 'finished') {
      if (match.winner === teamA) { teamAClass = 'winner'; teamBClass = 'loser'; }
      else if (match.winner === teamB) { teamAClass = 'loser'; teamBClass = 'winner'; }
    }
    let teamAHtml, teamBHtml, scoreAHtml, scoreBHtml;
    if (isAdmin && isBracketEditMode) {
      teamAHtml = `<select class="bracket-team-select" data-match="${match.id}" data-side="A">${teamOptions}</select>`;
      teamBHtml = `<select class="bracket-team-select" data-match="${match.id}" data-side="B">${teamOptions}</select>`;
      scoreAHtml = `<input class="score-input" data-match="${match.id}" data-side="A" type="text" placeholder="0" value="${scoreA}" style="width:30px;padding:2px;border:1px solid var(--line);border-radius:4px;background:var(--input-bg);color:var(--ink);text-align:center;font-weight:700;font-size:13px;">`;
      scoreBHtml = `<input class="score-input" data-match="${match.id}" data-side="B" type="text" placeholder="0" value="${scoreB}" style="width:30px;padding:2px;border:1px solid var(--line);border-radius:4px;background:var(--input-bg);color:var(--ink);text-align:center;font-weight:700;font-size:13px;">`;
    } else {
      teamAHtml = `<span class="team-name ${teamAClass}">${teamA}</span>`;
      teamBHtml = `<span class="team-name ${teamBClass}">${teamB}</span>`;
      scoreAHtml = scoreA || '—';
      scoreBHtml = scoreB || '—';
    }
    let statusHtml = '';
    if (match.status) {
      const statusText = match.status === 'live' ? '● В ЭФИРЕ' : match.status === 'finished' ? '✅ Завершён' : '⏳ ' + match.status;
      statusHtml = `<div class="match-status-small ${match.status}">${statusText}</div>`;
    }
    const formatLabel = match.isGrandFinal ? 'BO5' : 'BO3';
    let actionsHtml = '';
    if (isAdmin) {
      if (isBracketEditMode) {
        actionsHtml = `<div class="match-actions-small"><button class="save-edit" onclick="saveBracketMatch('${match.id}')" style="border-color:var(--accent);color:var(--accent);">💾</button><button class="cancel-edit" onclick="cancelBracketEdit()" style="border-color:var(--muted);color:var(--muted);">✖</button></div>`;
      } else {
        actionsHtml = `<div class="match-actions-small"><button class="edit" onclick="enterBracketEditMode()">✏️</button><button class="delete" onclick="deleteBracketMatch('${match.id}')">🗑️</button>${match.status !== 'finished' && match.teamA !== 'TBD' && match.teamB !== 'TBD' && match.teamA !== match.teamB ? `<button class="resolve" onclick="resolveMatchWithScore('${match.id}')">🏆</button>` : ''}</div>`;
      }
    }
    return `
      <div class="bracket-match ${sectionClass}">
        <div class="match-teams">${teamAHtml}<span class="match-score">${scoreAHtml}:${scoreBHtml}</span>${teamBHtml}</div>
        <div style="font-size:9px;color:var(--muted);text-align:center;margin-top:2px;">${formatLabel}</div>
        ${statusHtml}
        ${actionsHtml}
      </div>
    `;
  }

  function updateRostersPreview() {
    const teamAName = document.getElementById('matchTeamA').value;
    const teamBName = document.getElementById('matchTeamB').value;
    if (!teamAName || !teamBName || teamAName === teamBName) {
      document.getElementById('matchRostersPreview').style.display = 'none';
      return;
    }
    const rosterA = getTeamRoster(teamAName);
    const rosterB = getTeamRoster(teamBName);
    if (!rosterA && !rosterB) {
      document.getElementById('matchRostersPreview').style.display = 'none';
      return;
    }
    document.getElementById('matchRostersPreview').style.display = 'block';
    let html = '';
    if (rosterA) {
      html += `<div style="margin-bottom:6px;"><strong>${teamAName}:</strong> ${rosterA.map(p => `<a class="player-link" style="color:var(--accent);cursor:pointer;text-decoration:none;font-weight:600;" onclick="event.stopPropagation(); window.openPlayerFromMatch('${p}','${teamAName}')">${p}</a>`).join(', ')}</div>`;
    }
    if (rosterB) {
      html += `<div><strong>${teamBName}:</strong> ${rosterB.map(p => `<a class="player-link" style="color:var(--accent);cursor:pointer;text-decoration:none;font-weight:600;" onclick="event.stopPropagation(); window.openPlayerFromMatch('${p}','${teamBName}')">${p}</a>`).join(', ')}</div>`;
    }
    document.getElementById('matchRostersPreviewContent').innerHTML = html;
  }

  function populateTeamSelects() {
    const teams = getTeams();
    const options = teams.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    document.getElementById('matchTeamA').innerHTML = `<option value="">Выберите команду A</option>${options}`;
    document.getElementById('matchTeamB').innerHTML = `<option value="">Выберите команду B</option>${options}`;
  }

  function populateTournamentSelect() {
    const tournaments = getTournaments();
    const options = tournaments.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    document.getElementById('matchTournament').innerHTML = `<option value="">Выберите турнир</option>${options}`;
  }

  // НОРМАЛИЗАЦИЯ СТАРЫХ ОБЩИХ ДАННЫХ ДО ПЕРВОГО РЕНДЕРА
  // Ранние версии сайта могли оставить в localStorage обёртки вида
  // {\"value\":\"текст\",\"_ltType\":\"string\"}.
  // Нормализуем их ДО initDatabase(), чтобы интерфейс никогда не показывал сырой JSON.
  function ltlNormalizeLocalSharedState() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (ltlIsSharedKey(k)) keys.push(k);
      }
      keys.forEach((k) => {
        const raw = localStorage.getItem(k);
        const value = ltlUnwrapStoredValue(raw);
        const normalized = (typeof value === 'string') ? value : JSON.stringify(value);
        if (normalized !== raw) localStorage.setItem(k, normalized);
      });
    } catch (e) {
      console.warn('LTL local state normalization failed:', e);
    }
  }

  // Удаление устаревших записей: оставляем только команды и игроков,
  // которые реально используются текущими составами. Данные турниров/матчей не трогаем.
  function cleanupOldPlayerTeamData() {
    try {
      const rawTeams = getTeams().filter(t => t && t.id && t.name);
      const seenTeamIds = new Set(), seenTeamNames = new Set();
      const teams = rawTeams.filter(t => {
        const idKey = String(t.id);
        const nameKey = String(t.name).trim().toLowerCase();
        if (seenTeamIds.has(idKey) || seenTeamNames.has(nameKey)) return false;
        seenTeamIds.add(idKey); seenTeamNames.add(nameKey);
        t.roster = Array.from(new Set((t.roster || []).map(x => String(x).trim()).filter(Boolean)));
        return true;
      });
      const validKeys = new Set();
      teams.forEach(t => (t.roster || []).forEach(name => validKeys.add(t.id + '_' + name)));
      const players = getPlayers();
      const cleanPlayers = {};
      Object.keys(players).forEach(k => { if (validKeys.has(k)) cleanPlayers[k] = players[k]; });
      setTeams(teams);
      setPlayers(cleanPlayers);
      localStorage.setItem('ltl_cleanup_v1', new Date().toISOString());
    } catch(e) { console.warn('LTL database cleanup failed:', e); }
  }

  // ===== ЗАПУСК =====
  ltlNormalizeLocalSharedState();
  initDatabase();
  ltlBootstrapBackend();
  // Автоматическая очистка отключена: данные базы не удаляются при запуске.
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
  setTheme(savedTheme);
  
  (function() {
    const viewToggle = document.getElementById('viewToggle');
    const viewIcon = document.getElementById('viewIcon');
    const viewLabel = document.getElementById('viewLabel');
    const app = document.getElementById('app');
    const sidebar = document.querySelector('.sidebar');
    const burgerBtn = document.getElementById('burgerBtn');
    const mobileSidebar = document.getElementById('mobileSidebar');
    let isMobileView = localStorage.getItem(STORAGE_KEYS.VIEW_MODE) === 'mobile';
    function setViewMode(mobileMode) {
      isMobileView = mobileMode;
      if (mobileMode) {
        app.classList.add('mobile-view');
        viewIcon.className = 'fas fa-mobile-alt';
        viewLabel.textContent = 'Моб.';
        burgerBtn.style.display = 'block';
        sidebar.style.display = 'none';
        mobileSidebar.classList.remove('open');
        localStorage.setItem(STORAGE_KEYS.VIEW_MODE, 'mobile');
      } else {
        app.classList.remove('mobile-view');
        viewIcon.className = 'fas fa-desktop';
        viewLabel.textContent = 'ПК';
        burgerBtn.style.display = 'none';
        sidebar.style.display = 'flex';
        mobileSidebar.classList.remove('open');
        localStorage.setItem(STORAGE_KEYS.VIEW_MODE, 'desktop');
      }
    }
    setViewMode(isMobileView);
    viewToggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      setViewMode(!isMobileView);
      showNotification(isMobileView ? '📱 Мобильная версия' : '💻 Десктопная версия', isMobileView ? 'Интерфейс адаптирован для телефонов' : 'Полноценный интерфейс для компьютера', isMobileView ? 'fa-mobile-alt' : 'fa-desktop');
    });
  })();

  restoreSession().then(restored => { if (!restored) {
    loadAvatar();
    setTimeout(() => showNotification('Добро пожаловать!', 'LTL | LOW TABE LEAGUE — ваш киберспортивный центр', 'fa-bolt'), 500);
  } });

  document.addEventListener('DOMContentLoaded', function() {
    // Бургер-меню
    document.getElementById('burgerBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('mobileSidebar').classList.toggle('open');
    });
    document.addEventListener('click', function(e) {
      const mobileSidebar = document.getElementById('mobileSidebar');
      const burgerBtn = document.getElementById('burgerBtn');
      if (mobileSidebar.classList.contains('open')) {
        if (!mobileSidebar.contains(e.target) && !burgerBtn.contains(e.target)) {
          mobileSidebar.classList.remove('open');
        }
      }
    });
    
    // Навигация
    document.querySelectorAll('#nav button, .nav-mobile button').forEach(btn => {
      btn.addEventListener('click', function() {
        const pageId = this.dataset.page;
        if (pageId) {
          document.getElementById('mobileSidebar').classList.remove('open');
          navigateTo(pageId);
        }
      });
    });
    
    // Тема
    document.getElementById('themeToggle').addEventListener('click', function() {
      const current = document.documentElement.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
    
    // Вход/регистрация
    document.getElementById('loginBtn').addEventListener('click', () => openModal(document.getElementById('loginModal')));
    document.getElementById('loginIconBtn').addEventListener('click', () => openModal(document.getElementById('loginModal')));
    document.getElementById('registerBtn').addEventListener('click', () => { updateTotalUsersCount(); openModal(document.getElementById('registerModal')); });
    document.getElementById('loginMobileBtn').addEventListener('click', () => { document.getElementById('mobileSidebar').classList.remove('open'); openModal(document.getElementById('loginModal')); });
    document.getElementById('registerMobileBtn').addEventListener('click', () => { document.getElementById('mobileSidebar').classList.remove('open'); updateTotalUsersCount(); openModal(document.getElementById('registerModal')); });
    document.getElementById('closeLogin').addEventListener('click', () => closeModal(document.getElementById('loginModal')));
    document.getElementById('closeRegister').addEventListener('click', () => closeModal(document.getElementById('registerModal')));
    document.getElementById('closeConfirmModal').addEventListener('click', () => { document.getElementById('confirmModal').classList.remove('active'); pendingConfirmAction = null; });
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', function(e) {
        // Клик по пустому месту больше НЕ закрывает окно.
        // Закрытие выполняется только кнопкой X/явным действием.
        if (e.target === this) e.stopPropagation();
      });
    });
    
    // Подтверждение
    document.getElementById('confirmYes').addEventListener('click', function() {
      if (pendingConfirmAction) { pendingConfirmAction(); pendingConfirmAction = null; }
      document.getElementById('confirmModal').classList.remove('active');
    });
    document.getElementById('confirmNo').addEventListener('click', function() {
      document.getElementById('confirmModal').classList.remove('active');
      pendingConfirmAction = null;
    });
    
    // Глазик для пароля
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', function() {
        const input = this.parentElement.querySelector('input');
        if (input) {
          const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
          input.setAttribute('type', type);
          this.querySelector('i').className = type === 'password' ? 'far fa-eye' : 'far fa-eye-slash';
        }
      });
    });
    
    // Логин: проверка пароля выполняется только Supabase Auth.
    document.getElementById('loginSubmit').addEventListener('click', async function() {
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const error = document.getElementById('loginError');
      error.classList.remove('show');
      if (!username || !password) { error.textContent = 'Заполните все поля'; error.classList.add('show'); return; }
      const sb = ltlGetSupabaseClient();
      if (!sb) { error.textContent = 'Сервис авторизации недоступен'; error.classList.add('show'); return; }
      // Не зависим от локального/публичного списка пользователей: логин всегда
      // разрешается на сервере, а пароль проверяет только Supabase Auth.
      const { data: loginEmail, error: resolveError } = await sb.rpc('nexus_resolve_login', { p_username: username });
      if (resolveError || !loginEmail) { error.textContent = 'Пользователь не найден'; error.classList.add('show'); return; }
      const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email: loginEmail, password });
      if (authError) {
        error.textContent = authError.message && /email.*confirm|confirmed/i.test(authError.message)
          ? 'Подтвердите email по ссылке из письма, затем войдите снова'
          : 'Неверный логин или пароль';
        error.classList.add('show');
        return;
      }

      // Роль и профиль берём только с сервера после успешной Auth-сессии.
      const { data: myProfile, error: myProfileError } = await sb.rpc('nexus_get_my_profile');
      if (myProfileError || !myProfile || !myProfile.username) {
        await sb.auth.signOut();
        error.textContent = 'Профиль пользователя не найден. Обратитесь к администратору.';
        error.classList.add('show');
        return;
      }
      const serverUsername = String(myProfile.username);
      const serverRole = myProfile.role || ROLES.GUEST;
      ltlState[STORAGE_KEYS.USERS] = {
        ...getUsers(),
        [serverUsername.toLowerCase()]: myProfile
      };
      loginUser(serverUsername, serverRole);
      closeModal(document.getElementById('loginModal'));
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
    });
    
    // Ограничение пароля при вводе: только латинские буквы и цифры.
    ['regPassword', 'regConfirmPassword'].forEach(function(id) {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', function() {
        const clean = this.value.replace(/[^A-Za-z0-9]/g, '');
        if (this.value !== clean) this.value = clean;
      });
    });

    // Регистрация
    document.getElementById('registerSubmit').addEventListener('click', async function() {
      const nick = document.getElementById('regNick').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value.trim();
      const confirmPass = document.getElementById('regConfirmPassword').value.trim();
      const error = document.getElementById('registerError');
      const passError = document.getElementById('regPasswordError');
      error.classList.remove('show');
      passError.style.display = 'none';
      
      if (!nick || !email || !password || !confirmPass) { error.textContent = 'Заполните все поля'; error.classList.add('show'); return; }
      
      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
      if (!passwordRegex.test(password)) {
        passError.style.display = 'block';
        passError.textContent = 'Пароль: минимум 8 символов, только латинские буквы и цифры. Знаки вроде №, ;, !, @, # и пробелы запрещены.';
        return;
      }
      
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error.textContent = 'Введите корректный email'; error.classList.add('show'); return;
      }
      if (password !== confirmPass) {
        passError.style.display = 'block';
        passError.textContent = 'Пароли не совпадают';
        return;
      }
      
      const users = getUsers();
      const userKey = nick.toLowerCase();
      if (users[userKey]) { error.textContent = 'Аккаунт с таким ником уже существует'; error.classList.add('show'); return; }
      
      const sb = ltlGetSupabaseClient();
      if (!sb) { error.textContent = 'Сервис авторизации недоступен'; error.classList.add('show'); return; }
      const { data: authData, error: authError } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username: nick } }
      });
      if (authError) {
        error.textContent = authError.message || 'Не удалось создать аккаунт';
        error.classList.add('show');
        return;
      }
      const createdUser = authData?.user || null;
      if (!createdUser) {
        error.textContent = 'Supabase не вернул созданного пользователя';
        error.classList.add('show');
        return;
      }

      // Профиль создаётся серверным trigger'ом auth.users -> nexus_users.
      // Это работает и при включённом подтверждении email, когда session ещё null.
      const session = authData?.session || null;
      if (!session) {
        closeModal(document.getElementById('registerModal'));
        document.getElementById('regNick').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regConfirmPassword').value = '';
        showNotification(
          'Регистрация завершена',
          'Проверьте почту и подтвердите email. После подтверждения войдите в аккаунт.',
          'fa-envelope'
        );
        return;
      }

      const { data: myProfile, error: profileError } = await sb.rpc('nexus_get_my_profile');
      if (profileError || !myProfile || !myProfile.username) {
        await sb.auth.signOut();
        error.textContent = 'Аккаунт создан, но профиль ещё не доступен. Попробуйте войти через несколько секунд.';
        error.classList.add('show');
        return;
      }

      const serverUsername = String(myProfile.username);
      const serverRole = myProfile.role || ROLES.GUEST;
      ltlState[STORAGE_KEYS.USERS] = {
        ...getUsers(),
        [serverUsername.toLowerCase()]: myProfile
      };
      loginUser(serverUsername, serverRole);
      closeModal(document.getElementById('registerModal'));
      document.getElementById('regNick').value = '';
      document.getElementById('regEmail').value = '';
      document.getElementById('regPassword').value = '';
      document.getElementById('regConfirmPassword').value = '';
      updateTotalUsersCount();
      updateUserOnline();
      showNotification('Аккаунт создан!', 'Добро пожаловать, ' + serverUsername + '!', 'fa-user-plus');
    });
    
    // Переходы между входом и регистрацией.
    document.getElementById('switchToRegister').addEventListener('click', function(e) {
      e.preventDefault();
      closeModal(document.getElementById('loginModal'));
      updateTotalUsersCount();
      openModal(document.getElementById('registerModal'));
    });
    document.getElementById('switchToLogin').addEventListener('click', function(e) {
      e.preventDefault();
      closeModal(document.getElementById('registerModal'));
      openModal(document.getElementById('loginModal'));
    });

    // ===== УПРАВЛЕНИЕ СОСТАВАМИ =====
    function canManageRosters() {
      return currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    }

    function populateRosterManagementSelects() {
      const playerSelect = document.getElementById('rosterPlayerSelect');
      const teamSelect = document.getElementById('rosterTeamSelect');
      if (!playerSelect || !teamSelect) return;

      const users = getUsers();
      const teams = getTeams();
      const rosterNames = new Set();
      teams.forEach(team => (team.roster || []).forEach(name => rosterNames.add(String(name).toLowerCase())));

      const candidates = Object.keys(users)
        .map(key => users[key])
        .filter(user => user && user.role !== ROLES.HEAD && !rosterNames.has(String(user.username || '').toLowerCase()))
        .sort((a,b) => String(a.username).localeCompare(String(b.username), 'ru'));

      playerSelect.innerHTML = candidates.length
        ? '<option value="">Выберите игрока</option>' + candidates.map(user => `<option value="${String(user.username).replace(/"/g,'&quot;')}">${String(user.username).replace(/</g,'&lt;')}</option>`).join('')
        : '<option value="">Нет свободных игроков</option>';

      teamSelect.innerHTML = teams.length
        ? '<option value="">Выберите команду</option>' + teams.map(team => `<option value="${String(team.id).replace(/"/g,'&quot;')}">${String(team.name).replace(/</g,'&lt;')}</option>`).join('')
        : '<option value="">Нет доступных команд</option>';
    }

    function openRosterManagement() {
      if (!canManageRosters()) {
        showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock');
        return;
      }
      populateRosterManagementSelects();
      const error = document.getElementById('rosterManageError');
      error.classList.remove('show');
      error.textContent = '';
      openModal(document.getElementById('manageRosterModal'));
    }

    function addRegisteredPlayerToTeam(username, teamId) {
      if (!canManageRosters()) {
        showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock');
        return false;
      }

      const users = getUsers();
      const userKey = String(username || '').toLowerCase();
      const user = users[userKey];
      if (!user) {
        showNotification('Ошибка', 'Пользователь не найден', 'fa-times-circle');
        return false;
      }

      const teams = getTeams();
      const targetTeam = teams.find(team => String(team.id) === String(teamId));
      if (!targetTeam) {
        showNotification('Ошибка', 'Команда не найдена', 'fa-times-circle');
        return false;
      }

      // Один аккаунт — максимум в одной команде. Старую принадлежность снимаем только при ручном назначении.
      teams.forEach(team => {
        team.roster = Array.isArray(team.roster) ? team.roster.filter(name => String(name).toLowerCase() !== userKey) : [];
      });
      targetTeam.roster.push(user.username);

      // Сам факт назначения в состав переводит обычного зарегистрированного пользователя в игроки.
      if (user.role === ROLES.GUEST) user.role = ROLES.PLAYER;
      user.teamId = targetTeam.id;
      users[userKey] = user;

      setTeams(teams);
      setUsers(users);
      addPlayerToTop(user.username, targetTeam.id);
      renderTeams();
      renderTopPlayers();
      if (typeof forceRenderAll === 'function') forceRenderAll();

      showNotification('Игрок добавлен', user.username + ' добавлен в ' + targetTeam.name, 'fa-user-plus');
      return true;
    }

    document.getElementById('manageRostersBtn')?.addEventListener('click', openRosterManagement);
    document.getElementById('closeManageRoster')?.addEventListener('click', () => closeModal(document.getElementById('manageRosterModal')));
    document.getElementById('saveRosterPlayerBtn')?.addEventListener('click', function() {
      const username = document.getElementById('rosterPlayerSelect').value;
      const teamId = document.getElementById('rosterTeamSelect').value;
      const error = document.getElementById('rosterManageError');
      error.classList.remove('show');
      if (!username || !teamId) {
        error.textContent = 'Выберите игрока и команду';
        error.classList.add('show');
        return;
      }
      if (addRegisteredPlayerToTeam(username, teamId)) {
        closeModal(document.getElementById('manageRosterModal'));
        populateRosterManagementSelects();
      }
    });

    // Выход
    document.getElementById('profileLogoutBtn').addEventListener('click', function() {
      showConfirm('Выход из аккаунта', 'Вы уверены, что хотите выйти?', logoutUser);
    });
    document.getElementById('mobileLogoutBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      showConfirm('Выход из аккаунта', 'Вы уверены, что хотите выйти?', function() { logoutUser(); document.getElementById('mobileSidebar').classList.remove('open'); });
    });
    document.getElementById('userProfile').addEventListener('click', function() { navigateTo('profile'); });
    document.getElementById('mobileUserProfile').addEventListener('click', function() {
      document.getElementById('mobileSidebar').classList.remove('open');
      navigateTo('profile');
    });
    document.getElementById('notifClose').addEventListener('click', function() {
      document.getElementById('notification').classList.remove('show');
      if (notificationTimeout) clearTimeout(notificationTimeout);
    });

    // Кнопка регистрации команды → Google Forms
    document.getElementById('teamRegisterBtn').addEventListener('click', function() {
      window.open('https://forms.gle/3UhCSMnpdnb3Bhzu5', '_blank');
    });

    function canManageSupportChat() {
      return currentRole === ROLES.ADMIN || currentRole === ROLES.HEAD;
    }

    function populateSupportPlayerSelects() {
      const players = [];
      getTeams().forEach(team => (team.roster || []).forEach(name => {
        if (!players.some(p => p.name === name)) players.push({name, team: team.name});
      }));
      const html = '<option value="">Выберите игрока</option>' + players.map(p => `<option value="${String(p.name).replace(/"/g,'&quot;')}">${p.name} — ${p.team}</option>`).join('');
      const admin = canManageSupportChat();
      const adminSelect = document.getElementById('supportAdminTargetPlayer');
      if (adminSelect) adminSelect.innerHTML = html;
      const userSelect = document.getElementById('supportTargetPlayer');
      if (userSelect) {
        userSelect.innerHTML = admin ? html : '<option value="">Мой аккаунт</option>';
        userSelect.disabled = !admin;
        userSelect.closest('.support-target-row')?.classList.toggle('support-admin-only', !admin);
        if (!admin && currentUser) userSelect.value = '';
      }
    }

    // Чат поддержки — отдельные диалоги по игрокам
    document.getElementById('supportChatBtn').addEventListener('click', function() {
      populateSupportPlayerSelects();
      const messages = getSupportMessages();
      const target = document.getElementById('supportTargetPlayer')?.value || currentUser || '';
      const chatMessages = document.getElementById('supportChatMessages');
      const thread = messages.filter(msg => (msg.player || msg.username) === target || (!target && msg.username === currentUser));
      chatMessages.innerHTML = thread.slice().reverse().map(msg => `
        <div style="padding:6px 10px;background:var(--paper);border-radius:8px;border:1px solid var(--line);margin-bottom:4px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
            <strong style="color:var(--ink);">${msg.from || msg.username}</strong><span>${msg.date}</span>
          </div>
          <div style="font-size:13px;margin-top:2px;">${msg.text}</div>
        </div>`).join('') || '<div style="color:var(--muted);text-align:center;padding:30px;">Сообщений пока нет</div>';
      chatMessages.scrollTop = chatMessages.scrollHeight;
      openModal(document.getElementById('supportChatModal'));
    });
    document.getElementById('supportTargetPlayer').addEventListener('change', function() {
      const messages = getSupportMessages();
      const target = this.value || currentUser || '';
      const chatMessages = document.getElementById('supportChatMessages');
      const thread = messages.filter(msg => (msg.player || msg.username) === target);
      chatMessages.innerHTML = thread.slice().reverse().map(msg => `<div style="padding:6px 10px;background:var(--paper);border-radius:8px;border:1px solid var(--line);margin-bottom:4px;"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);"><strong>${msg.from || msg.username}</strong><span>${msg.date}</span></div><div style="font-size:13px;margin-top:2px;">${msg.text}</div></div>`).join('') || '<div style="color:var(--muted);text-align:center;padding:30px;">Сообщений пока нет</div>';
    });
    document.getElementById('closeSupportChatModal').addEventListener('click', () => closeModal(document.getElementById('supportChatModal')));
    document.getElementById('supportChatSendBtn').addEventListener('click', function() {
      const text = document.getElementById('supportChatInput').value.trim();
      if (!text) return;
      const target = document.getElementById('supportTargetPlayer')?.value || currentUser || 'Гость';
      const messages = getSupportMessages();
      messages.push({id:Date.now(), username:currentUser || 'Гость', player:target, from:currentUser || 'Гость', to:'support', text, date:new Date().toLocaleString('ru-RU'), read:false});
      setSupportMessages(messages);
      document.getElementById('supportChatInput').value = '';
      updateSupportBadge();
      showNotification('Сообщение отправлено!', 'Диалог с ' + target, 'fa-check-circle');
    });
    document.getElementById('supportChatInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('supportChatSendBtn').click();
    });

    document.getElementById('supportChatBtn').addEventListener('dblclick', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) {
        showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock');
        return;
      }
      populateSupportPlayerSelects();
      const messages = getSupportMessages();
      const list = document.getElementById('supportAdminMessagesList');
      list.innerHTML = messages.length ? messages.slice().reverse().map(msg => `
        <div style="padding:10px 14px;background:var(--paper);border-radius:10px;border:1px solid var(--line);margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);">
            <strong style="color:var(--ink);">${msg.player || msg.username}</strong><span>${msg.date}</span>
          </div>
          <div style="margin-top:4px;font-size:14px;">${msg.text}</div>
          <div class="support-message-actions"><button data-support-player="${String(msg.player || msg.username).replace(/"/g,'&quot;')}">Ответить этому игроку</button></div>
        </div>`).join('') : '<p style="color:var(--muted);text-align:center;padding:20px;">Сообщений пока нет</p>';
      messages.forEach(m => m.read = true);
      setSupportMessages(messages);
      updateSupportBadge();
      list.querySelectorAll('[data-support-player]').forEach(btn => btn.addEventListener('click', function() {
        document.getElementById('supportAdminTargetPlayer').value = this.dataset.supportPlayer;
        document.getElementById('supportAdminReplyInput').focus();
      }));
      openModal(document.getElementById('supportAdminModal'));
    });
    document.getElementById('closeSupportAdminModal').addEventListener('click', () => closeModal(document.getElementById('supportAdminModal')));
    document.getElementById('supportAdminReplyBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) return;
      const target = document.getElementById('supportAdminTargetPlayer').value;
      const text = document.getElementById('supportAdminReplyInput').value.trim();
      if (!target || !text) { showNotification('Ошибка','Выберите игрока и введите ответ','fa-times-circle'); return; }
      const messages = getSupportMessages();
      messages.push({id:Date.now(), username:target, player:target, from:'Администрация', to:target, text, date:new Date().toLocaleString('ru-RU'), read:false});
      setSupportMessages(messages);
      document.getElementById('supportAdminReplyInput').value = '';
      showNotification('Ответ отправлен', target, 'fa-reply');
    });
    document.getElementById('clearSupportAdminBtn').addEventListener('click', function() {
      showConfirm('Очистить сообщения', 'Вы уверены, что хотите удалить все сообщения?', function() {
        setSupportMessages([]);
        updateSupportBadge();
        document.getElementById('supportAdminMessagesList').innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">Сообщений пока нет</p>';
        showNotification('Сообщения очищены', '', 'fa-trash');
      });
    });

    // Короткое название команды: максимум 5 символов, включая вставку из буфера.
    ['newTeamIcon','editTeamIcon'].forEach(function(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('maxlength', '5');
      el.addEventListener('input', function() { this.value = this.value.slice(0, 5).toUpperCase(); });
    });

    // Кнопки создания
    document.getElementById('createTeamBtn').addEventListener('click', function() {
      openModal(document.getElementById('createTeamModal'));
    });
    document.getElementById('closeCreateTeamModal').addEventListener('click', () => { document.getElementById('newTeamAvatarFile').value=''; closeModal(document.getElementById('createTeamModal')); });
    document.getElementById('saveTeamBtn').addEventListener('click', async function() {
      const name = document.getElementById('newTeamName').value.trim();
      if (!name) { showNotification('Ошибка', 'Введите название команды', 'fa-times-circle'); return; }
      const teams = getTeams();
      const newTeam = {
        id: 'team_' + Date.now(),
        name: name,
        region: document.getElementById('newTeamRegion').value.trim() || 'Не указан',
        icon: document.getElementById('newTeamIcon').value.trim().toUpperCase().slice(0, 5) || name.substring(0, 5).toUpperCase(),
        description: document.getElementById('newTeamDesc').value.trim() || 'Новая команда на платформе.',
        roster: document.getElementById('newTeamRoster').value.trim().split(',').map(s => s.trim()).filter(Boolean) || ['Игрок 1', 'Игрок 2', 'Игрок 3'],
        wins: parseInt(document.getElementById('newTeamWins').value) || 0,
        losses: parseInt(document.getElementById('newTeamLosses').value) || 0,
        prize: document.getElementById('newTeamPrize').value.trim() || '0 ₽',
        points: 0,
        avatar: null
      };
      const avatarFile = document.getElementById('newTeamAvatarFile')?.files?.[0];
      if (avatarFile) {
        if (!avatarFile.type.startsWith('image/')) { showNotification('Ошибка', 'Аватар команды должен быть изображением', 'fa-times-circle'); return; }
        if (avatarFile.size > 5 * 1024 * 1024) { showNotification('Ошибка', 'Аватар команды не больше 5MB', 'fa-times-circle'); return; }
        try {
          const uploaded = await ltlUploadMedia(avatarFile, 'teams/' + ltlSafeFileName(newTeam.id));
          newTeam.avatar = uploaded.url;
        } catch (err) {
          showNotification('Ошибка загрузки', 'Не удалось загрузить аватар команды: ' + err.message, 'fa-times-circle');
          return;
        }
      }
      teams.push(newTeam);
      setTeams(teams);
      forceRenderAll();
      document.getElementById('newTeamAvatarFile').value = '';
      closeModal(document.getElementById('createTeamModal'));
      showNotification('Команда создана!', name, 'fa-users');
    });

    // Навигация назад
    document.getElementById('newsBackBtn').addEventListener('click', function() {
      document.getElementById('newsFull').classList.remove('active');
      document.getElementById('newsList').style.display = 'grid';
    });
    document.getElementById('backToMatches').addEventListener('click', function() {
      document.getElementById('matchDetailPage').classList.remove('active');
      document.querySelector('#matches .matches-table').style.display = 'table';
      document.getElementById('noMatchesMessage').style.display = getMatches().length === 0 ? 'block' : 'none';
    });
    document.getElementById('backToTournaments').addEventListener('click', function() {
      document.getElementById('tournamentDetailPage').classList.remove('active');
      document.getElementById('tournamentsList').style.display = 'grid';
      currentTournamentId = null;
      isBracketEditMode = false;
    });
    document.getElementById('backToTeams').addEventListener('click', function() {
      document.getElementById('teamDetailPage').classList.remove('active');
      document.getElementById('playerDetailPage').classList.remove('active');
      document.getElementById('teamDetailPage').style.display = 'none';
      document.getElementById('teamsGrid').style.display = 'grid';
    });
    document.getElementById('backToTeamBtn').addEventListener('click', function() {
      document.getElementById('playerDetailPage').classList.remove('active');
      document.getElementById('playerDetailPage').style.display = 'none';
      if (playerDetailOrigin === 'top-players') {
        document.getElementById('topPlayersGrid').style.display = 'grid';
        document.querySelector('#top-players .section-head').style.display = 'flex';
        navigateTo('top-players', true);
      } else {
        document.getElementById('teamDetailPage').style.display = 'block';
        document.getElementById('teamDetailPage').classList.add('active');
      }
    });
    document.getElementById('closeMatchModal').addEventListener('click', () => closeModal(document.getElementById('createMatchModal')));
    document.getElementById('createMatchModal').addEventListener('click', function(e) {
      if (e.target === this) closeModal(this);
    });

    // Новости
    document.getElementById('addNewsBtn').addEventListener('click', function() {
      document.getElementById('editNewsId').value = '';
      document.getElementById('editNewsTitle').textContent = 'Добавить новость';
      document.getElementById('editNewsTitleInput').value = '';
      document.getElementById('editNewsDesc').value = '';
      document.getElementById('editNewsFull').value = '';
      document.getElementById('editNewsDate').value = new Date().toLocaleDateString('ru-RU');
      document.getElementById('editNewsFeatured').value = 'false';
      document.getElementById('deleteEditNewsBtn').style.display = 'none';
      openModal(document.getElementById('editNewsModal'));
    });
    document.getElementById('closeEditNewsModal').addEventListener('click', () => closeModal(document.getElementById('editNewsModal')));
    document.getElementById('saveEditNewsBtn').addEventListener('click', function() {
      const id = document.getElementById('editNewsId').value;
      const title = document.getElementById('editNewsTitleInput').value.trim();
      const desc = document.getElementById('editNewsDesc').value.trim();
      if (!title || !desc) { showNotification('Ошибка', 'Заполните заголовок и описание', 'fa-times-circle'); return; }
      const newsData = {
        title: title,
        desc: desc,
        full: document.getElementById('editNewsFull').value.trim() || desc,
        date: document.getElementById('editNewsDate').value.trim() || new Date().toLocaleDateString('ru-RU'),
        featured: document.getElementById('editNewsFeatured').value === 'true'
      };
      let news = getNews();
      if (id) {
        const index = news.findIndex(n => n.id === parseInt(id));
        if (index !== -1) { news[index] = { ...news[index], ...newsData }; showNotification('Новость обновлена!', title, 'fa-edit'); }
      } else {
        news.push({ id: Date.now(), ...newsData });
        showNotification('Новость добавлена!', title, 'fa-newspaper');
      }
      setNews(news);
      forceRenderAll();
      renderAdminNews();
      closeModal(document.getElementById('editNewsModal'));
    });
    document.getElementById('deleteEditNewsBtn').addEventListener('click', function() {
      const id = document.getElementById('editNewsId').value;
      if (id) {
        showConfirm('Удаление новости', 'Вы уверены, что хотите удалить эту новость?', function() {
          let news = getNews();
          news = news.filter(n => n.id !== parseInt(id));
          setNews(news);
          forceRenderAll();
          renderAdminNews();
          closeModal(document.getElementById('editNewsModal'));
          showNotification('Новость удалена', '', 'fa-trash');
        });
      }
    });

    // Текст на сервере
    document.getElementById('saveServerText').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      const text = document.getElementById('serverTextArea').value.trim();
      if (text) { 
        localStorage.setItem(STORAGE_KEYS.SERVER_TEXT, text); 
        document.getElementById('heroText').textContent = text; 
        showNotification('Текст обновлён!', 'Изменения видны всем пользователям', 'fa-save');
        forceRenderAll();
      }
    });

    // ===== УЛУЧШЕННАЯ ПАНЕЛЬ "О САЙТЕ" =====
    // Вкладки
    document.querySelectorAll('#aboutTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#aboutTabs .tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const tabId = this.dataset.tab;
        document.querySelectorAll('.about-admin-panel .tab-content').forEach(tc => tc.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');
      });
    });

    // Загрузка логотипа
    document.getElementById('logoUploadArea').addEventListener('click', function() {
      document.getElementById('logoUploadInput').click();
    });
    document.getElementById('logoUploadArea').addEventListener('dragover', function(e) {
      e.preventDefault();
      this.style.borderColor = 'var(--accent)';
    });
    document.getElementById('logoUploadArea').addEventListener('dragleave', function(e) {
      e.preventDefault();
      this.style.borderColor = 'var(--line)';
    });
    document.getElementById('logoUploadArea').addEventListener('drop', function(e) {
      e.preventDefault();
      this.style.borderColor = 'var(--line)';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        document.getElementById('logoUploadInput').files = e.dataTransfer.files;
        previewLogo(file);
      }
    });
    document.getElementById('logoUploadInput').addEventListener('change', function(e) {
      const file = this.files[0];
      if (file) previewLogo(file);
    });

    function previewLogo(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('logoPreviewImg').src = e.target.result;
        document.getElementById('logoPreview').style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    // Загрузка логотипа
    document.getElementById('uploadLogoBtn').addEventListener('click', function() {
      document.getElementById('logoUploadInput').click();
    });

    // Сброс логотипа
    document.getElementById('resetLogoBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      const oldLogo = localStorage.getItem(STORAGE_KEYS.SITE_LOGO);
      localStorage.removeItem(STORAGE_KEYS.SITE_LOGO);
      if (oldLogo && oldLogo.indexOf('/storage/v1/object/public/ltl-media/') >= 0) ltlDeleteMediaUrl(oldLogo);
      document.getElementById('logoUploadInput').value = '';
      document.getElementById('logoPreview').style.display = 'none';
      updateBranding();
      showNotification('Логотип сброшен', 'Используется текстовый логотип', 'fa-undo');
      forceRenderAll();
    });

    // ===== НОВАЯ ФУНКЦИОНАЛЬНОСТЬ: ЗАГРУЗКА ФАЙЛОВ (PDF, PNG, JPG) =====
    document.getElementById('fileUploadArea').addEventListener('click', function() {
      document.getElementById('fileUploadInput').click();
    });
    document.getElementById('fileUploadArea').addEventListener('dragover', function(e) {
      e.preventDefault();
      this.style.borderColor = 'var(--accent)';
    });
    document.getElementById('fileUploadArea').addEventListener('dragleave', function(e) {
      e.preventDefault();
      this.style.borderColor = 'var(--line)';
    });
    document.getElementById('fileUploadArea').addEventListener('drop', function(e) {
      e.preventDefault();
      this.style.borderColor = 'var(--line)';
      const file = e.dataTransfer.files[0];
      if (file) {
        document.getElementById('fileUploadInput').files = e.dataTransfer.files;
        handleFileUpload(file);
      }
    });
    document.getElementById('fileUploadInput').addEventListener('change', function(e) {
      const file = this.files[0];
      if (file) handleFileUpload(file);
    });

    function handleFileUpload(file) {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) {
        showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock');
        return;
      }
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        showNotification('Ошибка', 'Разрешены только PDF, PNG, JPG, GIF, WEBP', 'fa-times-circle');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showNotification('Ошибка', 'Максимальный размер файла 10MB', 'fa-times-circle');
        return;
      }
      const reader = new FileReader();
      reader.onload = function(e) {
        const files = getFiles();
        files.push({
          name: file.name,
          type: file.type,
          size: file.size,
          data: e.target.result,
          uploaded: Date.now()
        });
        setFiles(files);
        renderFiles();
        showNotification('Файл загружен!', file.name, 'fa-check-circle');
      };
      reader.readAsDataURL(file);
      document.getElementById('fileUploadInput').value = '';
    }

    document.getElementById('uploadFileBtn').addEventListener('click', function() {
      document.getElementById('fileUploadInput').click();
    });

    document.getElementById('clearFilesBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) {
        showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock');
        return;
      }
      showConfirm('Очистить все файлы', 'Вы уверены, что хотите удалить все загруженные файлы?', function() {
        setFiles([]);
        renderFiles();
        showNotification('Все файлы удалены', '', 'fa-trash');
      });
    });

    // Сохранение всех настроек сайта
    document.getElementById('saveSiteSettingsBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      
      const newTitle = document.getElementById('siteTitleInput').value.trim();
      if (newTitle) { localStorage.setItem(STORAGE_KEYS.SITE_TITLE, newTitle); }
      
      const serverText = document.getElementById('serverTextArea').value.trim();
      if (serverText) { localStorage.setItem(STORAGE_KEYS.SERVER_TEXT, serverText); }
      
      const aboutText = document.getElementById('aboutTextInput').value.trim();
      if (aboutText) { localStorage.setItem(STORAGE_KEYS.ABOUT_TEXT, aboutText); }
      
      const seoKeywords = document.getElementById('seoKeywords').value.trim();
      if (seoKeywords) { localStorage.setItem(STORAGE_KEYS.SEO_KEYWORDS, seoKeywords); }
      
      const seoDescription = document.getElementById('seoDescription').value.trim();
      if (seoDescription) { localStorage.setItem(STORAGE_KEYS.SEO_DESCRIPTION, seoDescription); }
      
      const accentColor = document.getElementById('accentColor').value;
      if (accentColor) { 
        localStorage.setItem(STORAGE_KEYS.ACCENT_COLOR, accentColor);
        document.documentElement.style.setProperty('--accent', accentColor);
      }
      
      const file = document.getElementById('logoUploadInput').files[0];
      if (file) {
        if (!file.type.startsWith('image/')) { showStatusMessage('❌ Выберите изображение.', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showStatusMessage('❌ Логотип больше 5MB.', 'error'); return; }
        (async () => {
          try {
            const oldLogo = localStorage.getItem(STORAGE_KEYS.SITE_LOGO);
            const uploaded = await ltlUploadMedia(file, 'site');
            localStorage.setItem(STORAGE_KEYS.SITE_LOGO, uploaded.url);
            if (oldLogo && oldLogo !== uploaded.url && oldLogo.indexOf('/storage/v1/object/public/ltl-media/') >= 0) ltlDeleteMediaUrl(oldLogo);
            updateBranding();
            showStatusMessage('✅ Логотип сохранён для всех пользователей!', 'success');
            forceRenderAll();
          } catch (err) { showStatusMessage('❌ Не удалось сохранить логотип: ' + err.message, 'error'); }
        })();
      } else {
        updateBranding();
        showStatusMessage('✅ Все настройки успешно сохранены!', 'success');
        forceRenderAll();
      }
    });

    // Сброс всех настроек
    document.getElementById('resetAllSettingsBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      showConfirm('Сброс настроек', 'Вы уверены, что хотите сбросить все настройки сайта к стандартным?', function() {
        localStorage.removeItem(STORAGE_KEYS.SITE_TITLE);
        const oldLogoToDelete = localStorage.getItem(STORAGE_KEYS.SITE_LOGO);
        localStorage.removeItem(STORAGE_KEYS.SITE_LOGO);
        if (oldLogoToDelete && oldLogoToDelete.indexOf('/storage/v1/object/public/ltl-media/') >= 0) ltlDeleteMediaUrl(oldLogoToDelete);
        localStorage.removeItem(STORAGE_KEYS.SERVER_TEXT);
        localStorage.removeItem(STORAGE_KEYS.ABOUT_TEXT);
        localStorage.removeItem(STORAGE_KEYS.SEO_KEYWORDS);
        localStorage.removeItem(STORAGE_KEYS.SEO_DESCRIPTION);
        localStorage.removeItem(STORAGE_KEYS.ACCENT_COLOR);
        updateBranding();
        document.getElementById('logoPreview').style.display = 'none';
        document.getElementById('logoUploadInput').value = '';
        showStatusMessage('✅ Настройки сброшены к стандартным', 'success');
        forceRenderAll();
      });
    });

    function showStatusMessage(text, type) {
      const el = document.getElementById('settingsStatus');
      el.textContent = text;
      el.className = 'status-msg ' + type;
      setTimeout(() => { el.className = 'status-msg'; }, 5000);
    }

    // Аватар
    document.getElementById('avatarUploadBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      if (!currentUser) { showNotification('Внимание', 'Войдите в аккаунт', 'fa-exclamation-triangle'); return; }
      document.getElementById('avatarFileInput').click();
    });
    document.getElementById('avatarFileInput').addEventListener('change', async function(e) {
      const file = this.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showNotification('Ошибка', 'Файл слишком большой. Максимум 5MB.', 'fa-times-circle'); this.value = ''; return; }
      if (!file.type.startsWith('image/')) { showNotification('Ошибка', 'Выберите изображение.', 'fa-times-circle'); this.value = ''; return; }

      const input = this;
      try {
        if (!ltlHasSupabaseStorage()) throw new Error('Supabase Storage не настроен. Проверьте supabase-config.js.');
        showNotification('Загрузка...', 'Аватар сохраняется для всех пользователей', 'fa-cloud-upload-alt');
        const oldAvatar = getSharedUserAvatar(currentUser);
        const uploaded = await ltlUploadMedia(file, 'avatars/' + ltlSafeFileName(String(currentUser).toLowerCase()));
        await updateAvatar(uploaded.url);
        if (oldAvatar && oldAvatar !== uploaded.url && oldAvatar.indexOf('/storage/v1/object/public/' + LTL_MEDIA_BUCKET + '/') >= 0) {
          ltlDeleteMediaUrl(oldAvatar);
        }
        // Обновляем все открытые компоненты профиля/игроков.
        if (typeof forceRenderAll === 'function') forceRenderAll();
        showNotification('Успех!', 'Аватар сохранён в общей базе и виден всем', 'fa-check-circle');
      } catch (err) {
        console.error('Avatar upload failed:', err);
        showNotification('Ошибка', 'Не удалось сохранить аватар: ' + err.message, 'fa-times-circle');
      } finally {
        input.value = '';
      }
    });

    // Настройки профиля
    document.getElementById('settingsBtn').addEventListener('click', function() {
      if (!currentUser) { showNotification('Внимание', 'Войдите в аккаунт', 'fa-exclamation-triangle'); return; }
      document.getElementById('newUsername').value = currentUser;
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
      document.getElementById('settingsError').classList.remove('show');
      document.getElementById('passwordError').classList.remove('show');
      openModal(document.getElementById('settingsModal'));
    });
    document.getElementById('closeSettingsModal').addEventListener('click', () => closeModal(document.getElementById('settingsModal')));
    document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
      const newName = document.getElementById('newUsername').value.trim();
      const newPass = document.getElementById('newPassword').value.trim();
      const confirmPass = document.getElementById('confirmPassword').value.trim();
      
      const settingsError = document.getElementById('settingsError');
      const passwordError = document.getElementById('passwordError');
      settingsError.classList.remove('show');
      passwordError.classList.remove('show');
      
      const users = getUsers();
      const userKey = currentUser.toLowerCase();
      
      if (newPass) {
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
        if (!passwordRegex.test(newPass)) {
          passwordError.textContent = 'Пароль должен содержать минимум 8 символов, буквы и цифры';
          passwordError.classList.add('show');
          return;
        }
        if (newPass !== confirmPass) {
          passwordError.textContent = 'Пароли не совпадают';
          passwordError.classList.add('show');
          return;
        }
      }
      
      if (newName && newName !== currentUser) {
        if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) {
          settingsError.textContent = 'Изменение никнейма отключено в защищённой версии';
          settingsError.classList.add('show');
          return;
        }
        if (users[newName.toLowerCase()]) {
          settingsError.textContent = 'Никнейм уже занят';
          settingsError.classList.add('show');
          return;
        }
        const userData = users[userKey];
        const savedAvatar = localStorage.getItem(getAvatarKey(currentUser));
        delete users[userKey];
        userData.username = newName;
        users[newName.toLowerCase()] = userData;
        if (savedAvatar) {
          localStorage.setItem(getAvatarKey(newName), savedAvatar);
            }
        setUsers(users);
        
        const session = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || '{}');
        session.username = newName;
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        
        const teams = getTeams();
        teams.forEach(team => {
          if (team.roster) {
            const idx = team.roster.indexOf(currentUser);
            if (idx !== -1) {
              team.roster[idx] = newName;
              const oldPlayerKey = team.id + '_' + currentUser;
              const newPlayerKey = team.id + '_' + newName;
              const players = getPlayers();
              if (players[oldPlayerKey]) {
                players[newPlayerKey] = players[oldPlayerKey];
                players[newPlayerKey].name = newName;
                delete players[oldPlayerKey];
                setPlayers(players);
              }
            }
          }
        });
        setTeams(teams);
        currentUser = newName;
      }
      
      if (newPass) {
        const sb = ltlGetSupabaseClient();
        if (!sb) { passwordError.textContent = 'Сервис авторизации недоступен'; passwordError.classList.add('show'); return; }
        const { error: passUpdateError } = await sb.auth.updateUser({ password: newPass });
        if (passUpdateError) { passwordError.textContent = 'Не удалось изменить пароль'; passwordError.classList.add('show'); return; }
      }
      
      loginUser(currentUser, users[currentUser.toLowerCase()].role || ROLES.GUEST);
      closeModal(document.getElementById('settingsModal'));
      showNotification('Успех!', 'Данные профиля обновлены', 'fa-check-circle');
    });

    // Рейтинг
    document.getElementById('rankToggleEdit').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      isRankEditMode = !isRankEditMode;
      if (isRankEditMode) { this.textContent = '✅ Сохранить'; this.classList.add('active'); }
      else {
        this.textContent = '✏️ Редактировать';
        this.classList.remove('active');
        document.querySelectorAll('.rank-points-input').forEach(input => {
          const teamId = input.dataset.teamId;
          const val = parseInt(input.value);
          if (!isNaN(val) && val >= 0) {
            const teams = getTeams();
            const team = teams.find(t => t.id === teamId);
            if (team) team.points = val;
            setTeams(teams);
          }
        });
        showNotification('Рейтинг сохранён!', 'Изменения применены', 'fa-save');
        renderRanking();
      }
    });

    // Топ игроков
    document.getElementById('playerRankToggleEdit').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      isPlayerRankEditMode = !isPlayerRankEditMode;
      if (isPlayerRankEditMode) { this.textContent = '✅ Сохранить LTS'; this.classList.add('active'); }
      else {
        this.textContent = '✏️ Редактировать LTS';
        this.classList.remove('active');
        document.querySelectorAll('.player-rating-input').forEach(input => {
          const teamId = input.dataset.teamId;
          const playerName = input.dataset.playerName;
          const val = parseInt(input.value);
          if (!isNaN(val) && val >= 0) {
            const data = getPlayerData(teamId, playerName);
            // LTS и рейтинг — разные показатели. Редактирование LTS не
            // должно искусственно пересчитывать базовый рейтинг игрока.
            data.lts = val;
            savePlayerData(teamId, playerName, data);
          }
        });
        showNotification('Рейтинг LTS сохранён!', 'Изменения применены', 'fa-save');
        renderTopPlayers();
      }
    });

    // Создание турнира
    document.getElementById('createTournamentBtn').addEventListener('click', function() {
      document.getElementById('tournamentModalTitle').textContent = 'Создать турнир';
      document.getElementById('editTournamentId').value = '';
      document.getElementById('deleteTournamentBtn').style.display = 'none';
      editingTournamentId = null;
      document.getElementById('tournamentName').value = '';
      document.getElementById('tournamentGame').value = '';
      document.getElementById('tournamentStart').value = '';
      document.getElementById('tournamentEnd').value = '';
      document.getElementById('tournamentPrize').value = '';
      document.getElementById('tournamentLocation').value = '';
      document.getElementById('tournamentDescription').value = '';
      openModal(document.getElementById('createTournamentModal'));
    });
    document.getElementById('closeModal').addEventListener('click', () => closeModal(document.getElementById('createTournamentModal')));
    document.getElementById('saveTournamentBtn').addEventListener('click', function() {
      const name = document.getElementById('tournamentName').value.trim();
      const game = document.getElementById('tournamentGame').value.trim();
      if (!name || !game) { showNotification('Ошибка', 'Заполните название и дисциплину', 'fa-times-circle'); return; }
      const tournaments = getTournaments();
      const teamsCount = parseInt(document.getElementById('tournamentTeams').value);
      if (editingTournamentId) {
        const index = tournaments.findIndex(t => t.id === editingTournamentId);
        if (index !== -1) {
          tournaments[index] = { ...tournaments[index], name, game, teamsCount, start: document.getElementById('tournamentStart').value || 'Дата не указана', end: document.getElementById('tournamentEnd').value || 'Дата не указана', prize: document.getElementById('tournamentPrize').value.trim() || '0 ₽', location: document.getElementById('tournamentLocation').value.trim() || 'Не указано', description: document.getElementById('tournamentDescription').value.trim() || 'Описание отсутствует.' };
          showNotification('Турнир обновлён!', name, 'fa-edit');
        }
      } else {
        tournaments.push({ id: 't' + Date.now(), name, game, teamsCount, start: document.getElementById('tournamentStart').value || 'Дата не указана', end: document.getElementById('tournamentEnd').value || 'Дата не указана', prize: document.getElementById('tournamentPrize').value.trim() || '0 ₽', location: document.getElementById('tournamentLocation').value.trim() || 'Не указано', description: document.getElementById('tournamentDescription').value.trim() || 'Описание отсутствует.', bracket: [] });
        showNotification('Турнир создан!', name, 'fa-trophy');
      }
      setTournaments(tournaments);
      forceRenderAll();
      closeModal(document.getElementById('createTournamentModal'));
    });
    document.getElementById('deleteTournamentBtn').addEventListener('click', function() {
      const id = document.getElementById('editTournamentId').value;
      if (id) { window.deleteTournament(id); closeModal(document.getElementById('createTournamentModal')); }
    });

    // Кнопка редактирования турнира
    document.getElementById('tournamentDetailEditBtn').addEventListener('click', function() {
      if (currentTournamentId) {
        window.openEditTournament(currentTournamentId);
      }
    });
    document.getElementById('tournamentDetailDeleteBtn').addEventListener('click', function() {
      if (currentTournamentId) {
        window.deleteTournament(currentTournamentId);
        document.getElementById('tournamentDetailPage').classList.remove('active');
        document.getElementById('tournamentsList').style.display = 'grid';
        currentTournamentId = null;
      }
    });

    // Создание матча
    document.getElementById('createMatchBtn').addEventListener('click', function() {
      document.getElementById('matchModalTitle').textContent = 'Создать матч';
      document.getElementById('editMatchId').value = '';
      document.getElementById('deleteMatchBtn').style.display = 'none';
      editingMatchId = null;
      document.getElementById('matchDateTime').value = '';
      document.getElementById('matchTeamA').value = '';
      document.getElementById('matchTeamB').value = '';
      document.getElementById('matchScore').value = '0:0';
      document.getElementById('matchStatus').value = 'upcoming';
      document.getElementById('matchTournament').value = '';
      document.getElementById('matchGame').value = '';
      document.getElementById('matchStream').value = '';
      document.getElementById('matchRostersPreview').style.display = 'none';
      populateTeamSelects();
      populateTournamentSelect();
      openModal(document.getElementById('createMatchModal'));
    });
    document.getElementById('saveMatchBtn').addEventListener('click', function() {
      const teamA = document.getElementById('matchTeamA').value;
      const teamB = document.getElementById('matchTeamB').value;
      const tournament = document.getElementById('matchTournament').value;
      if (!teamA || !teamB) { showNotification('Ошибка', 'Выберите обе команды', 'fa-times-circle'); return; }
      if (teamA === teamB) { showNotification('Ошибка', 'Команды должны быть разными', 'fa-times-circle'); return; }
      if (!tournament) { showNotification('Ошибка', 'Выберите турнир', 'fa-times-circle'); return; }
      const initialScore = document.getElementById('matchScore').value.trim() || '0:0';
      const existingForFormat = editingMatchId ? getMatches().find(m => m.id === editingMatchId) : null;
      if (!isValidSeriesScore(initialScore, existingForFormat || { teamA, teamB, tournament, isGrandFinal:false }, document.getElementById('matchStatus').value === 'finished')) {
        showNotification('Ошибка', 'Счёт должен соответствовать системе ' + getSeriesFormat(existingForFormat || { isGrandFinal:false }).label + '.', 'fa-times-circle');
        return;
      }
      const matchData = {
        dateTime: document.getElementById('matchDateTime').value || 'Дата не указана',
        teamA, teamB,
        score: initialScore,
        status: document.getElementById('matchStatus').value,
        game: document.getElementById('matchGame').value.trim() || 'Матч',
        tournament: tournament,
        stream: document.getElementById('matchStream').value.trim() || ''
      };
      let matches = getMatches();
      if (editingMatchId) {
        const index = matches.findIndex(m => m.id === editingMatchId);
        if (index !== -1) { matches[index] = { ...matches[index], ...matchData }; markMatchUpdated(matches[index]); ensureGameForScore(matches[index].id, matches[index].score); showNotification('Матч обновлён!', teamA + ' vs ' + teamB, 'fa-edit'); }
      } else {
        const newMatch = { id: 'm' + Date.now(), ...matchData };
        markMatchUpdated(newMatch);
        ensureGameForScore(newMatch.id, newMatch.score);
        matches.push(newMatch);
        showNotification('Матч создан!', teamA + ' vs ' + teamB, 'fa-calendar-check');
      }
      setMatches(matches);
      forceRenderAll();
      syncMatchesWithBracket();
      closeModal(document.getElementById('createMatchModal'));
    });
    document.getElementById('deleteMatchBtn').addEventListener('click', function() {
      const id = document.getElementById('editMatchId').value;
      if (id) { window.deleteMatch(id); closeModal(document.getElementById('createMatchModal')); }
    });

    // KDA
    document.querySelectorAll('.kda-preset-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.getElementById('kdaKills').value = this.dataset.k;
        document.getElementById('kdaDeaths').value = this.dataset.d;
        document.getElementById('kdaAssists').value = this.dataset.a;
      });
    });
    const addGameBtnEl = document.getElementById('addGameBtn');
    if (addGameBtnEl) addGameBtnEl.addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      if (!currentMatchId) { showNotification('Ошибка', 'Матч не выбран', 'fa-times-circle'); return; }
      const match = getMatches().find(m => m.id === currentMatchId);
      const games = loadMatchGames(currentMatchId);
      games.push(normalizeGame({ seriesScore: (match && match.score) || '', index: games.length + 1 }, games.length));
      setMatchGames(currentMatchId, games);
      window.openMatchDetailPage(currentMatchId);
      showNotification('Карта добавлена', 'Карта ' + games.length, 'fa-map');
    });
    document.getElementById('kdaAddBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      if (!currentMatchId) { showNotification('Ошибка', 'Матч не выбран', 'fa-times-circle'); return; }
      const player = document.getElementById('kdaPlayerName').value.trim();
      const kills = parseInt(document.getElementById('kdaKills').value) || 0;
      const deaths = parseInt(document.getElementById('kdaDeaths').value) || 0;
      const assists = parseInt(document.getElementById('kdaAssists').value) || 0;
      if (!player) { showNotification('Ошибка', 'Введите имя игрока', 'fa-times-circle'); return; }
      const kda = getKDA();
      if (!kda[currentMatchId]) kda[currentMatchId] = {};
      kda[currentMatchId][player] = { kills, deaths, assists };
      setKDA(kda);
      document.getElementById('kdaPlayerName').value = '';
      document.getElementById('kdaKills').value = '';
      document.getElementById('kdaDeaths').value = '';
      document.getElementById('kdaAssists').value = '';
      showNotification('KDA добавлен', `${player}: ${kills}/${deaths}/${assists}`, 'fa-check-circle');
      if (currentMatchId) window.openMatchDetailPage(currentMatchId);
    });

    // LTS
    document.getElementById('addLTSBtn').addEventListener('click', function() {
      if (editingPlayerName && editingPlayerTeamId) {
        document.getElementById('ltsTargetId').value = editingPlayerTeamId + '_' + editingPlayerName;
        document.getElementById('ltsTargetType').value = 'player';
        document.getElementById('ltsModalSub').textContent = `Начислить очки LTS для "${editingPlayerName}"`;
        document.getElementById('ltsAmount').value = 10;
        openModal(document.getElementById('addLTSModal'));
      }
    });
    document.getElementById('closeLTSModal').addEventListener('click', () => closeModal(document.getElementById('addLTSModal')));
    document.getElementById('saveLTSBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.HEAD) { showNotification('Нет доступа', 'Изменять очки может только Глава.', 'fa-times-circle'); return; }
      const id = document.getElementById('ltsTargetId').value;
      const amount = Number(document.getElementById('ltsAmount').value);
      if (!Number.isFinite(amount) || amount === 0) { showNotification('Ошибка', 'Введите ненулевое число. Можно использовать отрицательное значение.', 'fa-times-circle'); return; }
      const parts = id.split('_');
      if (parts.length >= 2) {
        const teamId = parts.shift();
        const playerName = parts.join('_');
        const data = getPlayerData(teamId, playerName);
        data.lts = Math.max(0, Number(data.lts || 0) + amount);
        savePlayerData(teamId, playerName, data);
        renderTopPlayers();
        if (editingPlayerName) window.showPlayerDetail(editingPlayerName, editingPlayerTeamId);
        showNotification('LTS изменён', `${playerName}: ${amount > 0 ? '+' : ''}${amount} LTS`, 'fa-star');
      }
      closeModal(document.getElementById('addLTSModal'));
    });

    // Изменение рейтинга команды — только Глава, можно + и -
    document.getElementById('addTeamPointsDetailBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.HEAD) { showNotification('Нет доступа', 'Изменять рейтинг команд может только Глава.', 'fa-times-circle'); return; }
      if (!editingTeamId) { showNotification('Ошибка', 'Сначала выберите команду', 'fa-times-circle'); return; }
      const teams = getTeams();
      const team = teams.find(t => t.id === editingTeamId);
      if (!team) { showNotification('Ошибка', 'Команда не найдена', 'fa-times-circle'); return; }
      const amount = prompt(`Изменение рейтинга команды "${team.name}".\nТекущее значение: ${Number(team.points || 0)}\nВведите изменение: например 10 или -10`, '10');
      if (amount === null) return;
      const val = Number(amount);
      if (!Number.isFinite(val) || val === 0) { showNotification('Ошибка', 'Введите ненулевое число.', 'fa-times-circle'); return; }
      team.points = Math.max(0, Number(team.points || 0) + val);
      setTeams(teams);
      forceRenderAll();
      window.showTeamDetail(editingTeamId);
      showNotification('Рейтинг команды изменён', `${team.name}: ${val > 0 ? '+' : ''}${val}`, 'fa-star');
    });

    // Редактирование команды
    document.getElementById('editTeamBtn').addEventListener('click', function() {
      const teams = getTeams();
      const team = teams.find(t => t.id === editingTeamId);
      if (!team) return;
      document.getElementById('editTeamName').value = team.name;
      document.getElementById('editTeamRegion').value = team.region || '';
      document.getElementById('editTeamIcon').value = team.icon;
      document.getElementById('editTeamDesc').value = team.description || '';
      document.getElementById('editTeamRoster').value = team.roster ? team.roster.join(', ') : '';
      document.getElementById('editTeamWins').value = team.wins || 0;
      document.getElementById('editTeamLosses').value = team.losses || 0;
      document.getElementById('editTeamPrize').value = team.prize || '0 ₽';
      openModal(document.getElementById('editTeamModal'));
    });
    document.getElementById('closeEditTeamModal').addEventListener('click', () => { const f=document.getElementById('editTeamAvatarFile'); if(f) f.value=''; closeModal(document.getElementById('editTeamModal')); });
    document.getElementById('saveEditTeamBtn').addEventListener('click', async function() {
      const name = document.getElementById('editTeamName').value.trim();
      if (!name) { showNotification('Ошибка', 'Введите название команды', 'fa-times-circle'); return; }
      const teams = getTeams();
      const team = teams.find(t => t.id === editingTeamId);
      if (!team) return;
      team.name = name;
      team.region = document.getElementById('editTeamRegion').value.trim() || 'Не указан';
      team.icon = document.getElementById('editTeamIcon').value.trim().toUpperCase().slice(0, 5) || name.substring(0, 5).toUpperCase();
      team.description = document.getElementById('editTeamDesc').value.trim() || 'Описание отсутствует.';
      team.roster = document.getElementById('editTeamRoster').value.trim().split(',').map(s => s.trim()).filter(Boolean) || ['Игрок 1', 'Игрок 2', 'Игрок 3'];
      team.wins = parseInt(document.getElementById('editTeamWins').value) || 0;
      team.losses = parseInt(document.getElementById('editTeamLosses').value) || 0;
      team.prize = document.getElementById('editTeamPrize').value.trim() || '0 ₽';
      const editAvatarFile = document.getElementById('editTeamAvatarFile')?.files?.[0];
      if (editAvatarFile) {
        if (!editAvatarFile.type.startsWith('image/')) { showNotification('Ошибка', 'Аватар команды должен быть изображением', 'fa-times-circle'); return; }
        if (editAvatarFile.size > 5 * 1024 * 1024) { showNotification('Ошибка', 'Аватар команды не больше 5MB', 'fa-times-circle'); return; }
        try {
          const oldAvatar = team.avatar;
          const uploaded = await ltlUploadMedia(editAvatarFile, 'teams/' + ltlSafeFileName(team.id || team.name));
          team.avatar = uploaded.url;
          if (oldAvatar && oldAvatar !== uploaded.url && oldAvatar.indexOf('/storage/v1/object/public/' + LTL_MEDIA_BUCKET + '/') >= 0) ltlDeleteMediaUrl(oldAvatar);
        } catch (err) {
          showNotification('Ошибка загрузки', 'Не удалось загрузить аватар команды: ' + err.message, 'fa-times-circle');
          return;
        }
      }
      setTeams(teams);
      forceRenderAll();
      closeModal(document.getElementById('editTeamModal'));
      window.showTeamDetail(editingTeamId);
      showNotification('Команда обновлена!', name, 'fa-edit');
    });
    document.getElementById('deleteTeamBtn').addEventListener('click', function() {
      showConfirm('Удаление команды', 'Вы уверены, что хотите удалить эту команду?', function() {
        let teams = getTeams();
        teams = teams.filter(t => t.id !== editingTeamId);
        setTeams(teams);
        forceRenderAll();
        closeModal(document.getElementById('editTeamModal'));
        document.getElementById('teamDetailPage').classList.remove('active');
        document.getElementById('playerDetailPage').classList.remove('active');
        document.getElementById('teamDetailPage').style.display = 'none';
        document.getElementById('teamsGrid').style.display = 'grid';
        showNotification('Команда удалена', '', 'fa-trash');
      });
    });

    // Редактирование игрока
    document.getElementById('editPlayerBtn').addEventListener('click', function() {
      const data = getPlayerData(editingPlayerTeamId, editingPlayerName);
      document.getElementById('editPlayerName').value = data.name;
      document.getElementById('editPlayerRole').value = data.role || 'Игрок';
      const avatarInput = document.getElementById('editPlayerAvatarFile');
      const avatarPreview = document.getElementById('editPlayerAvatarPreview');
      const avatarPreviewImg = document.getElementById('editPlayerAvatarPreviewImg');
      if (avatarInput) avatarInput.value = '';
      const existingAvatar = getPlayerAvatarUrl(data.name);
      if (avatarPreview && avatarPreviewImg && existingAvatar) {
        avatarPreviewImg.src = existingAvatar;
        avatarPreview.style.display = 'flex';
      } else if (avatarPreview) {
        avatarPreview.style.display = 'none';
      }
      const removeTopBtn = document.getElementById('removePlayerFromTopBtn');
      if (removeTopBtn) {
        removeTopBtn.style.display = currentRole === ROLES.HEAD ? 'block' : 'none';
        removeTopBtn.dataset.playerName = data.name || editingPlayerName || '';
      }
      const teamSelect = document.getElementById('editPlayerTeam');
      const teams = getTeams();
      teamSelect.innerHTML = '<option value="">Без команды</option>' + teams.map(team => `<option value="${String(team.id).replace(/"/g,'&quot;')}">${escHtml(team.name)}</option>`).join('');
      const currentTeamId = data.teamId || editingPlayerTeamId || null;
      teamSelect.value = currentTeamId && teams.some(t => String(t.id) === String(currentTeamId)) ? currentTeamId : '';
      document.getElementById('editPlayerMatches').value = data.matches || 0;
      document.getElementById('editPlayerWins').value = data.wins || 0;
      document.getElementById('editPlayerLosses').value = data.losses || 0;
      document.getElementById('editPlayerEarnings').value = data.earnings || '0 ₽';
      document.getElementById('editPlayerBio').value = data.bio || '';
      openModal(document.getElementById('editPlayerModal'));
    });
    document.getElementById('closeEditPlayerModal').addEventListener('click', () => {
      const avatarInput = document.getElementById('editPlayerAvatarFile');
      const avatarPreview = document.getElementById('editPlayerAvatarPreview');
      if (avatarInput) avatarInput.value = '';
      if (avatarPreview) avatarPreview.style.display = 'none';
      closeModal(document.getElementById('editPlayerModal'));
    });
    document.getElementById('removePlayerFromTopBtn')?.addEventListener('click', function() {
      if (currentRole !== ROLES.HEAD) {
        showNotification('Доступ запрещён', 'Удалять игроков из Топа может только Глава', 'fa-lock');
        return;
      }
      const name = this.dataset.playerName || editingPlayerName || '';
      if (!name) return;
      closeModal(document.getElementById('editPlayerModal'));
      window.removePlayerFromTop(name);
    });
    document.getElementById('editPlayerAvatarFile')?.addEventListener('change', function() {
      const file = this.files?.[0];
      const preview = document.getElementById('editPlayerAvatarPreview');
      const img = document.getElementById('editPlayerAvatarPreviewImg');
      if (!file || !file.type.startsWith('image/')) {
        if (preview) preview.style.display = 'none';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showNotification('Ошибка', 'Аватар игрока не больше 5MB', 'fa-times-circle');
        this.value = '';
        if (preview) preview.style.display = 'none';
        return;
      }
      if (img && preview) {
        img.src = URL.createObjectURL(file);
        preview.style.display = 'flex';
      }
    });
    document.getElementById('saveEditPlayerBtn').addEventListener('click', async function() {
      const name = document.getElementById('editPlayerName').value.trim();
      if (!name) { showNotification('Ошибка', 'Введите имя игрока', 'fa-times-circle'); return; }
      const selectedTeamId = document.getElementById('editPlayerTeam').value || null;
      const oldName = editingPlayerName;
      const oldTeamId = editingPlayerTeamId;
      const players = getPlayers();
      const sourceKey = playerStorageKey(oldTeamId, oldName);
      const legacyKey = oldTeamId + '_' + oldName;
      const sourceData = players[sourceKey] || players[legacyKey] || getPlayerData(oldTeamId, oldName);
      const data = {
        ...sourceData, name, teamId:selectedTeamId,
        role:document.getElementById('editPlayerRole').value.trim() || 'Игрок',
        matches:parseInt(document.getElementById('editPlayerMatches').value) || 0,
        wins:parseInt(document.getElementById('editPlayerWins').value) || 0,
        losses:parseInt(document.getElementById('editPlayerLosses').value) || 0,
        earnings:document.getElementById('editPlayerEarnings').value.trim() || '0 ₽',
        bio:document.getElementById('editPlayerBio').value.trim() || 'Биография игрока пока не заполнена.'
      };

      const avatarFile = document.getElementById('editPlayerAvatarFile')?.files?.[0];
      if (avatarFile) {
        if (!avatarFile.type.startsWith('image/')) { showNotification('Ошибка', 'Аватар игрока должен быть изображением', 'fa-times-circle'); return; }
        if (avatarFile.size > 5 * 1024 * 1024) { showNotification('Ошибка', 'Аватар игрока не больше 5MB', 'fa-times-circle'); return; }
        try {
          const uploaded = await ltlUploadMedia(avatarFile, 'avatars/' + ltlSafeFileName(String(name).toLowerCase()));
          const oldAvatar = getPlayerAvatarUrl(oldName);
          data.avatar_url = uploaded.url;
          const usersForAvatar = getUsers();
          const avatarOldKey = String(oldName).toLowerCase();
          const avatarNewKey = String(name).toLowerCase();
          const avatarUser = usersForAvatar[avatarOldKey] || usersForAvatar[avatarNewKey];
          if (avatarUser) {
            avatarUser.avatar_url = uploaded.url;
            avatarUser.avatar = uploaded.url;
            usersForAvatar[avatarNewKey] = avatarUser;
            if (avatarOldKey !== avatarNewKey) delete usersForAvatar[avatarOldKey];
            setUsers(usersForAvatar);
          }
          if (oldAvatar && oldAvatar !== uploaded.url && oldAvatar.indexOf('/storage/v1/object/public/' + LTL_MEDIA_BUCKET + '/') >= 0) ltlDeleteMediaUrl(oldAvatar);
        } catch (err) {
          showNotification('Ошибка загрузки', 'Не удалось загрузить аватар игрока: ' + err.message, 'fa-times-circle');
          return;
        }
      }

      const teams = getTeams();
      teams.forEach(team => {
        team.roster = Array.isArray(team.roster) ? team.roster.filter(n => String(n).toLowerCase() !== String(oldName).toLowerCase() && String(n).toLowerCase() !== String(name).toLowerCase()) : [];
      });
      if (selectedTeamId) {
        const targetTeam = teams.find(t => String(t.id) === String(selectedTeamId));
        if (targetTeam) targetTeam.roster.push(name);
      }
      setTeams(teams);

      const users = getUsers();
      const oldUserKey = String(oldName).toLowerCase();
      const newUserKey = String(name).toLowerCase();
      const user = users[oldUserKey] || users[newUserKey];
      if (user) {
        if (oldUserKey !== newUserKey) delete users[oldUserKey];
        user.username = name; user.role = ROLES.PLAYER; user.teamId = selectedTeamId;
        users[newUserKey] = user; setUsers(users);
      }

      // Единый источник данных игрока: профиль не дублируется по командам.
      Object.keys(players).forEach(k => { if (players[k] && String(players[k].name || '').toLowerCase() === String(oldName || '').toLowerCase()) delete players[k]; });
      players[canonicalPlayerKey(name)] = { ...data, name, teamId:selectedTeamId };
      setPlayers(players);

      editingPlayerName = name;
      editingPlayerTeamId = selectedTeamId;
      const savedAvatarInput = document.getElementById('editPlayerAvatarFile');
      const savedAvatarPreview = document.getElementById('editPlayerAvatarPreview');
      if (savedAvatarInput) savedAvatarInput.value = '';
      if (savedAvatarPreview) savedAvatarPreview.style.display = 'none';
      closeModal(document.getElementById('editPlayerModal'));
      forceRenderAll();
      window.showPlayerDetail(selectedTeamId, name, playerDetailOrigin);
      showNotification('Данные обновлены!', selectedTeamId ? 'Игрок перенесён в выбранную команду' : 'Игрок оставлен без команды и сохранён в Топ игроков', 'fa-save');
    });

    // Хайлайты
    document.getElementById('addHighlightBtn').addEventListener('click', function() {
      document.getElementById('highlightText').value = '';
      document.getElementById('highlightVideoFile').value = '';
      openModal(document.getElementById('addHighlightModal'));
    });
    document.getElementById('closeHighlightModal').addEventListener('click', () => closeModal(document.getElementById('addHighlightModal')));
    // Удаление лучших моментов: только Глава. Удаляем запись и видео из Supabase Storage.
    document.getElementById('highlightsGrid').addEventListener('click', async function(e) {
      const btn = e.target.closest('.highlight-delete');
      if (!btn) return;
      if (currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Удалять лучшие моменты может только Глава', 'fa-lock'); return; }
      const highlightId = String(btn.dataset.highlightId || '');
      const key = decodeURIComponent(btn.dataset.highlightPlayer || '');
      if (!highlightId || !key) return;
      const store = getHighlights();
      const list = Array.isArray(store[key]) ? store[key] : [];
      const item = list.find(h => String(h.id) === highlightId);
      if (!item) { showNotification('Ошибка', 'Лучший момент не найден', 'fa-times-circle'); return; }
      showConfirm('Удалить лучший момент?', 'Видео и запись этого момента будут удалены. Продолжить?', async function() {
        try {
          if (item.video) await ltlDeleteMediaUrl(item.video);
          store[key] = list.filter(h => String(h.id) !== highlightId);
          if (store[key].length === 0) delete store[key];
          setHighlights(store);
          window.showPlayerDetail(editingPlayerTeamId, editingPlayerName, playerDetailOrigin);
          showNotification('Лучший момент удалён', 'Глава удалил момент из профиля игрока.', 'fa-trash');
        } catch (err) {
          showNotification('Ошибка удаления', err.message || 'Не удалось удалить лучший момент', 'fa-times-circle');
        }
      });
    });

    document.getElementById('saveHighlightBtn').addEventListener('click', async function() {
      const text = document.getElementById('highlightText').value.trim();
      const file = document.getElementById('highlightVideoFile').files[0];
      if (!text) { showNotification('Ошибка', 'Введите описание момента', 'fa-times-circle'); return; }
      if (!file) { showNotification('Ошибка', 'Выберите видео файл', 'fa-times-circle'); return; }
      if (!file.type.startsWith('video/')) { showNotification('Ошибка', 'Выберите видеофайл MP4/WebM/MOV.', 'fa-times-circle'); return; }
      if (file.size > 500 * 1024 * 1024) { showNotification('Ошибка', 'Видео слишком большое. Максимум 500MB.', 'fa-times-circle'); return; }
      const btn = document.getElementById('saveHighlightBtn');
      const oldText = btn.textContent; btn.disabled = true; btn.textContent = 'Загрузка видео...';
      try {
        const key = canonicalPlayerKey(editingPlayerName);
        const uploaded = await ltlUploadMedia(file, 'highlights/' + ltlSafeFileName(key));
        const highlights = getHighlights();
        if (!highlights[key]) highlights[key] = [];
        highlights[key].push({ id: Date.now(), text: text, video: uploaded.url, videoType: uploaded.type, videoSize: uploaded.size, fileName: uploaded.name });
        setHighlights(highlights);
        closeModal(document.getElementById('addHighlightModal'));
        window.showPlayerDetail(editingPlayerTeamId, editingPlayerName);
        showNotification('Момент добавлен!', 'Видео сохранено в Supabase Storage и доступно всем.', 'fa-star');
      } catch (err) {
        showNotification('Ошибка', 'Не удалось сохранить видео: ' + err.message, 'fa-times-circle');
      } finally { btn.disabled = false; btn.textContent = oldText; }
    });

    // Стрим
    document.getElementById('streamUrlSaveBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      const url = document.getElementById('streamUrlInput').value.trim();
      localStorage.setItem(STORAGE_KEYS.GLOBAL_STREAM, url);
      document.getElementById('streamUrlCurrent').textContent = url ? 'Текущий стрим: ' + url : 'Стрим не настроен';
      updateAllStreams();
      showNotification('Стрим сохранён!', url || 'Стрим отключён', 'fa-check-circle');
    });

    // Счёт матча - синхронизация с сеткой
    document.getElementById('matchDetailScoreSaveBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      if (!currentMatchId) { showNotification('Ошибка', 'Матч не найден', 'fa-times-circle'); return; }
      const newScore = document.getElementById('matchDetailScoreInput').value.trim();
      if (!newScore || !newScore.includes(':')) { showNotification('Ошибка', 'Введите счёт в формате X:Y', 'fa-times-circle'); return; }
      const matches = getMatches();
      const match = matches.find(m => m.id === currentMatchId);
      if (match) {
        const requireWinner = match.status === 'finished';
        if (!isValidSeriesScore(newScore, match, requireWinner)) { showNotification('Ошибка', 'Неверный счёт для ' + getSeriesFormat(match).label + '. Победа должна быть определена по системе BO3/BO5.', 'fa-times-circle'); return; }
        match.score = newScore;
        markMatchUpdated(match);
        const createdGame = ensureGameForScore(match.id, newScore);
        match.winner = determineWinner(newScore, match.teamA, match.teamB, match);
        if (match.winner && match.status === 'live') {
          match.status = 'finished';
        }
        setMatches(matches);
        document.getElementById('matchDetailScore').textContent = newScore;
        forceRenderAll();
        syncMatchesWithBracket();
        window.openMatchDetailPage(match.id);
        showNotification('Счёт обновлён!', createdGame ? newScore + ' · создана новая карта' : newScore, 'fa-save');
      }
    });

    // Ссылка на трансляцию матча
    document.getElementById('matchStreamSaveBtn').addEventListener('click', function() {
      if (currentRole !== ROLES.ADMIN && currentRole !== ROLES.HEAD) { showNotification('Доступ запрещён', 'Только Администратор или Глава', 'fa-lock'); return; }
      if (!currentMatchId) { showNotification('Ошибка', 'Матч не найден', 'fa-times-circle'); return; }
      const streamUrl = document.getElementById('matchStreamInput').value.trim();
      const matches = getMatches();
      const match = matches.find(m => m.id === currentMatchId);
      if (match) {
        match.stream = streamUrl || '';
        setMatches(matches);
        document.getElementById('matchStreamCurrent').textContent = streamUrl ? 'Текущая ссылка: ' + streamUrl : 'Ссылка не добавлена';
        forceRenderAll();
        showNotification('Ссылка на трансляцию обновлена!', streamUrl || 'Ссылка удалена', 'fa-save');
      }
    });

    // Смена аватара команды
    document.getElementById('changeTeamAvatarBtn').addEventListener('click', function() {
      if (!editingTeamId) return;
      document.getElementById('teamAvatarFile').value = '';
      openModal(document.getElementById('teamAvatarModal'));
    });
    document.getElementById('closeTeamAvatarModal').addEventListener('click', () => closeModal(document.getElementById('teamAvatarModal')));
    document.getElementById('saveTeamAvatarBtn').addEventListener('click', async function() {
      const file = document.getElementById('teamAvatarFile').files[0];
      if (!file) { showNotification('Ошибка', 'Выберите изображение', 'fa-times-circle'); return; }
      if (!file.type.startsWith('image/')) { showNotification('Ошибка', 'Выберите изображение', 'fa-times-circle'); return; }
      if (file.size > 5 * 1024 * 1024) { showNotification('Ошибка', 'Максимум 5MB', 'fa-times-circle'); return; }
      const btn = document.getElementById('saveTeamAvatarBtn'); const oldText=btn.textContent; btn.disabled=true; btn.textContent='Загрузка...';
      try {
        const teams = getTeams(); const team = teams.find(t => t.id === editingTeamId); if (!team) throw new Error('Команда не найдена');
        const oldAvatar = team.avatar; const uploaded = await ltlUploadMedia(file, 'teams/' + ltlSafeFileName(team.id || team.name));
        team.avatar = uploaded.url; setTeams(teams);
        if (oldAvatar && oldAvatar.indexOf('/storage/v1/object/public/ltl-media/') >= 0) ltlDeleteMediaUrl(oldAvatar);
        forceRenderAll(); closeModal(document.getElementById('teamAvatarModal')); showNotification('Успех!', 'Аватар команды сохранён для всех', 'fa-check-circle');
      } catch(err) { showNotification('Ошибка', 'Не удалось сохранить аватар: ' + err.message, 'fa-times-circle'); }
      finally { btn.disabled=false; btn.textContent=oldText; }
    });

    // Брекет
    document.getElementById('bracketToggleEditBtn').addEventListener('click', function() {
      if (!currentTournamentId) return;
      isBracketEditMode = !isBracketEditMode;
      if (isBracketEditMode) {
        this.textContent = '✅ Сохранить изменения';
        this.style.background = 'var(--accent)';
        this.style.color = '#fff';
        this.style.borderColor = 'var(--accent)';
        document.querySelector('.bracket-container').classList.add('bracket-edit-mode');
      } else {
        this.textContent = '✏️ Режим редактирования';
        this.style.background = 'var(--bg2)';
        this.style.color = 'var(--ink)';
        this.style.borderColor = 'var(--line)';
        document.querySelector('.bracket-container').classList.remove('bracket-edit-mode');
        showNotification('Режим редактирования отключен', 'Изменения сохранены', 'fa-save');
      }
      const tournaments = getTournaments();
      const tourn = tournaments.find(t => t.id === currentTournamentId);
      if (tourn) renderDoubleEliminationBracket(tourn);
    });
    
    window.enterBracketEditMode = function() {
      if (!currentTournamentId) return;
      isBracketEditMode = true;
      document.getElementById('bracketToggleEditBtn').textContent = '✅ Сохранить изменения';
      document.getElementById('bracketToggleEditBtn').style.background = 'var(--accent)';
      document.getElementById('bracketToggleEditBtn').style.color = '#fff';
      document.getElementById('bracketToggleEditBtn').style.borderColor = 'var(--accent)';
      document.querySelector('.bracket-container').classList.add('bracket-edit-mode');
      const tournaments = getTournaments();
      const tourn = tournaments.find(t => t.id === currentTournamentId);
      if (tourn) renderDoubleEliminationBracket(tourn);
      showNotification('Режим редактирования включен', 'Редактируйте только нужный матч', 'fa-edit');
    };
    
    window.saveBracketMatch = function(matchId) {
      const tournaments = getTournaments();
      const tourn = tournaments.find(t => t.id === currentTournamentId);
      if (!tourn || !tourn.bracket) return;
      const matchIndex = tourn.bracket.findIndex(m => m.id === matchId);
      if (matchIndex === -1) return;
      const selectA = document.querySelector(`.bracket-team-select[data-match="${matchId}"][data-side="A"]`);
      const selectB = document.querySelector(`.bracket-team-select[data-match="${matchId}"][data-side="B"]`);
      const scoreAInput = document.querySelector(`.score-input[data-match="${matchId}"][data-side="A"]`);
      const scoreBInput = document.querySelector(`.score-input[data-match="${matchId}"][data-side="B"]`);
      if (selectA) tourn.bracket[matchIndex].teamA = selectA.value;
      if (selectB) tourn.bracket[matchIndex].teamB = selectB.value;
      const scoreA = scoreAInput ? scoreAInput.value.trim() : '';
      const scoreB = scoreBInput ? scoreBInput.value.trim() : '';
      if (scoreA || scoreB) tourn.bracket[matchIndex].score = (scoreA || '0') + ':' + (scoreB || '0');
      if (tourn.bracket[matchIndex].score && !isValidSeriesScore(tourn.bracket[matchIndex].score, tourn.bracket[matchIndex], false)) { showNotification('Ошибка', 'Неверный счёт для ' + getSeriesFormat(tourn.bracket[matchIndex]).label, 'fa-times-circle'); return; }
      markBracketMatchUpdated(tourn.bracket[matchIndex]);
      const winner = determineWinner(tourn.bracket[matchIndex].score, tourn.bracket[matchIndex].teamA, tourn.bracket[matchIndex].teamB, tourn.bracket[matchIndex]);
      if (winner) {
        tourn.bracket[matchIndex].winner = winner;
        tourn.bracket[matchIndex].status = 'finished';
        tourn.bracket[matchIndex].loser = winner === tourn.bracket[matchIndex].teamA ? tourn.bracket[matchIndex].teamB : tourn.bracket[matchIndex].teamA;
        advanceBracketAfterResult(tourn, tourn.bracket[matchIndex]);
      }
      setTournaments(tournaments);
      renderDoubleEliminationBracket(tourn);
      syncMatchesWithBracket();
      forceRenderAll();
      showNotification('Матч сохранён!', 'Изменения применены', 'fa-save');
    };
    
    window.cancelBracketEdit = function() {
      isBracketEditMode = false;
      document.getElementById('bracketToggleEditBtn').textContent = '✏️ Режим редактирования';
      document.getElementById('bracketToggleEditBtn').style.background = 'var(--bg2)';
      document.getElementById('bracketToggleEditBtn').style.color = 'var(--ink)';
      document.getElementById('bracketToggleEditBtn').style.borderColor = 'var(--line)';
      document.querySelector('.bracket-container').classList.remove('bracket-edit-mode');
      const tournaments = getTournaments();
      const tourn = tournaments.find(t => t.id === currentTournamentId);
      if (tourn) renderDoubleEliminationBracket(tourn);
      showNotification('Режим редактирования отключен', '', 'fa-times');
    };
    
    window.deleteBracketMatch = function(matchId) {
      showConfirm('Удаление матча из сетки', 'Вы уверены, что хотите удалить этот матч?', function() {
        const tournaments = getTournaments();
        const tourn = tournaments.find(t => t.id === currentTournamentId);
        if (!tourn || !tourn.bracket) return;
        tourn.bracket = tourn.bracket.filter(m => m.id !== matchId);
        setTournaments(tournaments);
        renderDoubleEliminationBracket(tourn);
        showNotification('Матч удалён из сетки', '', 'fa-trash');
      });
    };
    
    function setBracketSlot(match, side, team) {
      if (!match || !team || team === 'TBD') return false;
      const key = side === 'A' ? 'teamA' : 'teamB';
      if (match[key] === team) return false;
      if (match[key] !== 'TBD' && match[key] !== '' && match[key] !== team) return false;
      match[key] = team;
      if (match.status === 'finished' && !match.winner) match.status = 'upcoming';
      touch(match);
      return true;
    }

    function advanceBracketAfterResult(tourn, match) {
      if (!tourn || !match || !match.winner) return false;
      const loser = match.teamA === match.winner ? match.teamB : match.teamA;
      match.loser = loser && loser !== 'TBD' ? loser : null;
      const byId = id => (tourn.bracket || []).find(x => x && x.id === id);
      let changed = false;
      const nextWin = byId(match.nextWinMatchId);
      if (nextWin) changed = setBracketSlot(nextWin, match.nextWinSide || 'A', match.winner) || changed;
      const nextLose = byId(match.nextLoseMatchId);
      if (nextLose && loser && loser !== 'TBD') changed = setBracketSlot(nextLose, match.nextLoseSide || 'A', loser) || changed;
      // Fallback for older/custom brackets that do not have flow links.
      if (!nextWin && match.section === 'upper') {
        const nr = Number(match.round || 0) + 1;
        const candidates = tourn.bracket.filter(x => x.section === 'upper' && Number(x.round) === nr);
        const target = candidates[Math.floor(Number(match.index || 0) / 2)];
        if (target) changed = setBracketSlot(target, Number(match.index || 0) % 2 ? 'B' : 'A', match.winner) || changed;
      }
      if (!nextLose && match.section === 'upper' && loser && loser !== 'TBD') {
        const lr = Number(match.round) === 1 ? 1 : Number(match.round) * 2 - 2;
        const candidates = tourn.bracket.filter(x => x.section === 'lower' && Number(x.round) === lr);
        const idx = Number(match.round) === 1 ? Math.floor(Number(match.index || 0) / 2) : Number(match.index || 0);
        const target = candidates[idx];
        if (target) changed = setBracketSlot(target, Number(match.round) === 1 ? (Number(match.index || 0) % 2 ? 'B' : 'A') : (Number(match.index || 0) % 2 ? 'A' : 'B'), loser) || changed;
      }
      if (!nextWin && match.section === 'lower') {
        const nr = Number(match.round || 0) + 1;
        const candidates = tourn.bracket.filter(x => x.section === 'lower' && Number(x.round) === nr);
        const idx = Number(match.round || 0) % 2 === 1 ? Number(match.index || 0) : Math.floor(Number(match.index || 0) / 2);
        const target = candidates[idx];
        if (target) changed = setBracketSlot(target, Number(match.round || 0) % 2 === 1 ? 'A' : (Number(match.index || 0) % 2 ? 'B' : 'A'), match.winner) || changed;
      }
      if (changed) touch(tourn);
      return changed;
    }

    // Начисление статистики матча — идемпотентное: повторное сохранение
    // одного и того же результата не выдаёт очки второй раз.
    function applyMatchResultStats(match, winner, loser) {
      if (!match || !winner || !loser) return false;
      if (match.statsAwarded) return false;

      const teams = getTeams();
      const winnerTeamObj = teams.find(t => t.name === winner);
      const loserTeamObj = teams.find(t => t.name === loser);
      if (!winnerTeamObj || !loserTeamObj) return false;

      // Рейтинг команд: победа +10, поражение -5 (но не ниже 0).
      winnerTeamObj.points = Math.max(0, Number(winnerTeamObj.points || 0) + 10);
      loserTeamObj.points = Math.max(0, Number(loserTeamObj.points || 0) - 5);
      winnerTeamObj.wins = Number(winnerTeamObj.wins || 0) + 1;
      loserTeamObj.losses = Number(loserTeamObj.losses || 0) + 1;
      setTeams(teams);

      // LTS игрока: победа +5, поражение -3. LTS не смешивается с rating.
      [winnerTeamObj, loserTeamObj].forEach(teamObj => {
        const isWinner = teamObj === winnerTeamObj;
        (teamObj.roster || []).forEach(playerName => {
          const data = getPlayerData(teamObj.id, playerName);
          data.lts = Math.max(0, Number(data.lts || 0) + (isWinner ? 5 : -3));
          data.matches = Number(data.matches || 0) + 1;
          if (isWinner) data.wins = Number(data.wins || 0) + 1;
          else data.losses = Number(data.losses || 0) + 1;
          savePlayerData(teamObj.id, playerName, data);
        });
      });

      match.statsAwarded = true;
      match.statsAwardedAt = Date.now();
      match.statsAwardedVersion = 'V15';
      return true;
    }

    window.resolveMatchWithScore = function(matchId) {
      const tournaments = getTournaments();
      const tourn = tournaments.find(t => t.id === currentTournamentId);
      if (!tourn) return;
      const match = tourn.bracket.find(m => m.id === matchId);
      if (!match) return;
      if (match.teamA === 'TBD' || match.teamB === 'TBD') { showNotification('Ошибка', 'Обе команды должны быть определены', 'fa-times-circle'); return; }
      if (match.status === 'finished' && match.statsAwarded) {
        showNotification('Матч уже завершён', 'Рейтинг и LTS за этот результат уже начислены.', 'fa-info-circle');
        return;
      }
      const isGrandFinal = match.isGrandFinal || false;
      const maxWins = isGrandFinal ? 3 : 2;
      const formatLabel = isGrandFinal ? 'Best of 5' : 'Best of 3';
      const scoreInput = prompt(`Введите счёт (${formatLabel}):\nФормат: X:Y\nДля победы нужно ${maxWins} побед\nПример: 2:0 или 2:1`, '2:0');
      if (!scoreInput) return;
      if (!scoreInput.includes(':')) { showNotification('Ошибка', 'Используйте формат X:Y', 'fa-times-circle'); return; }
      const parts = scoreInput.split(':');
      if (parts.length !== 2) { showNotification('Ошибка', 'Используйте формат X:Y', 'fa-times-circle'); return; }
      const scoreA = parseInt(parts[0]) || 0;
      const scoreB = parseInt(parts[1]) || 0;
      if (!isValidSeriesScore(scoreInput, match, true)) { showNotification('Ошибка', `Для ${formatLabel} нужна победа ${isGrandFinal ? '3:0, 3:1 или 3:2' : '2:0 или 2:1'} .`, 'fa-times-circle'); return; }
      match.score = scoreInput;
      markBracketMatchUpdated(match);
      const winner = determineWinner(scoreInput, match.teamA, match.teamB, match);
      if (winner) {
        match.winner = winner;
        match.status = 'finished';
        match.loser = winner === match.teamA ? match.teamB : match.teamA;
        advanceBracketAfterResult(tourn, match);
      }
      
      const matches = getMatches();
      const matchInList = matches.find(m => m.teamA === match.teamA && m.teamB === match.teamB && m.tournament === tourn.name);
      if (matchInList) { 
        matchInList.score = scoreInput; 
        matchInList.status = 'finished';
        matchInList.winner = winner;
        setMatches(matches); 
      }
      
      if (winner) {
        const loserTeam = winner === match.teamA ? match.teamB : match.teamA;
        const awarded = applyMatchResultStats(match, winner, loserTeam);
        if (!awarded && match.statsAwarded) {
          showNotification('Матч уже учтён', 'Очки рейтинга и LTS за этот матч уже были начислены.', 'fa-info-circle');
        }
        setTournaments(tournaments);
        forceRenderAll();
        renderDoubleEliminationBracket(tourn);
        syncMatchesWithBracket();
        showNotification('Матч разрешён!', winner + ' победил со счётом ' + scoreInput, 'fa-check-circle');
      }
    };

    document.getElementById('matchTeamA').addEventListener('change', updateRostersPreview);
    document.getElementById('matchTeamB').addEventListener('change', updateRostersPreview);
    
    populateTeamSelects();
    populateTournamentSelect();
    autoStartTimer();
    populateSupportPlayerSelects();
    forceRenderAll();

    // Восстановление последней страницы после F5/обновления.
    setTimeout(() => {
      try {
        const route = JSON.parse(localStorage.getItem('ltl_current_route') || 'null');
        if (route?.page) {
          if (route.nested === 'player' && route.playerName) {
            const origin = route.origin === 'top-players' ? 'top-players' : 'teams';
            window.showPlayerDetail(route.teamId, route.playerName, origin);
          } else {
            navigateTo(route.page, true);
          }
        }
      } catch(e) { console.warn('Route restore failed', e); }
    }, 50);
    updateTotalUsersCount();
    updateOnlineCounter();
    
    // Фоновая автоматическая активность отключена: действия выполняются только по запросу пользователя.

  });

  // V9: прямой переход из карточки ТОП игрока в профиль.
  // Функция объявляется внутри основного IIFE, поэтому имеет доступ ко всем
  // внутренним функциям и состоянию приложения.
  window.LTL_openTopPlayer = function(playerName, teamId) {
    const name = String(playerName || '').trim();
    if (!name) return;
    try {
      // ВАЖНО: эта функция находится внутри основного IIFE и поэтому видит
      // настоящий showPlayerDetail и все внутренние функции приложения.
      window.showPlayerDetail(teamId || null, name, 'top-players');
    } catch (e) {
      console.error('LTL V10: не удалось открыть профиль:', e);
      if (typeof showNotification === 'function') showNotification('Ошибка', 'Не удалось открыть профиль игрока: ' + (e.message || 'неизвестная ошибка'), 'fa-exclamation-triangle');
    }
  };

  // Надёжное сохранение при долгой открытой вкладке/возврате из сна браузера.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      ltlFlushPending();
      try { ltlBootstrapBackend(); } catch (_) {}
      forceRenderAll();
    } else {
      ltlFlushPending();
    }
  });
  window.addEventListener('focus', () => { ltlFlushPending(); });
  window.addEventListener('pageshow', () => { ltlFlushPending(); });
  window.addEventListener('online', () => { ltlFlushPending(); });

  setTimeout(() => { ltlMigrateLegacyMedia(); }, 2500);
})();
