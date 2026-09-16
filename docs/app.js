/* YUマーケット
   山口大学の学内で不要になった物を無償でゆずりあうサイト。
   ログイン・プロフィール・出品・申込は Supabase に保存する。
   公開していない「欲しいです」と欲しいものリストだけは、この端末の localStorage に残している。 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
     データ
  ------------------------------------------------------------------ */
  var OPTIONS = {
    category: ["家具", "家電", "教科書", "その他"],
    color: ["ホワイト", "ブラック", "ブラウン", "グレー", "ナチュラル", "その他"],
    condition: ["未使用に近い", "目立った傷なし", "やや傷や汚れあり", "傷や汚れあり", "書き込みあり"],
    period: ["今週中", "今月中", "相談可"],
    pickup: ["大学構内", "最寄り駅", "学生寮"],
    campus: ["吉田", "常盤", "小串"]
  };

  // 検索画面の絞り込み項目（ワイヤーフレームの並び）。
  var FILTERS = [
    { key: "category", label: "カテゴリー" },
    { key: "color", label: "色" },
    { key: "pickup", label: "受取場所" },
    { key: "period", label: "取引可能期間" },
    { key: "campus", label: "キャンパス" }
  ];

  var MAX_PHOTO_SIDE = 1024;

  // iPhone の写真（HEIC）を読めないブラウザ向けの変換ライブラリ。必要になったときだけ読み込む。
  var HEIC_CONVERTER_URL = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";

  var LISTING_STATUS = { open: "出品中", reserved: "取引中", done: "譲渡済み", cancelled: "取消済み" };
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 「欲しいです」と欲しいものリストは今回は公開しない。コードは残し、ルートと入口だけ閉じる。
  var ENABLE_WANTS = false;

  var UNIVERSITY_EMAIL = /@yamaguchi-u\.ac\.jp$/i;

  // window.supabase はライブラリ本体。接続先は config.js。
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ------------------------------------------------------------------
     共通ヘルパー
  ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function setError(input, output, message) {
    if (output) output.textContent = message || "";
    if (input) input.classList.toggle("invalid", Boolean(message));
    return !message;
  }

  function go(hash) {
    if (window.location.hash === hash) route();
    else window.location.hash = hash;
  }

  var toastTimer = null;
  function toast(text) {
    var box = $("toast");
    box.textContent = text;
    box.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      box.classList.remove("show");
    }, 2400);
  }

  function showLoginNote(text) {
    var note = $("login-note");
    note.textContent = text;
    note.hidden = !text;
  }

  function formatDate(value) {
    if (!value) return "";
    var parts = String(value).split("-");
    if (parts.length !== 3) return value;
    return Number(parts[0]) + "年" + Number(parts[1]) + "月" + Number(parts[2]) + "日";
  }

  // Date（または created_at の文字列）を、この端末の日付で "YYYY-MM-DD" にする。
  function dateOf(value) {
    var date = new Date(value);
    var month = String(date.getMonth() + 1);
    var day = String(date.getDate());
    return date.getFullYear() + "-" + (month.length < 2 ? "0" + month : month) + "-" + (day.length < 2 ? "0" + day : day);
  }

  function today() {
    return dateOf(new Date());
  }

  function setPhoto(element, url) {
    element.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
  }

  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      var source = URL.createObjectURL(blob);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(source);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(source);
        reject(new Error("画像を読み込めませんでした"));
      };
      image.src = source;
    });
  }

  // 拡張子や MIME が付いていないこともあるので、中身の先頭（ftyp ボックス）でも判定する。
  async function isHeic(file) {
    if (/\.hei[cf]$/i.test(file.name || "") || /hei[cf]/i.test(file.type)) return true;
    var bytes = new Uint8Array(await file.slice(4, 12).arrayBuffer());
    return /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(String.fromCharCode.apply(null, bytes));
  }

  var heicConverter = null;
  function loadHeicConverter() {
    if (!heicConverter) {
      heicConverter = new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = HEIC_CONVERTER_URL;
        script.onload = function () { resolve(window.heic2any); };
        script.onerror = function () {
          heicConverter = null;
          reject(new Error("変換ライブラリを読み込めませんでした"));
        };
        document.head.appendChild(script);
      });
    }
    return heicConverter;
  }

  // スマホの写真はそのままだと重いので、長辺 1024px・品質 0.8 の JPEG に縮める。
  async function resizeImage(file) {
    var image;
    try {
      image = await loadImage(file);
    } catch (error) {
      // iPhone の HEIC 写真は Windows の Chrome などでは読めないので、JPEG に変換してから読む。
      if (!(await isHeic(file))) throw error;
      toast("写真を変換しています…");
      var heic2any = await loadHeicConverter();
      var converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      image = await loadImage(Array.isArray(converted) ? converted[0] : converted);
    }

    var scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    var context = canvas.getContext("2d");
    // 透過 PNG は JPEG にすると黒くなるので、白で下地を塗っておく。
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("画像を変換できませんでした"));
      }, "image/jpeg", 0.8);
    });
  }

  // Storage の photos/<自分のid>/ に上げて、公開 URL を返す。
  async function uploadPhoto(blob) {
    var path = cache.me + "/" + Date.now() + ".jpg";
    var result = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
    if (result.error) throw result.error;
    return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
  }

  /* ------------------------------------------------------------------
     保存データ
  ------------------------------------------------------------------ */
  // Supabase から読んだデータをメモリに持つ。描画は同期のまま cache を読み、
  // ログイン直後と書き込みの後に refresh() で入れ直す。
  var cache = { me: null, profiles: {}, listings: [], applications: [] };

  function refresh() {
    return Promise.all([
      sb.from("profiles").select("*"),
      sb.from("listings").select("*").order("created_at", { ascending: false }),
      sb.from("applications").select("*").order("created_at", { ascending: false })
    ]).then(function (results) {
      results.forEach(function (result) {
        if (result.error) throw result.error;
      });
      cache.profiles = {};
      results[0].data.forEach(function (row) { cache.profiles[row.id] = row; });
      cache.listings = results[1].data;
      cache.applications = results[2].data;
    });
  }

  // 読み込みに失敗してもログイン状態は保ち、再読み込みで取り直せるようにする。
  async function enter(session) {
    cache.me = session.user.id;
    try {
      await refresh();
    } catch (error) {
      toast("データを読み込めませんでした。再読み込みしてください");
    }
  }

  function leave() {
    cache.me = null;
    cache.profiles = {};
    cache.listings = [];
    cache.applications = [];
    contacts = {};
    go("#/login");
  }

  // 取引相手のメールアドレス。当事者で取引中・取引完了のときだけ RPC が返す。
  var contacts = {};

  function contactOf(applicationId) {
    if (!contacts[applicationId]) {
      contacts[applicationId] = sb.rpc("counterpart_email", { app_id: applicationId }).then(function (result) {
        if (result.error || !result.data) {
          delete contacts[applicationId];
          if (result.error) throw result.error;
        }
        return result.data;
      });
    }
    return contacts[applicationId];
  }

  // カードの index 行目（0 始まり）に連絡先を後から書き込む。
  function fillContact(card, index, applicationId) {
    var line = card.querySelectorAll(".body p")[index];
    line.textContent = "連絡先　読み込み中…";
    contactOf(applicationId).then(function (email) {
      line.textContent = "連絡先　" + (email || "表示できません");
    }, function () {
      line.textContent = "連絡先　読み込めませんでした";
    });
  }

  var store = {
    profile: function () {
      return cache.profiles[cache.me] || { id: cache.me, name: "", faculty: "", campus: "", photo_url: null };
    },
    listings: function () { return cache.listings; },
    applications: function () { return cache.applications; },
    wants: function () { return read("yum.wants", []); },
    saveWants: function (value) { return write("yum.wants", value); },
    favorites: function () { return read("yum.favorites", []); },
    saveFavorites: function (value) { return write("yum.favorites", value); }
  };

  // cache.listings は新しい順。取消・譲渡済みも含むので、探す画面では openProducts() を使う。
  function allProducts() {
    return store.listings();
  }

  function openProducts() {
    return allProducts().filter(function (item) { return item.status === "open"; });
  }

  function myListings() {
    return allProducts().filter(function (item) { return item.owner_id === cache.me; });
  }

  function allWants() {
    return store.wants();
  }

  function wantById(id) {
    var found = allWants().filter(function (item) { return String(item.id) === String(id); });
    return found[0] || null;
  }

  function isFavorite(id) {
    return store.favorites().some(function (value) { return String(value) === String(id); });
  }

  function toggleFavorite(id) {
    var list = store.favorites();
    var next = list.filter(function (value) { return String(value) !== String(id); });
    if (next.length === list.length) next.push(id);
    store.saveFavorites(next);
    return next.length > list.length;
  }

  function productById(id) {
    var found = allProducts().filter(function (item) { return String(item.id) === String(id); });
    return found[0] || null;
  }

  function listingOf(application) {
    return allProducts().filter(function (item) { return item.id === application.listing_id; })[0] || null;
  }

  // cache.applications には RLS で「自分の申込」と「自分の出品への申込」だけが入っている。
  function applicationsBy(status) {
    return store.applications().filter(function (item) {
      return item.status === status && item.applicant_id === cache.me;
    });
  }

  function receivedApplications() {
    return store.applications().filter(function (item) {
      var listing = listingOf(item);
      return listing && listing.owner_id === cache.me && item.applicant_id !== cache.me;
    });
  }

  function historyApplications() {
    return store.applications().filter(function (item) {
      var listing = listingOf(item);
      return item.status === "取引完了" && (item.applicant_id === cache.me || (listing && listing.owner_id === cache.me));
    });
  }

  function personLabel(id) {
    var profile = cache.profiles[id] || {};
    return [
      profile.name || "名前未設定",
      profile.faculty,
      profile.campus ? profile.campus + "キャンパス" : ""
    ].filter(Boolean).join("・");
  }

  /* ------------------------------------------------------------------
     商品カード
  ------------------------------------------------------------------ */
  function makeCard(item) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "card";

    var thumb = document.createElement("div");
    thumb.className = "thumb";
    setPhoto(thumb, item.photo_url);
    card.appendChild(thumb);

    var name = document.createElement("p");
    name.className = "name";
    name.textContent = item.name;
    card.appendChild(name);

    var meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = item.category + "・" + item.campus;
    card.appendChild(meta);

    card.addEventListener("click", function () { go("#/item/" + item.id); });
    return card;
  }

  // 商品にも「欲しいです」にも使う、丸い画像＋4行のカード。
  function makeResultCard(item, prefix) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "result-card";

    var round = document.createElement("div");
    round.className = "round";
    setPhoto(round, item.photo_url);
    card.appendChild(round);

    var lines = document.createElement("div");
    lines.className = "lines";
    [item.name, item.category, item.color, item.period].forEach(function (text, index) {
      var line = document.createElement("span");
      if (index > 0) line.className = "sub";
      line.textContent = text || "—";
      lines.appendChild(line);
    });
    card.appendChild(lines);

    card.addEventListener("click", function () { go((prefix || "#/item/") + item.id); });
    return card;
  }

  function fillGrid(grid, empty, items) {
    grid.innerHTML = "";
    items.forEach(function (item) { grid.appendChild(makeCard(item)); });
    empty.hidden = items.length > 0;
  }

  /* ------------------------------------------------------------------
     「▽」で開いて複数選べる絞り込み（出品の検索・欲しいですの検索）
  ------------------------------------------------------------------ */
  function filterGroup(container, onChange) {
    var selected = {};
    var panels = {};
    var counters = {};

    FILTERS.forEach(function (filter) {
      selected[filter.key] = [];

      var wrap = document.createElement("div");
      wrap.className = "filter";

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "filter-toggle";
      toggle.innerHTML = "<span></span><span class=\"caret\">▽</span><span class=\"count\"></span>";
      toggle.firstChild.textContent = filter.label;
      wrap.appendChild(toggle);

      var panel = document.createElement("div");
      panel.className = "filter-panel";
      panel.hidden = true;

      OPTIONS[filter.key].forEach(function (value) {
        var label = document.createElement("label");
        var box = document.createElement("input");
        box.type = "checkbox";
        box.value = value;
        box.addEventListener("change", function () {
          var list = selected[filter.key];
          var index = list.indexOf(value);
          if (box.checked && index < 0) list.push(value);
          if (!box.checked && index >= 0) list.splice(index, 1);
          changed();
        });
        label.appendChild(box);
        label.appendChild(document.createTextNode(value));
        panel.appendChild(label);
      });

      toggle.addEventListener("click", function () { panel.hidden = !panel.hidden; });

      wrap.appendChild(panel);
      container.appendChild(wrap);
      panels[filter.key] = panel;
      counters[filter.key] = toggle.querySelector(".count");
    });

    function changed() {
      FILTERS.forEach(function (filter) {
        var count = selected[filter.key].length;
        counters[filter.key].textContent = count ? "（" + count + "）" : "";
      });
      if (onChange) onChange();
    }

    function matches(item, keyword) {
      if (keyword) {
        var haystack = [item.name, item.category, item.color, item.description].join(" ");
        if (haystack.indexOf(keyword) < 0) return false;
      }
      return FILTERS.every(function (filter) {
        var list = selected[filter.key];
        return list.length === 0 || list.indexOf(item[filter.key]) >= 0;
      });
    }

    // 「その他」のように複数の項目で同じ選択肢名が使われるため、
    // チェックを外す対象はその項目のパネル内だけに限定する。
    function clear(key, value) {
      var list = selected[key];
      var index = list.indexOf(value);
      if (index >= 0) list.splice(index, 1);
      each(panels[key].querySelectorAll('input[type="checkbox"]'), function (box) {
        if (box.value === value) box.checked = false;
      });
      changed();
    }

    function active() {
      var list = [];
      FILTERS.forEach(function (filter) {
        selected[filter.key].forEach(function (value) {
          list.push({ key: filter.key, label: filter.label, value: value });
        });
      });
      return list;
    }

    return { matches: matches, clear: clear, active: active };
  }

  function makeChip(text, onRemove) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.innerHTML = "<span></span><span class=\"x\">×</span>";
    chip.firstChild.textContent = text;
    chip.addEventListener("click", onRemove);
    return chip;
  }

  function fillChips(container, keyword, filters, onKeyword, onRender) {
    container.innerHTML = "";
    var any = false;

    if (keyword) {
      any = true;
      container.appendChild(makeChip(keyword, function () {
        onKeyword("");
        onRender();
      }));
    }

    filters.active().forEach(function (entry) {
      any = true;
      container.appendChild(makeChip(entry.label + "：" + entry.value, function () {
        filters.clear(entry.key, entry.value);
        onRender();
      }));
    });

    container.hidden = !any;
  }

  /* ------------------------------------------------------------------
     「＋」で開いて1つだけ選ぶ入力（出品フォーム・欲しいです投稿フォーム）
  ------------------------------------------------------------------ */
  function pickerGroup(form) {
    var values = {};
    var fields = {};

    each(form.querySelectorAll(".sell-field[data-key]"), function (field) {
      var key = field.getAttribute("data-key");
      var button = field.querySelector(".picker");
      var panel = field.querySelector(".picker-panel");
      values[key] = "";
      fields[key] = field;

      OPTIONS[key].forEach(function (value) {
        var label = document.createElement("label");
        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = form.id + "-" + key;
        radio.value = value;
        radio.addEventListener("change", function () {
          values[key] = value;
          button.querySelector(".chosen").textContent = value;
          panel.hidden = true;
          setError(null, field.querySelector(".error"), "");
        });
        label.appendChild(radio);
        label.appendChild(document.createTextNode(value));
        panel.appendChild(label);
      });

      button.addEventListener("click", function () { panel.hidden = !panel.hidden; });
    });

    function validate() {
      var ok = true;
      Object.keys(fields).forEach(function (key) {
        var field = fields[key];
        if (values[key]) return;
        var label = field.querySelector(".picker span").textContent;
        setError(null, field.querySelector(".error"), label + "を選んでください");
        ok = false;
      });
      return ok;
    }

    function set(key, value) {
      var field = fields[key];
      if (!field || OPTIONS[key].indexOf(value) < 0) return;
      each(field.querySelectorAll(".picker-panel input"), function (radio) {
        radio.checked = radio.value === value;
      });
      values[key] = value;
      field.querySelector(".chosen").textContent = value;
    }

    function reset() {
      Object.keys(fields).forEach(function (key) {
        var field = fields[key];
        values[key] = "";
        each(field.querySelectorAll(".picker-panel input"), function (radio) {
          radio.checked = false;
        });
        field.querySelector(".chosen").textContent = "＋";
        field.querySelector(".picker-panel").hidden = true;
        setError(null, field.querySelector(".error"), "");
      });
    }

    return { values: values, validate: validate, set: set, reset: reset };
  }

  /* ------------------------------------------------------------------
     ログイン / 新規登録
  ------------------------------------------------------------------ */
  (function auth() {
    var loginForm = $("login-form");
    var email = $("login-email");
    var password = $("login-password");

    function loginErrorMessage(error) {
      if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
        return "メールアドレスの確認が済んでいません。確認メールのリンクを開いてください";
      }
      if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
        return "メールアドレスまたはパスワードが正しくありません";
      }
      return "ログインできませんでした。通信状況を確認して、もう一度お試しください";
    }

    function signupErrorMessage(error) {
      // ドメイン制限はDBのトリガーで弾くため、Supabase からは汎用のエラーしか返らない。
      if (/database error saving new user/i.test(error.message)) {
        return "登録できませんでした。山口大学のメールアドレスか確認してください";
      }
      if (error.code === "user_already_exists") return "このメールアドレスは登録済みです";
      if (error.code === "weak_password") return "推測されやすいパスワードです。別のパスワードにしてください";
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return "確認メールの送信が混み合っています。しばらく待ってからお試しください";
      }
      return "登録できませんでした。通信状況を確認して、もう一度お試しください";
    }

    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      var address = email.value.trim();
      var okEmail = address
        ? (EMAIL_PATTERN.test(address)
          ? setError(email, $("login-email-error"), "")
          : setError(email, $("login-email-error"), "メールアドレスの形式が正しくありません"))
        : setError(email, $("login-email-error"), "メールアドレスを入力してください");
      var okPassword = password.value
        ? setError(password, $("login-password-error"), "")
        : setError(password, $("login-password-error"), "パスワードを入力してください");
      if (!okEmail || !okPassword) return;

      var button = loginForm.querySelector('[type="submit"]');
      button.disabled = true;
      var result = await sb.auth.signInWithPassword({ email: address, password: password.value })
        .catch(function (error) { return { error: error }; });
      if (result.error) {
        button.disabled = false;
        setError(password, $("login-password-error"), loginErrorMessage(result.error));
        return;
      }

      password.value = "";
      showLoginNote("");
      await enter(result.data.session);
      button.disabled = false;
      go("#/home");
    });

    var signupForm = $("signup-form");
    var newEmail = $("signup-email");
    var newPassword = $("signup-password");
    var confirmPassword = $("signup-confirm");

    signupForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      var address = newEmail.value.trim();
      var okEmail = !address
        ? setError(newEmail, $("signup-email-error"), "メールアドレスを入力してください")
        : !EMAIL_PATTERN.test(address)
          ? setError(newEmail, $("signup-email-error"), "メールアドレスの形式が正しくありません")
          : !UNIVERSITY_EMAIL.test(address)
            ? setError(newEmail, $("signup-email-error"), "山口大学のメールアドレスで登録してください")
            : setError(newEmail, $("signup-email-error"), "");
      var okPassword = newPassword.value.length >= 8
        ? setError(newPassword, $("signup-password-error"), "")
        : setError(newPassword, $("signup-password-error"), "パスワードは8文字以上で入力してください");
      var okConfirm = confirmPassword.value === newPassword.value
        ? setError(confirmPassword, $("signup-confirm-error"), "")
        : setError(confirmPassword, $("signup-confirm-error"), "パスワードが一致しません");
      if (!okEmail || !okPassword || !okConfirm) return;

      var button = signupForm.querySelector('[type="submit"]');
      button.disabled = true;
      var result = await sb.auth.signUp({
        email: address,
        password: newPassword.value,
        // 開いているサイト（公開版かローカル）へ戻す。Supabase の Redirect URLs に無い場合は Site URL へ戻る。
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      }).catch(function (error) { return { error: error }; });
      button.disabled = false;

      if (result.error) {
        if (result.error.code === "weak_password") {
          setError(newPassword, $("signup-password-error"), signupErrorMessage(result.error));
        } else {
          setError(newEmail, $("signup-email-error"), signupErrorMessage(result.error));
        }
        return;
      }

      // 確認メールが有効なとき、登録済みのアドレスはエラーにならず identities が空で返る。
      var user = result.data.user;
      if (user && user.identities && user.identities.length === 0) {
        setError(newEmail, $("signup-email-error"), "このメールアドレスは登録済みです");
        return;
      }

      newPassword.value = "";
      confirmPassword.value = "";

      // Supabase 側で確認メールをオフにしている場合は、そのままログイン状態で返る。
      if (result.data.session) {
        await enter(result.data.session);
        toast("登録しました");
        go("#/home");
        return;
      }

      showLoginNote("確認メールを送りました。メール内のリンクを開いてください");
      go("#/login");
    });
  })();

  /* ------------------------------------------------------------------
     ホーム
  ------------------------------------------------------------------ */
  var home = (function () {
    var search = $("home-search");
    var categories = $("home-categories");

    OPTIONS.category.forEach(function (value) {
      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.value = value;
      box.addEventListener("change", render);
      label.appendChild(box);
      label.appendChild(document.createTextNode(value));
      categories.appendChild(label);
    });

    $("home-search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      results.setKeyword(search.value.trim());
      go("#/results");
    });

    function render() {
      var checked = [];
      each(categories.querySelectorAll("input:checked"), function (box) { checked.push(box.value); });
      var items = openProducts().filter(function (item) {
        return checked.length === 0 || checked.indexOf(item.category) >= 0;
      });

      // おすすめの仕組みはまだ無いので、新着の上位で代用する。
      fillGrid($("home-recommended"), $("home-recommended-empty"), items.slice(0, 4));

      fillGrid($("home-latest"), $("home-latest-empty"), items.slice(0, 6));
    }

    return { render: render };
  })();

  /* ------------------------------------------------------------------
     検索（絞り込み＋一覧）
  ------------------------------------------------------------------ */
  var search = (function () {
    var input = $("search-input");
    var filters = filterGroup($("search-filters"), function () { render(); });

    $("search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      results.setKeyword(input.value.trim());
      go("#/results");
    });

    function render() {
      fillGrid($("search-results"), $("search-empty"),
        openProducts().filter(function (item) {
          return filters.matches(item, input.value.trim());
        }));
    }

    return {
      render: render,
      filters: filters,
      keyword: function () { return input.value.trim(); },
      setKeyword: function (value) { input.value = value; }
    };
  })();

  /* ------------------------------------------------------------------
     検索結果（リスト表示）
  ------------------------------------------------------------------ */
  var results = (function () {
    var keyword = "";

    function setKeyword(value) {
      keyword = value;
      search.setKeyword(value);
    }

    function render() {
      $("results-title").textContent = keyword
        ? "“" + keyword + "”検索結果"
        : "検索結果";

      fillChips($("results-chips"), keyword, search.filters, setKeyword, render);

      var list = $("results-list");
      list.innerHTML = "";
      var items = openProducts().filter(function (item) {
        return search.filters.matches(item, keyword);
      });
      items.forEach(function (item) { list.appendChild(makeResultCard(item)); });
      $("results-empty").hidden = items.length > 0;
    }

    return { render: render, setKeyword: setKeyword };
  })();

  /* ------------------------------------------------------------------
     「欲しいです」（ゆずってほしい物の募集）
  ------------------------------------------------------------------ */
  var wants = (function () {
    var input = $("wants-input");
    var filters = filterGroup($("wants-filters"), function () { /* 結果画面で反映する */ });
    var keyword = "";

    $("wants-form").addEventListener("submit", function (event) {
      event.preventDefault();
      open();
    });

    $("wants-search").addEventListener("click", open);

    function open() {
      keyword = input.value.trim();
      go("#/wants-results");
    }

    function setKeyword(value) {
      keyword = value;
      input.value = value;
    }

    function render() {
      $("wants-results-title").textContent = keyword
        ? "“" + keyword + "”検索結果"
        : "“欲しいです”検索結果";

      fillChips($("wants-chips"), keyword, filters, setKeyword, render);

      var list = $("wants-list");
      list.innerHTML = "";
      var items = allWants().filter(function (item) {
        return filters.matches(item, keyword);
      });
      items.forEach(function (item) { list.appendChild(makeResultCard(item, "#/want/")); });
      $("wants-empty").hidden = items.length > 0;
    }

    return { render: render, setKeyword: setKeyword };
  })();

  var wantDetail = (function () {
    var current = null;

    $("want-offer").addEventListener("click", function () {
      if (!current) return;
      sell.prefill(current);
      toast("募集内容を出品フォームに反映しました");
      go("#/sell");
    });

    $("want-delete").addEventListener("click", function () {
      if (!current) return;
      store.saveWants(store.wants().filter(function (item) { return item.id !== current.id; }));
      toast("投稿を取り消しました");
      go("#/my-wants");
    });

    function render(id) {
      var want = wantById(id);
      current = want;
      if (!want) {
        go("#/wants");
        return;
      }

      $("want-name").textContent = want.name;
      $("want-description").textContent = want.description || "（補足はありません）";
      $("want-category").textContent = want.category;
      $("want-color").textContent = want.color;
      $("want-pickup").textContent = want.pickup;
      $("want-period").textContent = want.period;
      $("want-campus").textContent = want.campus;
      $("want-author").textContent = want.author;
      $("want-date").textContent = formatDate(want.createdAt);

      var mine = store.wants().some(function (item) { return item.id === want.id; });
      $("want-delete").hidden = !mine;
      $("want-offer").disabled = mine;
      $("want-note").hidden = !mine;
      if (mine) $("want-note").textContent = "自分が投稿した「欲しいです」です";
    }

    return { render: render };
  })();

  (function wantForm() {
    var form = $("want-form");
    var name = $("want-input-name");
    var description = $("want-input-description");
    var pickers = pickerGroup(form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var ok = name.value.trim()
        ? setError(name, $("want-name-error"), "")
        : setError(name, $("want-name-error"), "欲しい物を入力してください");

      if (!pickers.validate()) ok = false;
      if (!ok) return;

      var profile = store.profile();
      var list = store.wants();
      list.push({
        id: "w" + Date.now(),
        name: name.value.trim(),
        category: pickers.values.category,
        color: pickers.values.color,
        pickup: pickers.values.pickup,
        period: pickers.values.period,
        campus: pickers.values.campus,
        description: description.value.trim(),
        author: profile.name,
        createdAt: today()
      });
      store.saveWants(list);

      form.reset();
      pickers.reset();
      each(form.querySelectorAll(".error"), function (box) { box.textContent = ""; });
      toast("「欲しいです」を投稿しました");
      go("#/my-wants");
    });
  })();

  function renderMyWants() {
    var entries = store.wants().slice().reverse();
    renderEntryList("my-wants-list", "my-wants-empty", entries, function (entry) {
      return makeEntryCard(entry, [
        entry.name,
        "投稿日　" + formatDate(entry.createdAt),
        entry.category + "・" + entry.color + "・" + entry.period
      ], [
        {
          label: "投稿を見る",
          run: function () { go("#/want/" + entry.id); }
        },
        {
          label: "投稿を取り消す",
          run: function () {
            store.saveWants(store.wants().filter(function (item) { return item.id !== entry.id; }));
            toast("投稿を取り消しました");
            renderMyWants();
            renderBadges();
          }
        }
      ]);
    });
  }

  function renderFavorites() {
    var items = store.favorites().map(productById).filter(Boolean).reverse();
    var list = $("favorites-list");
    list.innerHTML = "";
    items.forEach(function (item) { list.appendChild(makeResultCard(item)); });
    $("favorites-empty").hidden = items.length > 0;
  }

  /* ------------------------------------------------------------------
     商品詳細
  ------------------------------------------------------------------ */
  var detail = (function () {
    var current = null;

    $("detail-apply").addEventListener("click", function () {
      if (current) go("#/apply/" + current.id);
    });

    $("detail-favorite").addEventListener("click", function () {
      if (!current) return;
      var added = toggleFavorite(current.id);
      renderFavoriteButton();
      toast(added ? "欲しいものリストに追加しました" : "欲しいものリストから外しました");
    });

    function renderFavoriteButton() {
      var button = $("detail-favorite");
      var on = current && isFavorite(current.id);
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.querySelector(".heart").textContent = on ? "♥" : "♡";
      $("detail-favorite-label").textContent = on ? "欲しいものリストに追加済み" : "欲しいものリストに追加";
    }

    function render(id) {
      var item = productById(id);
      current = item;
      if (!item) {
        go("#/search");
        return;
      }

      $("detail-name").textContent = item.name;
      setPhoto($("detail-photo"), item.photo_url);
      $("detail-description").textContent = item.description || "（説明はありません）";
      $("detail-category").textContent = item.category;
      $("detail-color").textContent = item.color || "指定なし";
      $("detail-condition").textContent = item.condition;
      $("detail-period").textContent = item.period;
      $("detail-pickup").textContent = item.pickup;
      $("detail-campus").textContent = item.campus;

      $("detail-owner").textContent = personLabel(item.owner_id);

      var applied = store.applications().some(function (entry) {
        return entry.listing_id === item.id && entry.applicant_id === cache.me
          && (entry.status === "申込中" || entry.status === "取引中");
      });
      var mine = item.owner_id === cache.me;
      var closed = item.status !== "open";

      var button = $("detail-apply");
      var note = $("detail-note");
      button.disabled = applied || mine || closed;
      note.hidden = !(applied || mine || closed);
      if (mine) note.textContent = "自分の出品です";
      else if (closed) note.textContent = "この商品の受付は終了しました";
      else if (applied) note.textContent = "この商品はすでに申し込み済みです";

      renderFavoriteButton();
    }

    return { render: render };
  })();

  /* ------------------------------------------------------------------
     申込確認
  ------------------------------------------------------------------ */
  var confirmView = (function () {
    var form = $("confirm-form");
    var date = $("confirm-date");
    var place = $("confirm-place");
    var message = $("confirm-message");
    var agree = $("confirm-agree");
    var current = null;

    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "選択してください";
    place.appendChild(blank);
    OPTIONS.pickup.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      place.appendChild(option);
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!current) return;

      var okDate = !date.value
        ? setError(null, $("confirm-date-error"), "受取可能日を選んでください")
        : (date.value < today()
          ? setError(null, $("confirm-date-error"), "今日以降の日付を選んでください")
          : setError(null, $("confirm-date-error"), ""));
      $("confirm-date-box").classList.toggle("invalid", !okDate);

      var okPlace = place.value
        ? setError(null, $("confirm-place-error"), "")
        : setError(null, $("confirm-place-error"), "受取希望場所を選んでください");
      $("confirm-place-box").classList.toggle("invalid", !okPlace);

      var okMessage = message.value.trim()
        ? setError(null, $("confirm-message-error"), "")
        : setError(null, $("confirm-message-error"), "メッセージを入力してください");
      $("confirm-message-box").classList.toggle("invalid", !okMessage);

      var okAgree = agree.checked
        ? setError(null, $("confirm-agree-error"), "")
        : setError(null, $("confirm-agree-error"), "利用規約への同意が必要です");

      if (!okDate || !okPlace || !okMessage || !okAgree) return;

      var button = form.querySelector('[type="submit"]');
      button.disabled = true;
      // supabase-js のクエリは then しか持たないので、.catch ではなく try で受ける。
      var result;
      try {
        result = await sb.from("applications").insert({
          listing_id: current.id,
          applicant_id: cache.me,
          date: date.value,
          place: place.value,
          message: message.value.trim()
        });
      } catch (error) {
        result = { error: error };
      }

      if (result.error) {
        button.disabled = false;
        // 23505: 同じ出品への有効な申込が既にある（one_active_application）
        // 42501: RLS で弾かれた（受付が終わった・自分の出品）
        if (result.error.code === "23505") toast("すでに申込済みです");
        else if (result.error.code === "42501") toast("この商品には申し込めません。画面を再読み込みしてください");
        else toast("申し込めませんでした。通信状況を確認して、もう一度お試しください");
        return;
      }

      try { await refresh(); } catch (error) { /* 次の読み込みで反映される */ }
      button.disabled = false;
      form.reset();
      toast("申し込みました");
      go("#/applications");
    });

    function render(id) {
      var item = productById(id);
      current = item;
      if (!item) {
        go("#/search");
        return;
      }
      if (item.status !== "open" || item.owner_id === cache.me) {
        go("#/item/" + item.id);
        return;
      }
      setPhoto($("confirm-photo"), item.photo_url);
      date.min = today();
      ["confirm-date-error", "confirm-place-error", "confirm-message-error", "confirm-agree-error"].forEach(function (key) {
        $(key).textContent = "";
      });
      ["confirm-date-box", "confirm-place-box", "confirm-message-box"].forEach(function (key) {
        $(key).classList.remove("invalid");
      });
    }

    return { render: render };
  })();

  /* ------------------------------------------------------------------
     出品
  ------------------------------------------------------------------ */
  var sell = (function () {
    var form = $("sell-form");
    var name = $("sell-name");
    var description = $("sell-description");
    var photoButton = $("sell-photo");
    var photoInput = $("sell-photo-input");
    var photoRemove = $("sell-photo-remove");
    var photoLabel = $("sell-photo-label");
    var pickers = pickerGroup(form);
    var chosen = pickers.values;
    var photo = null;    // 縮小済みの JPEG（Blob）。出品するときに Storage へ上げる。
    var preview = "";

    function showPhoto(blob) {
      if (preview) URL.revokeObjectURL(preview);
      photo = blob;
      preview = blob ? URL.createObjectURL(blob) : "";
      setPhoto(photoButton, preview);
      photoLabel.hidden = Boolean(blob);
      photoRemove.hidden = !blob;
    }

    photoButton.addEventListener("click", function () { photoInput.click(); });

    photoInput.addEventListener("change", async function () {
      var file = photoInput.files && photoInput.files[0];
      photoInput.value = "";
      if (!file) return;
      try {
        showPhoto(await resizeImage(file));
        setError(null, $("sell-photo-error"), "");
      } catch (error) {
        setError(null, $("sell-photo-error"), "この写真は読み込めませんでした。別の写真をお試しください");
      }
    });

    photoRemove.addEventListener("click", function () { showPhoto(null); });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      var ok = name.value.trim()
        ? setError(name, $("sell-name-error"), "")
        : setError(name, $("sell-name-error"), "商品名を入力してください");

      if (!pickers.validate()) ok = false;

      if (!description.value.trim()) {
        setError(description, $("sell-description-error"), "商品の説明を入力してください");
        ok = false;
      } else {
        setError(description, $("sell-description-error"), "");
      }

      if (!photo) {
        setError(null, $("sell-photo-error"), "写真を追加してください");
        ok = false;
      }

      if (!ok) return;

      var button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        var photoUrl = await uploadPhoto(photo);
        var result = await sb.from("listings").insert({
          owner_id: cache.me,
          name: name.value.trim(),
          category: chosen.category,
          color: chosen.color,
          condition: chosen.condition,
          period: chosen.period,
          pickup: chosen.pickup,
          campus: chosen.campus,
          description: description.value.trim(),
          photo_url: photoUrl
        });
        if (result.error) throw result.error;
      } catch (error) {
        button.disabled = false;
        toast("出品できませんでした。通信状況を確認して、もう一度お試しください");
        return;
      }

      // 出品自体は済んでいるので、読み直しに失敗しても二重に出品させないよう完了扱いにする。
      try { await refresh(); } catch (error) { /* 次の読み込みで反映される */ }
      button.disabled = false;
      reset();
      toast("出品しました");
      go("#/listings");
    });

    function reset() {
      form.reset();
      showPhoto(null);
      pickers.reset();
      each(form.querySelectorAll(".error"), function (box) { box.textContent = ""; });
      $("sell-photo-error").textContent = "";
    }

    // 「欲しいです」の募集内容を出品フォームに引き継ぐ。
    function prefill(want) {
      reset();
      name.value = want.name;
      ["category", "color", "pickup", "period", "campus"].forEach(function (key) {
        pickers.set(key, want[key]);
      });
    }

    return { prefill: prefill };
  })();

  /* ------------------------------------------------------------------
     申込中 / 取引中 / 取引履歴 / 出品中
  ------------------------------------------------------------------ */
  function makeEntryCard(entry, lines, actions) {
    var card = document.createElement("div");
    card.className = "app-card";

    var thumb = document.createElement("div");
    thumb.className = "thumb";
    setPhoto(thumb, entry.photo_url);
    card.appendChild(thumb);

    var body = document.createElement("div");
    body.className = "body";
    lines.forEach(function (line, index) {
      var p = document.createElement("p");
      if (index > 0) p.className = "sub";
      p.textContent = line;
      body.appendChild(p);
    });

    if (entry.status) {
      var status = document.createElement("span");
      status.className = "status";
      status.textContent = entry.status;
      body.appendChild(status);
    }

    if (actions && actions.length) {
      var row = document.createElement("div");
      row.className = "card-actions";
      actions.forEach(function (action) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "mini-button";
        button.textContent = action.label;
        button.addEventListener("click", action.run);
        row.appendChild(button);
      });
      body.appendChild(row);
    }

    card.appendChild(body);
    return card;
  }

  function renderEntryList(listId, emptyId, entries, build) {
    var list = $(listId);
    list.innerHTML = "";
    entries.forEach(function (entry) { list.appendChild(build(entry)); });
    $(emptyId).hidden = entries.length > 0;
  }

  // 状態を変える操作は RPC だけで行う（applications.status はクライアントから更新できない）。
  async function changeApplication(rpc, application, button, question, doneText, rerender) {
    if (!window.confirm(question)) return;
    button.disabled = true;
    var result;
    try {
      result = await sb.rpc(rpc, { app_id: application.id });
    } catch (error) {
      result = { error: error };
    }
    if (result.error) {
      button.disabled = false;
      toast(/not allowed/i.test(result.error.message || "")
        ? "この操作はできませんでした。画面を再読み込みしてください"
        : "通信に失敗しました。もう一度お試しください");
      return;
    }
    try { await refresh(); } catch (error) { /* 次の読み込みで反映される */ }
    toast(doneText);
    rerender();
    renderBadges();
  }

  // 申込者側のカード。写真と商品名は出品から引く。
  function applicationCard(entry, lines, actions) {
    var listing = listingOf(entry) || {};
    return makeEntryCard(Object.assign({}, entry, { photo_url: listing.photo_url }),
      [listing.name || "（商品が見つかりません）"].concat(lines), actions);
  }

  function renderApplications() {
    renderEntryList("applications-list", "applications-empty", applicationsBy("申込中"), function (entry) {
      return applicationCard(entry, [
        "申込日　" + formatDate(dateOf(entry.created_at)),
        "希望日　" + formatDate(entry.date)
      ], [
        {
          label: "申し込みを取り消す",
          run: function (event) {
            changeApplication("cancel_application", entry, event.currentTarget,
              "この申し込みを取り消しますか？", "申し込みを取り消しました", renderApplications);
          }
        }
      ]);
    });
  }

  function renderDeals() {
    renderEntryList("deals-list", "deals-empty", applicationsBy("取引中"), function (entry) {
      var card = applicationCard(entry, [
        "受取日　" + formatDate(entry.date),
        "受取場所　" + entry.place,
        "連絡先",
        "出品者が完了処理をすると履歴に移ります"
      ], []);
      fillContact(card, 3, entry.id);
      return card;
    });
  }

  function renderHistory() {
    renderEntryList("history-list", "history-empty", historyApplications(), function (entry) {
      return applicationCard(entry, [
        "取引完了日　" + formatDate(dateOf(entry.completed_at || entry.created_at)),
        entry.applicant_id === cache.me ? "ゆずってもらいました" : "ゆずりました"
      ], []);
    });
  }

  // 出品者側: 自分の出品に届いた申込を、出品ごとにまとめて表示する。
  function renderReceived() {
    var list = $("received-list");
    var entries = receivedApplications().filter(function (item) {
      return item.status === "申込中" || item.status === "取引中";
    });
    list.innerHTML = "";

    myListings().forEach(function (listing) {
      var mine = entries.filter(function (item) { return item.listing_id === listing.id; });
      if (!mine.length) return;
      var heading = document.createElement("h3");
      heading.className = "section-title";
      heading.textContent = listing.name;
      list.appendChild(heading);
      mine.forEach(function (entry) { list.appendChild(receivedCard(entry, listing)); });
    });

    $("received-empty").hidden = entries.length > 0;
  }

  function receivedCard(entry, listing) {
    var lines = [personLabel(entry.applicant_id)];
    var actions;

    if (entry.status === "申込中") {
      lines.push(
        "希望日　" + formatDate(entry.date),
        "希望場所　" + entry.place,
        "メッセージ　" + (entry.message || "")
      );
      actions = [
        {
          label: "承認する",
          run: function (event) {
            changeApplication("approve_application", entry, event.currentTarget,
              "承認すると、この出品へのほかの申込は自動で取り消されます。承認しますか？",
              "承認しました。相手の連絡先が表示されます", renderReceived);
          }
        },
        {
          label: "断る",
          run: function (event) {
            changeApplication("cancel_application", entry, event.currentTarget,
              "この申込を断りますか？", "申込を断りました", renderReceived);
          }
        }
      ];
    } else {
      lines.push(
        "受取日　" + formatDate(entry.date),
        "受取場所　" + entry.place,
        "連絡先"
      );
      actions = [
        {
          label: "受け渡し完了",
          run: function (event) {
            changeApplication("complete_application", entry, event.currentTarget,
              "受け渡しは済みましたか？完了にすると元に戻せません。", "取引が完了しました", renderReceived);
          }
        },
        {
          label: "取り消す",
          run: function (event) {
            changeApplication("cancel_application", entry, event.currentTarget,
              "この取引を取り消しますか？出品は受付中に戻ります。", "取引を取り消しました", renderReceived);
          }
        }
      ];
    }

    var card = makeEntryCard(Object.assign({}, entry, { photo_url: listing.photo_url }), lines, actions);
    if (entry.status === "取引中") fillContact(card, 3, entry.id);
    return card;
  }

  function renderListings() {
    renderEntryList("listings-list", "listings-empty", myListings(), function (entry) {
      var actions = [
        {
          label: "商品ページを見る",
          run: function () { go("#/item/" + entry.id); }
        }
      ];

      // 取引中の出品は申込側と状態がずれるので、ここでは受付中のものだけ取り消せる。
      if (entry.status === "open") {
        actions.push({
          label: "出品を取り消す",
          run: async function (event) {
            if (!window.confirm("「" + entry.name + "」の出品を取り消しますか？")) return;
            var button = event.currentTarget;
            button.disabled = true;
            var result = await sb.from("listings").update({ status: "cancelled" }).eq("id", entry.id).select();
            if (result.error || !result.data || !result.data.length) {
              button.disabled = false;
              toast("取り消せませんでした。もう一度お試しください");
              return;
            }
            try { await refresh(); } catch (error) { entry.status = "cancelled"; }
            toast("出品を取り消しました");
            renderListings();
            renderBadges();
          }
        });
      }

      return makeEntryCard(Object.assign({}, entry, { status: LISTING_STATUS[entry.status] }), [
        entry.name,
        "出品日　" + formatDate(dateOf(entry.created_at)),
        entry.category + "・" + entry.campus
      ], actions);
    });
  }

  function renderBadges() {
    $("badge-listings").textContent = countLabel(myListings().filter(function (item) {
      return item.status === "open";
    }).length);
    $("badge-favorites").textContent = countLabel(store.favorites().length);
    $("badge-wants").textContent = countLabel(store.wants().length);
    $("badge-received").textContent = countLabel(receivedApplications().filter(function (item) {
      return item.status === "申込中";
    }).length);
    $("badge-applications").textContent = countLabel(applicationsBy("申込中").length);
    $("badge-deals").textContent = countLabel(applicationsBy("取引中").length);
    $("badge-history").textContent = countLabel(historyApplications().length);
  }

  function countLabel(count) {
    return count ? count + "件" : "";
  }

  /* ------------------------------------------------------------------
     プロフィール
  ------------------------------------------------------------------ */
  var mypage = (function () {
    var form = $("mypage-form");
    var view = $("mypage-view");
    var avatar = $("mypage-avatar");
    var avatarInput = $("mypage-avatar-input");
    var campusSelect = $("mypage-input-campus");

    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "選択してください";
    campusSelect.appendChild(blank);
    OPTIONS.campus.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      campusSelect.appendChild(option);
    });

    avatar.addEventListener("click", function () { avatarInput.click(); });

    avatarInput.addEventListener("change", async function () {
      var file = avatarInput.files && avatarInput.files[0];
      avatarInput.value = "";
      if (!file) return;
      avatar.disabled = true;
      try {
        var url = await uploadPhoto(await resizeImage(file));
        var result = await sb.from("profiles").update({ photo_url: url }).eq("id", cache.me).select();
        if (result.error || !result.data || !result.data.length) throw result.error || new Error("更新できませんでした");
        cache.profiles[cache.me] = result.data[0];
      } catch (error) {
        avatar.disabled = false;
        toast("プロフィール画像を保存できませんでした");
        return;
      }
      try { await refresh(); } catch (error) { /* 保存済みの行を表示する */ }
      avatar.disabled = false;
      setPhoto(avatar, store.profile().photo_url);
      toast("プロフィール画像を変更しました");
    });

    $("mypage-edit").addEventListener("click", function () { setEditing(true); });
    $("mypage-cancel").addEventListener("click", function () { setEditing(false); });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var name = $("mypage-input-name");
      var faculty = $("mypage-input-faculty");

      var okName = name.value.trim()
        ? setError(name, $("mypage-name-error"), "")
        : setError(name, $("mypage-name-error"), "名前を入力してください");
      var okFaculty = faculty.value.trim()
        ? setError(faculty, $("mypage-faculty-error"), "")
        : setError(faculty, $("mypage-faculty-error"), "学部を入力してください");
      var okCampus = campusSelect.value
        ? setError(campusSelect, $("mypage-campus-error"), "")
        : setError(campusSelect, $("mypage-campus-error"), "キャンパスを選んでください");
      if (!okName || !okFaculty || !okCampus) return;

      var button = form.querySelector('[type="submit"]');
      button.disabled = true;
      // RLS で弾かれた更新はエラーにならず0件で返るので、select() で更新できた行を確かめる。
      var result = await sb.from("profiles")
        .update({ name: name.value.trim(), faculty: faculty.value.trim(), campus: campusSelect.value })
        .eq("id", cache.me)
        .select();
      var saved = result.data && result.data[0];
      if (result.error || !saved) {
        button.disabled = false;
        toast("保存できませんでした。もう一度お試しください");
        return;
      }
      try {
        await refresh();
      } catch (error) {
        cache.profiles[cache.me] = saved;
      }
      button.disabled = false;
      setEditing(false);
      render();
      toast("プロフィールを保存しました");
    });

    function setEditing(editing) {
      form.hidden = !editing;
      view.hidden = editing;
      if (editing) {
        var profile = store.profile();
        $("mypage-input-name").value = profile.name;
        $("mypage-input-faculty").value = profile.faculty;
        campusSelect.value = profile.campus;
      }
    }

    function render() {
      var profile = store.profile();
      setPhoto(avatar, profile.photo_url);
      $("mypage-name").textContent = profile.name || "名前未設定";
      $("mypage-faculty").textContent = profile.faculty;
      $("mypage-campus").textContent = profile.campus ? profile.campus + "キャンパス" : "";
      setEditing(false);
      renderBadges();
    }

    return { render: render };
  })();

  /* ------------------------------------------------------------------
     設定
  ------------------------------------------------------------------ */
  // この端末だけログアウトする（ほかの端末のログインは残す）。
  $("settings-logout").addEventListener("click", async function () {
    await sb.auth.signOut({ scope: "local" });
    if (cache.me) leave();
  });

  /* ------------------------------------------------------------------
     ルーティング
  ------------------------------------------------------------------ */
  var ROUTES = {
    "#/login": { view: "view-login", tabs: false, auth: false },
    "#/signup": { view: "view-signup", tabs: false, auth: false },
    "#/home": { view: "view-home", tabs: true, tab: "#/home", render: function () { home.render(); } },
    "#/search": { view: "view-search", tabs: true, tab: "#/search", render: function () { search.render(); } },
    "#/results": { view: "view-results", tabs: true, tab: "#/search", render: function () { results.render(); } },
    "#/wants": { view: "view-wants", tabs: true, tab: "#/search" },
    "#/wants-results": { view: "view-wants-results", tabs: true, tab: "#/search", render: function () { wants.render(); } },
    "#/want-new": { view: "view-want-new", tabs: true, tab: "#/search" },
    "#/my-wants": { view: "view-my-wants", tabs: true, tab: "#/mypage", render: renderMyWants },
    "#/favorites": { view: "view-favorites", tabs: true, tab: "#/mypage", render: renderFavorites },
    "#/sell": { view: "view-sell", tabs: true, tab: "#/sell" },
    "#/terms": { view: "view-terms", tabs: true, tab: "#/mypage", auth: "any" },
    "#/applications": { view: "view-applications", tabs: true, tab: "#/mypage", render: renderApplications },
    "#/received": { view: "view-received", tabs: true, tab: "#/mypage", render: renderReceived },
    "#/listings": { view: "view-listings", tabs: true, tab: "#/mypage", render: renderListings },
    "#/deals": { view: "view-deals", tabs: true, tab: "#/deals", render: renderDeals },
    "#/history": { view: "view-history", tabs: true, tab: "#/mypage", render: renderHistory },
    "#/settings": { view: "view-settings", tabs: true, tab: "#/mypage" },
    "#/mypage": { view: "view-mypage", tabs: true, tab: "#/mypage", render: function () { mypage.render(); } }
  };

  if (!ENABLE_WANTS) {
    ["#/wants", "#/wants-results", "#/want-new", "#/my-wants", "#/favorites"].forEach(function (hash) {
      delete ROUTES[hash];
    });
    each(document.querySelectorAll(
      "#view-search .switcher, #detail-favorite, #mypage-menu [data-go='#/favorites'], #mypage-menu [data-go='#/my-wants']"
    ), function (element) {
      element.hidden = true;
    });
  }

  function route() {
    var hash = window.location.hash || "#/login";
    var match = (ENABLE_WANTS ? /^#\/(item|apply|want)\/(.+)$/ : /^#\/(item|apply)\/(.+)$/).exec(hash);
    var config;
    var param = null;

    if (match) {
      param = match[2];
      if (match[1] === "item") {
        config = { view: "view-detail", tabs: true, tab: "#/search", render: function () { detail.render(param); } };
      } else if (match[1] === "apply") {
        config = { view: "view-confirm", tabs: true, tab: "#/search", render: function () { confirmView.render(param); } };
      } else {
        config = { view: "view-want-detail", tabs: true, tab: "#/search", render: function () { wantDetail.render(param); } };
      }
    } else {
      config = ROUTES[hash];
    }

    if (!config) {
      go(cache.me ? "#/home" : "#/login");
      return;
    }

    // auth: false はログイン前だけの画面、"any" はどちらでも開ける画面（利用規約）。
    if (config.auth !== false && config.auth !== "any" && !cache.me) {
      go("#/login");
      return;
    }

    if (cache.me && config.auth === false) {
      go("#/home");
      return;
    }

    each(document.querySelectorAll(".view"), function (view) {
      view.hidden = view.id !== config.view;
    });

    var tabbar = $("tabbar");
    tabbar.hidden = !(config.tabs && cache.me);
    each(tabbar.querySelectorAll(".tab"), function (tab) {
      if (config.tab && tab.getAttribute("data-go") === config.tab) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });

    if (config.render) config.render();
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest ? event.target.closest("[data-go], [data-back]") : null;
    if (!target) return;
    if (target.hasAttribute("data-back")) {
      event.preventDefault();
      if (window.history.length > 1) window.history.back();
      else go("#/home");
      return;
    }
    event.preventDefault();
    go(target.getAttribute("data-go"));
  });

  // 確認メールのリンクから戻ると、URL に #access_token=... や ?code=... が付いている。
  // ルーターが先に動くと未知のハッシュとして #/login へ書き換え、トークンを読めなくなる。
  // そのため supabase-js のセッション取得を待ち、URL を掃除してからルーターを動かす。
  function readAuthCallback() {
    var hash = window.location.hash.slice(1);
    var fromHash = new URLSearchParams(hash.indexOf("=") >= 0 ? hash : "");
    var fromQuery = new URLSearchParams(window.location.search);
    return {
      present: fromHash.has("access_token") || fromHash.has("error") || fromQuery.has("code") || fromQuery.has("error"),
      error: fromHash.get("error_code") || fromHash.get("error") || fromQuery.get("error_code") || fromQuery.get("error")
    };
  }

  async function start() {
    var callback = readAuthCallback();
    var result = await sb.auth.getSession().catch(function () { return { data: { session: null } }; });
    var session = result.data.session;

    if (callback.present) window.history.replaceState(null, "", window.location.pathname);

    if (session) {
      await enter(session);
      if (callback.present) toast("メールアドレスを確認しました");
    } else if (callback.present) {
      showLoginNote(callback.error === "otp_expired"
        ? "確認リンクの有効期限が切れています。もう一度登録してください"
        : "確認リンクからログインできませんでした。メールアドレスとパスワードでログインしてください");
    }

    // ほかのタブでのログアウトやセッション切れ。このコールバック内では Supabase を await しない。
    sb.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT" && cache.me) leave();
    });

    window.addEventListener("hashchange", route);
    if (callback.present) go(cache.me ? "#/home" : "#/login");
    else route();
  }

  // 以前のデモ版が端末に残した平文パスワードとログイン状態を消す。
  ["yum.accounts", "yum.session"].forEach(function (key) {
    try { window.localStorage.removeItem(key); } catch (error) { /* 消せなくても続行する */ }
  });

  start();
})();
