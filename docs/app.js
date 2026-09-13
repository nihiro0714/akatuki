/* YUマーケット
   山口大学の学内で不要になった物を無償でゆずりあうサイト。
   サーバーはまだ無いため、アカウント・出品・申込はこの端末の
   localStorage にだけ保存している。公開時はサーバー側に置き換えること。 */
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

  var SAMPLE = [
    { id: 1, name: "木製ローテーブル", category: "家具", color: "ブラウン", condition: "目立った傷なし", pickup: "大学構内", period: "今週中", campus: "吉田", recommended: true, createdAt: "2026-09-04", description: "組み立て済み\n使用期間　1年" },
    { id: 2, name: "一人暮らし用 冷蔵庫", category: "家電", color: "ホワイト", condition: "やや傷や汚れあり", pickup: "学生寮", period: "相談可", campus: "常盤", recommended: true, createdAt: "2026-09-03", description: "動作確認済み\n使用期間　2年" },
    { id: 3, name: "微分積分学 教科書", category: "教科書", color: "その他", condition: "書き込みあり", pickup: "大学構内", period: "今週中", campus: "吉田", recommended: false, createdAt: "2026-09-06", description: "第3版\n書き込みあり" },
    { id: 4, name: "電子レンジ", category: "家電", color: "ブラック", condition: "目立った傷なし", pickup: "最寄り駅", period: "今月中", campus: "吉田", recommended: false, createdAt: "2026-09-06", description: "動作確認済み\n使用期間　2年" },
    { id: 5, name: "カラーボックス 3段", category: "家具", color: "ナチュラル", condition: "やや傷や汚れあり", pickup: "大学構内", period: "今月中", campus: "常盤", recommended: false, createdAt: "2026-09-05", description: "背板に小さな傷あり\n使用期間　3年" },
    { id: 6, name: "自転車用 空気入れ", category: "その他", color: "グレー", condition: "目立った傷なし", pickup: "最寄り駅", period: "相談可", campus: "小串", recommended: false, createdAt: "2026-09-05", description: "動作確認済み\n使用期間　1年" },
    { id: 7, name: "統計学入門 教科書", category: "教科書", color: "ホワイト", condition: "未使用に近い", pickup: "学生寮", period: "今月中", campus: "常盤", recommended: true, createdAt: "2026-09-01", description: "書き込みなし\n使用期間　半年" },
    { id: 8, name: "デスクライト", category: "その他", color: "ホワイト", condition: "目立った傷なし", pickup: "大学構内", period: "今週中", campus: "吉田", recommended: false, createdAt: "2026-09-02", description: "動作確認済み\n使用期間　2年" },
    { id: 9, name: "折りたたみ椅子", category: "家具", color: "ブラック", condition: "やや傷や汚れあり", pickup: "最寄り駅", period: "相談可", campus: "吉田", recommended: false, createdAt: "2026-09-04", description: "座面に汚れあり\n使用期間　2年" },
    { id: 10, name: "電気ケトル", category: "家電", color: "グレー", condition: "目立った傷なし", pickup: "大学構内", period: "今週中", campus: "小串", recommended: false, createdAt: "2026-09-03", description: "動作確認済み\n使用期間　1年" },
    { id: 11, name: "英語リーディング 教科書", category: "教科書", color: "その他", condition: "書き込みあり", pickup: "最寄り駅", period: "今月中", campus: "常盤", recommended: false, createdAt: "2026-09-02", description: "蛍光ペンでの書き込みあり\n使用期間　1年" },
    { id: 12, name: "衣類スタンド", category: "家具", color: "ナチュラル", condition: "未使用に近い", pickup: "学生寮", period: "相談可", campus: "吉田", recommended: true, createdAt: "2026-09-01", description: "組み立て説明書あり\n使用期間　半年" }
  ];

  var MAX_PHOTO_BYTES = 3 * 1024 * 1024;
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  function formatDate(value) {
    if (!value) return "";
    var parts = String(value).split("-");
    if (parts.length !== 3) return value;
    return Number(parts[0]) + "年" + Number(parts[1]) + "月" + Number(parts[2]) + "日";
  }

  function today() {
    var now = new Date();
    var month = String(now.getMonth() + 1);
    var day = String(now.getDate());
    return now.getFullYear() + "-" + (month.length < 2 ? "0" + month : month) + "-" + (day.length < 2 ? "0" + day : day);
  }

  function setPhoto(element, photo) {
    element.style.backgroundImage = photo ? "url(" + photo + ")" : "";
  }

  function readPhoto(file, onDone, onError) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      onError("画像は3MB以下にしてください");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () { onDone(String(reader.result)); };
    reader.onerror = function () { onError("画像を読み込めませんでした"); };
    reader.readAsDataURL(file);
  }

  /* ------------------------------------------------------------------
     保存データ
  ------------------------------------------------------------------ */
  var store = {
    accounts: function () { return read("yum.accounts", []); },
    saveAccounts: function (value) { return write("yum.accounts", value); },
    session: function () { return read("yum.session", null); },
    saveSession: function (value) { return write("yum.session", value); },
    profile: function () {
      return read("yum.profile", { name: "山口 太郎", faculty: "工学部", campus: "常盤", photo: "" });
    },
    saveProfile: function (value) { return write("yum.profile", value); },
    listings: function () { return read("yum.listings", []); },
    saveListings: function (value) { return write("yum.listings", value); },
    applications: function () { return read("yum.applications", []); },
    saveApplications: function (value) { return write("yum.applications", value); }
  };

  function allProducts() {
    return store.listings().concat(SAMPLE);
  }

  function productById(id) {
    var found = allProducts().filter(function (item) { return String(item.id) === String(id); });
    return found[0] || null;
  }

  function applicationsBy(status) {
    return store.applications().filter(function (item) { return item.status === status; });
  }

  function updateApplication(id, changes) {
    var list = store.applications().map(function (item) {
      if (String(item.id) !== String(id)) return item;
      Object.keys(changes).forEach(function (key) { item[key] = changes[key]; });
      return item;
    });
    store.saveApplications(list);
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
    setPhoto(thumb, item.photo);
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

  function makeResultCard(item) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "result-card";

    var round = document.createElement("div");
    round.className = "round";
    setPhoto(round, item.photo);
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

    card.addEventListener("click", function () { go("#/item/" + item.id); });
    return card;
  }

  function fillGrid(grid, empty, items) {
    grid.innerHTML = "";
    items.forEach(function (item) { grid.appendChild(makeCard(item)); });
    empty.hidden = items.length > 0;
  }

  /* ------------------------------------------------------------------
     ログイン / 新規登録
  ------------------------------------------------------------------ */
  (function auth() {
    var loginForm = $("login-form");
    var email = $("login-email");
    var password = $("login-password");

    loginForm.addEventListener("submit", function (event) {
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

      var accounts = store.accounts();
      // 登録がまだ一件も無い場合は、動作確認のためそのまま通す。
      if (accounts.length > 0) {
        var matched = accounts.filter(function (account) {
          return account.email === address && account.password === password.value;
        })[0];
        if (!matched) {
          setError(password, $("login-password-error"), "メールアドレスまたはパスワードが正しくありません");
          return;
        }
      }

      store.saveSession({ email: address });
      password.value = "";
      go("#/home");
    });

    var signupForm = $("signup-form");
    var newEmail = $("signup-email");
    var newPassword = $("signup-password");
    var confirmPassword = $("signup-confirm");

    signupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var address = newEmail.value.trim();
      var okEmail = address
        ? (EMAIL_PATTERN.test(address)
          ? setError(newEmail, $("signup-email-error"), "")
          : setError(newEmail, $("signup-email-error"), "メールアドレスの形式が正しくありません"))
        : setError(newEmail, $("signup-email-error"), "メールアドレスを入力してください");
      var okPassword = newPassword.value.length >= 8
        ? setError(newPassword, $("signup-password-error"), "")
        : setError(newPassword, $("signup-password-error"), "パスワードは8文字以上で入力してください");
      var okConfirm = confirmPassword.value === newPassword.value
        ? setError(confirmPassword, $("signup-confirm-error"), "")
        : setError(confirmPassword, $("signup-confirm-error"), "パスワードが一致しません");
      if (!okEmail || !okPassword || !okConfirm) return;

      var accounts = store.accounts();
      if (accounts.some(function (account) { return account.email === address; })) {
        setError(newEmail, $("signup-email-error"), "このメールアドレスは登録済みです");
        return;
      }

      accounts.push({ email: address, password: newPassword.value });
      store.saveAccounts(accounts);
      store.saveSession({ email: address });
      newPassword.value = "";
      confirmPassword.value = "";
      toast("登録しました");
      go("#/home");
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
      var items = allProducts().filter(function (item) {
        return checked.length === 0 || checked.indexOf(item.category) >= 0;
      });

      fillGrid($("home-recommended"), $("home-recommended-empty"),
        items.filter(function (item) { return item.recommended; }).slice(0, 4));

      fillGrid($("home-latest"), $("home-latest-empty"),
        items.slice().sort(function (a, b) {
          return String(b.createdAt).localeCompare(String(a.createdAt));
        }).slice(0, 6));
    }

    return { render: render };
  })();

  /* ------------------------------------------------------------------
     検索（絞り込み＋一覧）
  ------------------------------------------------------------------ */
  var search = (function () {
    var input = $("search-input");
    var filters = $("search-filters");
    var selected = {};
    var panels = {};

    FILTERS.forEach(function (filter) {
      selected[filter.key] = [];

      var wrap = document.createElement("div");
      wrap.className = "filter";

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "filter-toggle";
      toggle.innerHTML = "<span>" + filter.label + "</span><span class=\"caret\">▽</span><span class=\"count\"></span>";
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
          render();
        });
        label.appendChild(box);
        label.appendChild(document.createTextNode(value));
        panel.appendChild(label);
      });

      toggle.addEventListener("click", function () {
        panel.hidden = !panel.hidden;
      });

      wrap.appendChild(panel);
      filters.appendChild(wrap);
      panels[filter.key] = panel;
    });

    $("search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      results.setKeyword(input.value.trim());
      go("#/results");
    });

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

    function render() {
      each(filters.querySelectorAll(".filter"), function (wrap, index) {
        var count = selected[FILTERS[index].key].length;
        wrap.querySelector(".count").textContent = count ? "（" + count + "）" : "";
      });

      var items = allProducts().filter(function (item) {
        return matches(item, input.value.trim());
      });
      fillGrid($("search-results"), $("search-empty"), items);
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
      render();
    }

    return {
      render: render,
      selected: function () { return selected; },
      clear: clear,
      matches: matches,
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

      var chips = $("results-chips");
      chips.innerHTML = "";
      var selected = search.selected();
      var any = false;

      if (keyword) {
        any = true;
        chips.appendChild(makeChip(keyword, function () {
          setKeyword("");
          render();
        }));
      }

      FILTERS.forEach(function (filter) {
        selected[filter.key].forEach(function (value) {
          any = true;
          chips.appendChild(makeChip(filter.label + "：" + value, function () {
            search.clear(filter.key, value);
            render();
          }));
        });
      });

      chips.hidden = !any;

      var list = $("results-list");
      list.innerHTML = "";
      var items = allProducts().filter(function (item) {
        return search.matches(item, keyword);
      });
      items.forEach(function (item) { list.appendChild(makeResultCard(item)); });
      $("results-empty").hidden = items.length > 0;
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

    return { render: render, setKeyword: setKeyword };
  })();

  /* ------------------------------------------------------------------
     商品詳細
  ------------------------------------------------------------------ */
  var detail = (function () {
    var current = null;

    $("detail-apply").addEventListener("click", function () {
      if (current) go("#/apply/" + current.id);
    });

    function render(id) {
      var item = productById(id);
      current = item;
      if (!item) {
        go("#/search");
        return;
      }

      $("detail-name").textContent = item.name;
      setPhoto($("detail-photo"), item.photo);
      $("detail-description").textContent = item.description || "（説明はありません）";
      $("detail-category").textContent = item.category;
      $("detail-color").textContent = item.color || "指定なし";
      $("detail-condition").textContent = item.condition;
      $("detail-period").textContent = item.period;
      $("detail-pickup").textContent = item.pickup;
      $("detail-campus").textContent = item.campus;

      var applied = store.applications().some(function (entry) {
        return String(entry.productId) === String(item.id) && entry.status !== "取引完了";
      });
      var mine = store.listings().some(function (entry) { return String(entry.id) === String(item.id); });

      var button = $("detail-apply");
      var note = $("detail-note");
      button.disabled = applied || mine;
      note.hidden = !(applied || mine);
      if (mine) note.textContent = "自分が出品した商品です";
      else if (applied) note.textContent = "この商品はすでに申し込み済みです";
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

    form.addEventListener("submit", function (event) {
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

      var list = store.applications();
      list.push({
        id: "a" + Date.now(),
        productId: current.id,
        name: current.name,
        photo: current.photo || "",
        appliedAt: today(),
        date: date.value,
        place: place.value,
        message: message.value.trim(),
        status: "申込中"
      });

      if (!store.saveApplications(list)) {
        toast("保存できませんでした。写真のサイズを小さくしてください");
        return;
      }

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
      setPhoto($("confirm-photo"), item.photo);
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
  (function sell() {
    var form = $("sell-form");
    var name = $("sell-name");
    var description = $("sell-description");
    var photoButton = $("sell-photo");
    var photoInput = $("sell-photo-input");
    var photoRemove = $("sell-photo-remove");
    var photoLabel = $("sell-photo-label");
    var chosen = {};
    var photo = "";

    each(form.querySelectorAll(".sell-field[data-key]"), function (field) {
      var key = field.getAttribute("data-key");
      var button = field.querySelector(".picker");
      var panel = field.querySelector(".picker-panel");
      chosen[key] = "";

      OPTIONS[key].forEach(function (value) {
        var label = document.createElement("label");
        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "sell-" + key;
        radio.value = value;
        radio.addEventListener("change", function () {
          chosen[key] = value;
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

    photoButton.addEventListener("click", function () { photoInput.click(); });

    photoInput.addEventListener("change", function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      readPhoto(file, function (dataUrl) {
        photo = dataUrl;
        setPhoto(photoButton, photo);
        photoLabel.hidden = true;
        photoRemove.hidden = false;
        setError(null, $("sell-photo-error"), "");
      }, function (text) {
        setError(null, $("sell-photo-error"), text);
      });
      photoInput.value = "";
    });

    photoRemove.addEventListener("click", function () {
      photo = "";
      setPhoto(photoButton, "");
      photoLabel.hidden = false;
      photoRemove.hidden = true;
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var ok = name.value.trim()
        ? setError(name, $("sell-name-error"), "")
        : setError(name, $("sell-name-error"), "商品名を入力してください");

      each(form.querySelectorAll(".sell-field[data-key]"), function (field) {
        var key = field.getAttribute("data-key");
        var label = field.querySelector(".picker span").textContent;
        if (!chosen[key]) {
          setError(null, field.querySelector(".error"), label + "を選んでください");
          ok = false;
        }
      });

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

      var listings = store.listings();
      listings.push({
        id: "u" + Date.now(),
        name: name.value.trim(),
        category: chosen.category,
        color: chosen.color,
        condition: chosen.condition,
        period: chosen.period,
        pickup: chosen.pickup,
        campus: chosen.campus,
        description: description.value.trim(),
        photo: photo,
        recommended: false,
        mine: true,
        createdAt: today()
      });

      if (!store.saveListings(listings)) {
        setError(null, $("sell-photo-error"), "保存できませんでした。写真のサイズを小さくしてください");
        return;
      }

      reset();
      toast("出品しました");
      go("#/listings");
    });

    function reset() {
      form.reset();
      photo = "";
      setPhoto(photoButton, "");
      photoLabel.hidden = false;
      photoRemove.hidden = true;
      each(form.querySelectorAll(".sell-field[data-key]"), function (field) {
        var key = field.getAttribute("data-key");
        chosen[key] = "";
        field.querySelector(".chosen").textContent = "＋";
        field.querySelector(".picker-panel").hidden = true;
        setError(null, field.querySelector(".error"), "");
      });
      each(form.querySelectorAll(".error"), function (box) { box.textContent = ""; });
      $("sell-photo-error").textContent = "";
    }

  })();

  /* ------------------------------------------------------------------
     申込中 / 取引中 / 取引履歴 / 出品中
  ------------------------------------------------------------------ */
  function makeEntryCard(entry, lines, actions) {
    var card = document.createElement("div");
    card.className = "app-card";

    var thumb = document.createElement("div");
    thumb.className = "thumb";
    setPhoto(thumb, entry.photo);
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

  function renderApplications() {
    var entries = applicationsBy("申込中").slice().reverse();
    renderEntryList("applications-list", "applications-empty", entries, function (entry) {
      return makeEntryCard(entry, [entry.name, "申込日　" + formatDate(entry.appliedAt)], [
        {
          label: "受け渡し日時を確定",
          run: function () {
            updateApplication(entry.id, { status: "取引中" });
            toast("取引を開始しました");
            renderApplications();
            renderBadges();
          }
        },
        {
          label: "申し込みを取り消す",
          run: function () {
            store.saveApplications(store.applications().filter(function (item) {
              return item.id !== entry.id;
            }));
            toast("申し込みを取り消しました");
            renderApplications();
            renderBadges();
          }
        }
      ]);
    });
  }

  function renderDeals() {
    var entries = applicationsBy("取引中").slice().reverse();
    renderEntryList("deals-list", "deals-empty", entries, function (entry) {
      return makeEntryCard(entry, [
        entry.name,
        "受取日　" + formatDate(entry.date),
        "受取場所　" + entry.place
      ], [
        {
          label: "受け渡し完了",
          run: function () {
            updateApplication(entry.id, { status: "取引完了", completedAt: today() });
            toast("取引が完了しました");
            renderDeals();
            renderBadges();
          }
        }
      ]);
    });
  }

  function renderHistory() {
    var entries = applicationsBy("取引完了").slice().reverse();
    renderEntryList("history-list", "history-empty", entries, function (entry) {
      return makeEntryCard(entry, [
        entry.name,
        "取引完了日　" + formatDate(entry.completedAt || entry.date)
      ], []);
    });
  }

  function renderListings() {
    var entries = store.listings().slice().reverse();
    renderEntryList("listings-list", "listings-empty", entries, function (entry) {
      return makeEntryCard(entry, [
        entry.name,
        "出品日　" + formatDate(entry.createdAt),
        entry.category + "・" + entry.campus
      ], [
        {
          label: "商品ページを見る",
          run: function () { go("#/item/" + entry.id); }
        },
        {
          label: "出品を取り消す",
          run: function () {
            store.saveListings(store.listings().filter(function (item) {
              return item.id !== entry.id;
            }));
            toast("出品を取り消しました");
            renderListings();
            renderBadges();
          }
        }
      ]);
    });
  }

  function renderBadges() {
    $("badge-listings").textContent = countLabel(store.listings().length);
    $("badge-applications").textContent = countLabel(applicationsBy("申込中").length);
    $("badge-deals").textContent = countLabel(applicationsBy("取引中").length);
    $("badge-history").textContent = countLabel(applicationsBy("取引完了").length);
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

    avatarInput.addEventListener("change", function () {
      var file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      readPhoto(file, function (dataUrl) {
        var profile = store.profile();
        profile.photo = dataUrl;
        if (store.saveProfile(profile)) {
          setPhoto(avatar, dataUrl);
          toast("プロフィール画像を変更しました");
        } else {
          toast("保存できませんでした。画像のサイズを小さくしてください");
        }
      }, function (text) { toast(text); });
      avatarInput.value = "";
    });

    $("mypage-edit").addEventListener("click", function () { setEditing(true); });
    $("mypage-cancel").addEventListener("click", function () { setEditing(false); });

    form.addEventListener("submit", function (event) {
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

      var profile = store.profile();
      profile.name = name.value.trim();
      profile.faculty = faculty.value.trim();
      profile.campus = campusSelect.value;
      store.saveProfile(profile);
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
      setPhoto(avatar, profile.photo);
      $("mypage-name").textContent = profile.name;
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
  $("settings-logout").addEventListener("click", function () {
    store.saveSession(null);
    go("#/login");
  });

  $("settings-reset").addEventListener("click", function () {
    if (!window.confirm("出品・申込・プロフィールをすべて削除します。よろしいですか？")) return;
    ["yum.listings", "yum.applications", "yum.profile", "yum.accounts", "yum.session"].forEach(function (key) {
      try { window.localStorage.removeItem(key); } catch (error) { /* 消せなくても続行する */ }
    });
    toast("初期化しました");
    go("#/login");
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
    "#/sell": { view: "view-sell", tabs: true, tab: "#/sell" },
    "#/applications": { view: "view-applications", tabs: true, tab: "#/mypage", render: renderApplications },
    "#/listings": { view: "view-listings", tabs: true, tab: "#/mypage", render: renderListings },
    "#/deals": { view: "view-deals", tabs: true, tab: "#/deals", render: renderDeals },
    "#/history": { view: "view-history", tabs: true, tab: "#/mypage", render: renderHistory },
    "#/settings": { view: "view-settings", tabs: true, tab: "#/mypage" },
    "#/mypage": { view: "view-mypage", tabs: true, tab: "#/mypage", render: function () { mypage.render(); } }
  };

  function route() {
    var hash = window.location.hash || "#/login";
    var match = /^#\/(item|apply)\/(.+)$/.exec(hash);
    var config;
    var param = null;

    if (match) {
      param = match[2];
      config = match[1] === "item"
        ? { view: "view-detail", tabs: true, tab: "#/search", render: function () { detail.render(param); } }
        : { view: "view-confirm", tabs: true, tab: "#/search", render: function () { confirmView.render(param); } };
    } else {
      config = ROUTES[hash];
    }

    if (!config) {
      go(store.session() ? "#/home" : "#/login");
      return;
    }

    if (config.auth !== false && !store.session()) {
      go("#/login");
      return;
    }

    if (store.session() && config.auth === false) {
      go("#/home");
      return;
    }

    each(document.querySelectorAll(".view"), function (view) {
      view.hidden = view.id !== config.view;
    });

    var tabbar = $("tabbar");
    tabbar.hidden = !config.tabs;
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

  window.addEventListener("hashchange", route);
  route();
})();
