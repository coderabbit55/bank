/* Client-side PWA biometric gate for GitHub Pages.
 * UX gate only — NOT a security boundary. WebAuthn assertions are not verified
 * by a trusted server, and all GitHub Pages files remain publicly accessible.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "accountsMarket.webauthn.credentialId.v1";
  const USER_ID_KEY = "accountsMarket.webauthn.userId.v1";
  const APP_NAME = "Accounts Market";
  const RP_NAME = "coderabbit55.github.io";
  const RP_ID = location.hostname;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;

  // Normal Safari browser visits are deliberately not gated.
  if (!isStandalone) return;

  // WebAuthn requires a secure context. GitHub Pages uses HTTPS.
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
    showGate("This device doesn't support Passkey iPhone/iOS", false);
    return;
  }

  // Add the overlay as early as possible. Put this script near the start of <head>.
  const style = document.createElement("style");
  style.textContent = `
    #am-bio-gate {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      padding: 24px; box-sizing: border-box;
      background: #f4f6fa; color: #172033;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #am-bio-gate * { box-sizing: border-box; }
    #am-bio-gate .am-card {
      width: min(100%, 380px); padding: 28px 22px; border-radius: 22px;
      background: white; box-shadow: 0 12px 44px rgba(20,35,65,.14);
      text-align: center;
    }
    #am-bio-gate .am-icon { font-size: 42px; margin-bottom: 12px; }
    #am-bio-gate h1 { font-size: 22px; margin: 0 0 10px; }
    #am-bio-gate p { font-size: 14px; line-height: 1.55; color: #5c667a; }
    #am-bio-gate button {
      width: 100%; min-height: 48px; margin-top: 10px; border: 0;
      border-radius: 12px; background: #155eef; color: white;
      font-size: 16px; font-weight: 600; cursor: pointer;
    }
    #am-bio-gate button.secondary { background: #edf1f7; color: #253047; }
    #am-bio-gate button:disabled { opacity: .6; }
    #am-bio-gate .am-status { min-height: 22px; margin-top: 12px; font-size: 13px; }
  `;
  document.documentElement.appendChild(style);

  function b64url(bytes) {
    let binary = "";
    new Uint8Array(bytes).forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function fromB64url(str) {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length = 32) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function getUserId() {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = b64url(randomBytes(16));
      localStorage.setItem(USER_ID_KEY, id);
    }
    return fromB64url(id);
  }

  function showGate(message, allowSetup = true) {
    if (document.getElementById("am-bio-gate")) return;
    const overlay = document.createElement("div");
    overlay.id = "am-bio-gate";
    overlay.innerHTML = `
      <div class="am-card">
        <div class="am-icon" aria-hidden="true">🔐</div>
        <h1>${APP_NAME}</h1>
        <p id="am-gate-description">Face ID</p>
        <button id="am-gate-main" type="button">Login</button>
        <button id="am-gate-setup" class="secondary" type="button" hidden>Initial Setting</button>
        <button id="am-gate-reset" class="secondary" type="button" hidden>Reset</button>
        <div id="am-gate-status" class="am-status" role="status" aria-live="polite"></div>
      </div>`;
    document.documentElement.appendChild(overlay);

    const description = overlay.querySelector("#am-gate-description");
    const main = overlay.querySelector("#am-gate-main");
    const setup = overlay.querySelector("#am-gate-setup");
    const reset = overlay.querySelector("#am-gate-reset");
    const status = overlay.querySelector("#am-gate-status");

    description.textContent = message || "Please use Passkey or Face ID";
    const hasCredential = !!localStorage.getItem(STORAGE_KEY);
    main.hidden = !hasCredential;
    setup.hidden = hasCredential || !allowSetup;
    reset.hidden = !hasCredential;

    main.addEventListener("click", async () => {
      main.disabled = setup.disabled = reset.disabled = true;
      status.textContent = "Hold a second…";
      try {
        await authenticate();
        overlay.remove();
        style.remove();
      } catch (e) {
        status.textContent = friendlyError(e);
      } finally {
        if (document.getElementById("am-bio-gate")) {
          main.disabled = setup.disabled = reset.disabled = false;
        }
      }
    });

    setup.addEventListener("click", async () => {
      main.disabled = setup.disabled = reset.disabled = true;
      status.textContent = "Registering Passkey…";
      try {
        await register();
        description.textContent = "Completed, Please continue";
        main.hidden = false;
        setup.hidden = true;
        reset.hidden = false;
        status.textContent = "Passkey Registered";
      } catch (e) {
        status.textContent = friendlyError(e);
      } finally {
        main.disabled = setup.disabled = reset.disabled = false;
      }
    });

    reset.addEventListener("click", () => {
      if (!confirm("Clear Passkey and Reset？This won't delete in iCloud Passkey。")) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USER_ID_KEY);
      location.reload();
    });
  }

  async function register() {
    if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ||
        !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
      throw new Error("Please check iOS version and Face ID");
    }

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: APP_NAME, id: RP_ID },
        user: {
          id: getUserId(),
          name: "local-device-user",
          displayName: "Accounts Market on this device"
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      }
    });

    if (!credential) throw new Error("Not register Passkey。");
    localStorage.setItem(STORAGE_KEY, b64url(credential.rawId));
  }

  async function authenticate() {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) throw new Error("Passkey not registered，please set");

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: RP_ID,
        allowCredentials: [{ type: "public-key", id: fromB64url(id) }],
        userVerification: "required",
        timeout: 60000
      }
    });

    if (!assertion) throw new Error("Validation not success");

    // IMPORTANT: This checks only that the browser returned a WebAuthn assertion.
    // There is no trusted server to verify its signature or prevent replay/tampering.
    // It is a convenience gate, not real access control.
  }

  function friendlyError(error) {
    if (error && error.name === "NotAllowedError") {
      return "Timeout, Please try again";
    }
    if (error && error.name === "InvalidStateError") {
      return "Not match, please reset";
    }
    return (error && error.message) ? error.message : "Try Again";
  }

  showGate("Please use Passkey or Face ID");
})();
