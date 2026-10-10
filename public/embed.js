(function () {
  var script = document.currentScript;
  if (!script) return;
  var salon = script.getAttribute("data-salon");
  if (!salon) return;
  var lang = script.getAttribute("data-lang") || "en";
  var origin = new URL(script.src).origin;
  var label = script.getAttribute("data-label") || "Try your look";
  var button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-haspopup", "dialog");
  button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;border:0;border-radius:999px;padding:12px 16px;background:#C4622D;color:#fffaf6;font:600 14px system-ui,sans-serif;box-shadow:0 10px 30px rgba(60,36,16,.25);cursor:pointer";
  var frame;
  button.addEventListener("click", function () {
    if (frame) {
      frame.remove();
      frame = null;
      return;
    }
    frame = document.createElement("iframe");
    frame.title = "Hair try-on";
    frame.src = origin + "/embed/" + encodeURIComponent(salon) + "?lang=" + encodeURIComponent(lang);
    frame.allow = "camera; clipboard-write";
    frame.style.cssText = "position:fixed;right:16px;bottom:72px;z-index:2147483000;width:min(420px,calc(100vw - 24px));height:min(720px,calc(100vh - 96px));border:0;border-radius:20px;background:#f3ece3;box-shadow:0 20px 60px rgba(60,36,16,.28)";
    document.body.appendChild(frame);
  });
  window.addEventListener("message", function (event) {
    if (!frame || event.source !== frame.contentWindow) return;
    var data = event.data || {};
    if (data.type === "tryon:booked") {
      script.dispatchEvent(new CustomEvent("tryon:booked", { detail: data }));
    }
  });
  document.body.appendChild(button);
})();
