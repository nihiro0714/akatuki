(function () {
  "use strict";

  var form = document.getElementById("login-form");
  var email = document.getElementById("email");
  var password = document.getElementById("password");
  var emailError = document.getElementById("email-error");
  var passwordError = document.getElementById("password-error");
  var submit = form.querySelector(".submit");

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(input, output, message) {
    output.textContent = message;
    input.classList.toggle("invalid", Boolean(message));
    return !message;
  }

  function validateEmail() {
    var value = email.value.trim();
    if (!value) {
      return setError(email, emailError, "メールアドレスを入力してください");
    }
    if (!EMAIL_PATTERN.test(value)) {
      return setError(email, emailError, "メールアドレスの形式が正しくありません");
    }
    return setError(email, emailError, "");
  }

  function validatePassword() {
    var value = password.value;
    if (!value) {
      return setError(password, passwordError, "パスワードを入力してください");
    }
    if (value.length < 8) {
      return setError(password, passwordError, "パスワードは8文字以上で入力してください");
    }
    return setError(password, passwordError, "");
  }

  email.addEventListener("blur", validateEmail);
  password.addEventListener("blur", validatePassword);
  email.addEventListener("input", function () {
    if (email.classList.contains("invalid")) validateEmail();
  });
  password.addEventListener("input", function () {
    if (password.classList.contains("invalid")) validatePassword();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var emailOk = validateEmail();
    var passwordOk = validatePassword();
    if (!emailOk || !passwordOk) {
      (emailOk ? password : email).focus();
      return;
    }

    submit.disabled = true;
    login({ email: email.value.trim(), password: password.value })
      .then(function () {
        window.location.href = "home.html";
      })
      .catch(function (error) {
        setError(password, passwordError, error.message);
      })
      .then(function () {
        submit.disabled = false;
      });
  });

  // 認証サーバーがまだ無いため、この端末に登録された内容だけで判定している。
  // 本番では必ずサーバー側で認証し、パスワードを端末に保存しないこと。
  function login(credentials) {
    return new Promise(function (resolve, reject) {
      var accounts = [];
      try {
        accounts = JSON.parse(window.localStorage.getItem("accounts") || "[]");
      } catch (error) {
        accounts = [];
      }

      // 新規登録がまだ一件も無い場合は、動作確認のためそのまま通す。
      if (accounts.length === 0) {
        resolve();
        return;
      }

      var matched = accounts.filter(function (account) {
        return account.email === credentials.email && account.password === credentials.password;
      })[0];

      if (!matched) {
        reject(new Error("メールアドレスまたはパスワードが正しくありません"));
        return;
      }

      resolve();
    }).then(function () {
      try {
        window.localStorage.setItem("session", JSON.stringify({ email: credentials.email }));
      } catch (error) {
        // 保存できなくてもログイン自体は続行する。
      }
    });
  }
})();
