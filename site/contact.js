// Contact / demo request form: sends the form to /api/contact (a Cloudflare
// Pages Function). Shared by the English and Arabic pages; the messages come
// from data-* attributes on the form when they are set.
(function () {
  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
  var form = document.getElementById("contact-form");
  if (!form) return;
  var t0 = Date.now();
  var msg = form.querySelector(".form-msg");
  var btn = form.querySelector('button[type="submit"]');
  var text = function (k, d) { return form.getAttribute("data-" + k) || d; };
  // "Ask for a quote" buttons in Plans fill in "Interested in".
  document.querySelectorAll("[data-interest]").forEach(function (a) {
    a.addEventListener("click", function () {
      var s = form.querySelector('select[name="interest"]');
      var want = a.getAttribute("data-interest");
      if (s) for (var i = 0; i < s.options.length; i++) if (s.options[i].value === want || s.options[i].text === want) s.selectedIndex = i;
    });
  });
  var show = function (s, ok) { msg.textContent = s; msg.className = "form-msg " + (ok ? "ok" : "bad"); };
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = String(v); });
    if (!data.name || !data.email || !data.message) return show(text("required", "Please give your name, work email and message."), false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return show(text("bad-email", "Please check the email address."), false);
    data.elapsed = String(Date.now() - t0);
    data.page = location.pathname;
    data.lang = document.documentElement.lang || "en";
    btn.disabled = true;
    show(text("sending", "Sending…"), true);
    fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (x.r.ok && x.j.ok) {
          form.reset();
          show(text("ok", "Thank you. We will reply within two working days."), true);
        } else show((x.j && x.j.error) || text("err", "The message was not sent. Please try again, or contact us on LinkedIn."), false);
      })
      .catch(function () { show(text("err", "The message was not sent. Please try again, or contact us on LinkedIn."), false); })
      .then(function () { btn.disabled = false; });
  });
})();
