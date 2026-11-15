# Al Shaheen Auto Hub — Enterprise Workshop Management & TV Lounge System

A comprehensive, screen-responsive workshop management application built for **Al Shaheen Auto Hub** (DHA Phase 6, Lahore), designed to run on tablets, smartphones, desktop terminals, and Smart TVs in the customer waiting lounge.

---

## 🌟 Key Capabilities & New Features

### 1. 📺 Waiting Lounge TV Display (Hospital-Style Queue Radar)
- **URL Route**: `/tv` or `/?mode=tv`
- **Split-Screen Design for Smart TVs (55"+ 1080p / 4K)**:
  - **Left Side (62%) — Live Bay Radar & Queue Board**:
    - High-contrast, large-font display readable across the waiting lounge.
    - Tracks vehicles across all 6 workshop bays:
      - 🔍 **Bay 1**: Inspection & Diagnosis
      - 🔧 **Bay 2**: Mechanical & Engine
      - ⚡ **Bay 3**: Electrical & AC Clinic
      - 🔨 **Bay 4**: Denting & Body Craft
      - 🛞 **Bay 5**: 3D Alignment & Tyres
      - ✨ **Bay 6**: Car Wash & Detailing
    - **Ready for Collection Alert**: When marked ready, the car displays a glowing, pulsating emerald green badge:
      `✅ READY TO COLLECT — PLEASE PROCEED TO ACCOUNTS COUNTER`
    - **Audio Chime**: Automatic pleasant two-tone airport/hospital chime plays over TV speakers when any vehicle is marked ready!
  - **Right Side (38%) — Al Shaheen YouTube Channel & Shorts Player**:
    - Embedded video player that continuously plays your official YouTube channel videos and Shorts to keep waiting customers entertained.
    - Sound toggle (`🔊 Sound ON` / `🔇 Muted`), Next Video button, and YouTube Setup modal.
  - **Bottom Ticker**: Running marquee announcement with lounge Wi-Fi password, complimentary tea/coffee reminders, and workshop helpline.
  - **TV Remote / Public Kiosk Proof**: Clicking anywhere or pressing remote buttons keeps the screen locked in TV mode. Exiting back to the management portal requires clicking the discrete lock icon and entering the Staff PIN.

### 2. 📱 Customer Self-Service Mobile Tracker
- **URL Route**: `/track` or `/?mode=track`
- Customers can track their vehicle live from their smartphone while waiting in the lounge or at a nearby cafe:
  - Enter Vehicle Plate Number (e.g., `AQP 007` or `LEA-21-4890`).
  - View real-time assigned workshop bay.
  - 4-Step visual progress tracker:
    1. *Vehicle Received & Inspection*
    2. *In Service at Bay*
    3. *Quality Control Check*
    4. *Ready for Delivery (Accounts Counter Clearance)*
  - One-click **WhatsApp Service Advisor** button with pre-filled vehicle details.
  - One-click **Download / View Job Card A4 PDF** button.

### 3. 🔒 Staff PIN & Security System
- **Default Staff PIN**: `1234`
- Protects the Workshop Management backend (`dbView` and `editorView`) so customers in the waiting room cannot see customer phone numbers, addresses, costs, or internal notes.
- Configurable in the top bar (`🔒 Lock / Staff PIN`).
- Keypad supports tablet touchscreens and numeric input.

### 4. ⚡ Real-Time Cross-Screen Sync
- When a service advisor updates a car's bay on a tablet (e.g. from *Bay 2* to *Ready for Delivery*), the **Waiting Lounge TV display immediately updates in real-time** and rings the chime alert without any page reload!
- Powered by `BroadcastChannel` and `localStorage` events.

### 5. 🤖 Gemini AI Diagnostics & Tablet Stylus Job Cards
- Built-in Google Gemini AI automotive diagnosis engine (Free Tier compatible).
- Vector car inspection schematic with tire tread depth ($mm$) and touch damage markings (Dent, Scratch, Chips, Rust).
- Stylus signature pads for Customer Approval and Service Incharge.
- A4 printable layout and high-definition PDF generator.

---

## 🚀 How to Host on Vercel (1-Click Deployment)

The project includes `vercel.json` and `package.json` pre-configured for instant zero-config deployment.

### Method A: Deploy via GitHub & Vercel Dashboard (Recommended)
1. Push this directory to your GitHub account (e.g. `github.com/your-username/al-shaheen-job-cards`).
2. Log in to [vercel.com](https://vercel.com).
3. Click **"Add New..."** → **"Project"**.
4. Select your `al-shaheen-job-cards` repository.
5. Click **"Deploy"** (keep all default build settings; no build command needed!).
6. Within 15 seconds, Vercel gives you your live production URL:
   `https://al-shaheen-job-cards.vercel.app`

### Method B: Deploy via Vercel CLI
If you have Vercel CLI installed:
```bash
npm i -g vercel
vercel
```
Follow the 3 prompts and your app is live!

---

## 📺 How to Set Up the Waiting Lounge TV

1. On your Smart TV (Samsung Tizen, LG webOS, Android TV, Apple TV, Amazon Fire TV, or Chromecast with Google TV):
   - Open the TV Web Browser.
   - Enter your URL: `https://your-app.vercel.app/tv`
2. Press the TV remote's **"Full Screen"** or **F11** button.
3. The TV will now continuously run the Live Bay Radar on the left, loop your YouTube videos/Shorts on the right, and chime whenever a customer's car is ready for collection!

---

## ▶️ How to Link Your YouTube Channel & Shorts

1. Open the app and click **"▶️ TV YouTube"** in the top navigation bar (or click **"⚙️ Setup"** on the TV screen).
2. Enter your details:
   - **YouTube Channel Handle**: e.g., `@AlShaheenAutoHub`
   - **YouTube Playlist ID**: Paste the ID of your YouTube playlist (e.g. `PLrAXtmErZgOdP_8GztsuViY4LpW7f3`) for an uninterrupted loop of your workshop Shorts and video reels.
   - **Direct Video IDs**: Or paste comma-separated video IDs (e.g., `_Wp3Z-wHnUo, b7dC2Hk4pWc`).
3. Click **"💾 Save & Refresh Player"**. The waiting room TV immediately starts streaming your videos!

---

## 💻 Local Testing & Development

You can test the full multi-screen experience on your local computer before deploying:

```bash
# Start local server
node server.js
```
Then open:
- **Workshop Staff Portal**: `http://localhost:3000/workshop` (PIN: `1234`)
- **Waiting Lounge TV Display**: `http://localhost:3000/tv`
- **Customer Mobile Tracker**: `http://localhost:3000/track`

---

## 🏢 Al Shaheen Auto Hub
*Main Bedian Road, Near Askari 11, DHA Phase 6, Lahore-Pakistan.*  
*Phone: +92 344-1411123 | +92 42 3573 2222*  
*Website: www.alshaheenautohub.com*
