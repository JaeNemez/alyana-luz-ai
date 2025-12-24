/* ======================================================
   Alyana Luz · Bible AI
   SAFE BOOTSTRAP app.js
   This file CANNOT white-screen.
   ====================================================== */

(function () {
  "use strict";

  console.log("✅ app.js loaded");

  // ---- DOM READY -------------------------------------------------
  function ready(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  ready(() => {
    console.log("✅ DOMContentLoaded");

    // JS status pill
    const jsStatus = document.getElementById("jsStatus");
    if (jsStatus) jsStatus.textContent = "JS: ready";

    // ---- TAB SWITCHING (SAFE) -----------------------------------
    const menuButtons = document.querySelectorAll(".menu-btn");
    const sections = document.querySelectorAll(".app-section");

    if (!menuButtons.length || !sections.length) {
      console.warn("⚠️ Menu buttons or sections not found");
      return;
    }

    function activateSection(targetId) {
      sections.forEach(sec => {
        sec.classList.toggle("active", sec.id === targetId);
      });
      menuButtons.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.target === targetId);
      });
    }

    menuButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        if (!target) return;
        activateSection(target);
      });
    });

    // Ensure default section is visible
    const defaultBtn = document.querySelector(".menu-btn.active");
    if (defaultBtn) {
      activateSection(defaultBtn.dataset.target);
    }

    console.log("✅ Tabs initialized");

    // ---- TEMPORARY STUBS ----------------------------------------
    // These prevent crashes while we build features safely.

    window.Alyana = {
      version: "bootstrap",
      log(msg) {
        console.log("[Alyana]", msg);
      }
    };

    console.log("✅ Alyana bootstrap complete");
  });

})();


























