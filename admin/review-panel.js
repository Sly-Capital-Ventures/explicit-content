/* In-editor Compliance & SEO panel for the Explicit Content Studio (Sveltia CMS).
 *
 * Shows the CI verdict for the entry currently open in the editor, in place, so writers never
 * open GitHub. It reads the entry's PR by branch (Sveltia's editorial workflow names each
 * entry's branch `cms/<collection>/<slug>`), via the read-only status Worker.
 *
 * Deliberately framework-free: it derives the branch from the editor URL and injects its own
 * fixed panel, so it never touches Sveltia's internals or its field rendering. Compliance is
 * still hard-blocked at merge by CI + branch protection; this panel makes the block visible.
 *
 * Config: set window.REVIEW_WORKER_URL in admin/index.html to the deployed Worker URL.
 */
(function () {
  "use strict";

  var WORKER_URL = (window.REVIEW_WORKER_URL || "").replace(/\/+$/, "");
  var COLLECTIONS = { articles: true, pages: true }; // the collections this gates
  var POLL_MS = 20000;

  var panel, headEl, bodyEl;
  var currentBranch = null;
  var pollTimer = null;

  // ---- URL -> which entry is open -------------------------------------------------------
  // Works whether Sveltia routes via hash (#/collections/..) or path (/collections/..).
  function parseEntry() {
    var src = (location.hash || "") + " " + (location.pathname || "");
    var m = src.match(/collections\/([A-Za-z0-9_-]+)\/entries\/([A-Za-z0-9._-]+)/);
    if (m && COLLECTIONS[m[1]] && m[2] !== "new") {
      return { collection: m[1], slug: m[2] };
    }
    var n = src.match(/collections\/([A-Za-z0-9_-]+)\/(?:entries\/)?new/);
    if (n && COLLECTIONS[n[1]]) return { collection: n[1], slug: null }; // unsaved
    return null;
  }

  // ---- panel shell ----------------------------------------------------------------------
  function ensurePanel() {
    if (panel) return;
    var style = document.createElement("style");
    style.textContent = [
      "#er-review{position:fixed;right:16px;bottom:16px;width:360px;max-height:70vh;z-index:2147483000;",
      "display:flex;flex-direction:column;font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;",
      "background:#fff;color:#1a1a1a;border:1px solid #e2e2e2;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);overflow:hidden}",
      "#er-review .er-h{display:flex;align-items:center;gap:8px;padding:10px 12px;font-weight:600;border-bottom:1px solid #ececec;background:#fafafa}",
      "#er-review .er-h .er-dot{width:9px;height:9px;border-radius:50%;background:#bbb;flex:0 0 auto}",
      "#er-review .er-h.er-fail .er-dot{background:#e5484d}#er-review .er-h.er-pass .er-dot{background:#30a46c}#er-review .er-h.er-wait .er-dot{background:#f5a524}",
      "#er-review .er-h .er-btn{margin-left:auto;font:inherit;font-weight:600;cursor:pointer;border:1px solid #d5d5d5;background:#fff;border-radius:7px;padding:3px 9px}",
      "#er-review .er-h .er-btn:hover{background:#f0f0f0}",
      "#er-review .er-body{padding:10px 12px;overflow:auto}",
      "#er-review .er-muted{color:#6b6b6b}",
      "#er-review .er-sec{font-weight:700;margin:12px 0 4px;font-size:12px;letter-spacing:.02em;text-transform:uppercase}",
      "#er-review .er-sec.er-block{color:#c62a2f}#er-review .er-sec.er-seo{color:#9a6a00}",
      "#er-review .er-find{border-left:3px solid #e5484d;background:#fcefef;padding:7px 9px;border-radius:0 8px 8px 0;margin:7px 0}",
      "#er-review .er-find.er-seo{border-left-color:#f5a524;background:#fdf6e7}",
      "#er-review .er-q{font-style:italic}#er-review .er-find b{font-weight:700}",
      "#er-review .er-fix{margin-top:3px}",
      "@media (prefers-color-scheme:dark){",
      "#er-review{background:#1e1e1e;color:#ededed;border-color:#333}",
      "#er-review .er-h{background:#242424;border-bottom-color:#333}",
      "#er-review .er-h .er-btn{background:#2a2a2a;border-color:#3a3a3a;color:#ededed}#er-review .er-h .er-btn:hover{background:#333}",
      "#er-review .er-muted{color:#a5a5a5}",
      "#er-review .er-find{background:#2a1c1d}#er-review .er-find.er-seo{background:#2a2416}}",
    ].join("");
    document.head.appendChild(style);

    panel = document.createElement("div");
    panel.id = "er-review";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="er-h"><span class="er-dot"></span><span class="er-title">Compliance &amp; SEO</span>' +
      '<button class="er-btn" type="button">Re-check</button></div><div class="er-body"></div>';
    document.body.appendChild(panel);
    headEl = panel.querySelector(".er-h");
    bodyEl = panel.querySelector(".er-body");
    panel.querySelector(".er-btn").addEventListener("click", function () {
      if (currentBranch) runCheck(currentBranch, true);
    });
  }

  function setHead(kind, title) {
    headEl.className = "er-h" + (kind ? " er-" + kind : "");
    headEl.querySelector(".er-title").textContent = title;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
    });
  }

  // ---- rendering ------------------------------------------------------------------------
  function renderFindings(review) {
    var comp = [], seo = [];
    (review.files || []).forEach(function (f) {
      (f.findings || []).forEach(function (x) {
        (x.type === "seo" ? seo : comp).push(x);
      });
    });
    var html = "";
    if (comp.length) {
      html += '<div class="er-sec er-block">Compliance — must fix (' + comp.length + ")</div>";
      comp.forEach(function (x) {
        html += '<div class="er-find"><div class="er-q">&ldquo;' + esc(x.quote) + "&rdquo;</div>" +
          "<div><b>Why:</b> " + esc(x.problem) + "</div>" +
          '<div class="er-fix"><b>Fix:</b> ' + esc(x.fix) + "</div></div>";
      });
    }
    if (seo.length) {
      html += '<div class="er-sec er-seo">SEO — recommended (optional) (' + seo.length + ")</div>";
      seo.forEach(function (x) {
        html += '<div class="er-find er-seo"><div class="er-q">&ldquo;' + esc(x.quote) + "&rdquo;</div>" +
          "<div><b>Why:</b> " + esc(x.problem) + "</div>" +
          '<div class="er-fix"><b>Better:</b> ' + esc(x.fix) + "</div></div>";
      });
    }
    if (!comp.length && !seo.length) {
      html = '<p class="er-muted">No issues found. A reviewer still merges it.</p>';
    }
    return html;
  }

  function showMessage(kind, title, msg) {
    setHead(kind, title);
    bodyEl.innerHTML = '<p class="er-muted">' + esc(msg) + "</p>";
  }

  // Should we keep polling? (PR/verdict not settled yet)
  function pending(data) {
    if (!data) return true;
    if (data.found === false) return true;              // saved but PR/CI not up yet
    if (!data.review) return true;                       // comment not posted yet
    if (data.checkStatus && data.checkStatus !== "completed") return true; // still running
    return false;
  }

  function schedule(branch) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(function () {
      if (currentBranch === branch) runCheck(branch, false);
    }, POLL_MS);
  }

  function runCheck(branch, manual) {
    if (!WORKER_URL) {
      showMessage("wait", "Compliance & SEO", "Panel not configured: set window.REVIEW_WORKER_URL in admin/index.html.");
      return;
    }
    if (manual) showMessage("wait", "Compliance & SEO", "Checking…");
    fetch(WORKER_URL + "/status?branch=" + encodeURIComponent(branch), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (currentBranch !== branch) return; // navigated away
        if (data.error) { showMessage("wait", "Compliance & SEO", "Couldn't reach the reviewer: " + data.error); schedule(branch); return; }
        if (data.found === false) {
          showMessage("wait", "Compliance & SEO", "Saved draft not found yet — the check starts a moment after you Save.");
          schedule(branch); return;
        }
        if (!data.review) {
          showMessage("wait", "Checking…", "The compliance & SEO review is running (about 1–2 minutes). This updates on its own.");
          schedule(branch); return;
        }
        var fail = data.review.status === "fail";
        setHead(fail ? "fail" : "pass",
          fail ? "Must fix before publishing" : "Compliance passed");
        bodyEl.innerHTML = renderFindings(data.review);
        if (pending(data)) schedule(branch);
      })
      .catch(function (e) {
        if (currentBranch !== branch) return;
        showMessage("wait", "Compliance & SEO", "Network error contacting the reviewer.");
        schedule(branch);
      });
  }

  // ---- react to editor navigation -------------------------------------------------------
  function tick() {
    var entry = parseEntry();
    if (!entry) { // not on a gated entry editor
      if (panel && !panel.hidden) { panel.hidden = true; currentBranch = null; clearTimeout(pollTimer); }
      return;
    }
    ensurePanel();
    panel.hidden = false;
    if (!entry.slug) { // unsaved new entry — no branch/PR yet
      if (currentBranch !== null) { currentBranch = null; clearTimeout(pollTimer); }
      showMessage("wait", "Compliance & SEO", "Save this draft to run the compliance & SEO check.");
      return;
    }
    var branch = "cms/" + entry.collection + "/" + entry.slug;
    if (branch !== currentBranch) {
      currentBranch = branch;
      clearTimeout(pollTimer);
      runCheck(branch, true);
    }
  }

  window.addEventListener("hashchange", tick);
  window.addEventListener("popstate", tick);
  setInterval(tick, 1200);   // robust against SPA route changes that don't fire events
  if (document.readyState !== "loading") tick();
  else document.addEventListener("DOMContentLoaded", tick);
})();
