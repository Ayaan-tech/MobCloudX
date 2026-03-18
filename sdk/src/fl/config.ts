// src/fl/config.ts
// ─────────────────────────────────────────────────────────────
// BRIDGE_URL = Your inference FastAPI server's FL endpoint.
//              The inference server (app.py) runs on port 8000
//              and mounts the FL bridge router at /fl/*.
//
//              ALL SDK ↔ Atlas communication is proxied through
//              this server. No Atlas Data API needed.
//
//              Use your machine's LAN IP so the Android device
//              on the same WiFi can reach it.
//              For emulator: http://10.0.2.2:8000/fl
//              For ngrok:    https://xxxx.ngrok.io/fl
// ─────────────────────────────────────────────────────────────

export const BRIDGE_URL = 'http://192.168.1.3:8000/fl';
// ↑ Replace 192.168.1.3 with YOUR machine's LAN IP (where inference runs)
// Run `ipconfig` on Windows to find it (look for "Wireless LAN" → IPv4)
