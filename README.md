# ShowItGlo — Let the World Decide What Opinion is Real

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Stripe](https://img.shields.io/badge/Stripe-Apple%20Pay%20%2B%20Link-635BFF?style=flat&logo=stripe)](https://stripe.com/)
[![License](https://img.shields.io/badge/License-Proprietary-gold.svg)](file:///Users/lukapetrovic/Desktop/showitglo/LICENSE)

> **"Always wanted to share your opinion but you didn't get the stage or got censored? We don't! Let the world decide what opinion is real."**

ShowItGlo is a high-density, real-time public opinion and consumer demand arena. Every like costs **1¢**, and every conviction boost costs **10¢**, turning passive internet noise into truthful, money-weighted public mandates that cannot be shadowbanned or silenced.

---

## 🌟 Key Features

1. **Uncensored Public Arena**:
   - **Say It Out Loud**: Broadcast unfiltered stances directly to the permanent global board.
   - **Link a Post**: Attach uncensored opinions to any external post or article (X, YouTube, Reddit, TikTok, News).
   - **Demand Change**: Rally thousands of paying consumers to force brands to publicly answer on the record.

2. **The Great LLM Showdown & Multi-Faction Wars**:
   - Multi-option ($N$-way) debates featuring **Claude Opus 5**, **ChatGPT (GPT-5.6 Sol & o3-pro)**, **Gemini 3.7 Flash**, and **Grok 4.6**.
   - Free $0.00 community opinion stream + optional financial conviction boosting ($0.10, $1.00, $10.00).

3. **Live Visitor Telemetry Engine**:
   - Real-time active presence tracking (`🟢 Live In Arena`) powered by anonymous sliding-window session heartbeats.

4. **Zero User Data Sold Guarantee**:
   - ShowItGlo **only sells aggregate vote distributions and macro brand demand statistics** via the Insights API.
   - Zero emails, zero personal user accounts, and zero IP logs are ever sold or accessible via API ($k \ge 100$ anonymity guarantee).

5. **Production Payment Rails**:
   - Native **Apple Pay** on Safari with Face ID / Touch ID.
   - 1-Click **Stripe Link** and Credit/Debit Cards with automated webhook top-up verification.

6. **Legal & Compliance**:
   - Swiss Federal Act on Data Protection (FADP) and EU GDPR compliant.
   - Swiss Impressum registered for **MomentumQ GmbH**, Zürich, Switzerland.

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Install
```bash
git clone https://github.com/your-username/showitglo.git
cd showitglo
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your Stripe and database credentials:
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/showitglo
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛳️ Production Deployment

### Option A: Vercel (Recommended)
1. Push repository to GitHub.
2. Import project into [Vercel](https://vercel.com).
3. Set environment variables (`DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
4. Deploy!

### Option B: Docker Container
```bash
# Build and start container
docker-compose up -d --build
```

---

## 🍎 Apple Pay Web Verification

Apple requires hosting the domain association certificate at `/.well-known/apple-developer-merchantid-domain-association`.

1. In Stripe Dashboard 👉 **Settings > Payment Methods > Apple Pay**.
2. Click **Add new domain** and enter your production domain (e.g. `showitglo.com`).
3. Click **Verify** (the certificate is pre-configured in `public/.well-known/apple-developer-merchantid-domain-association` and served automatically).

---

## 🔒 Zero User Data Policy

- **Debates API**: `GET /api/v1/insights/debates`
- **Demands API**: `GET /api/v1/insights/demands`

Both endpoints strictly enforce aggregate macro statistics with a guaranteed $k \ge 100$ anonymity floor.

---

## ⚖️ Corporate & Legal

- **Operator**: MomentumQ GmbH, Leutschenbachstrasse 95, 8050 Zürich, Switzerland (UID: CHE-222.957.350).
- **Impressum**: [`/impressum`](file:///Users/lukapetrovic/Desktop/showitglo/src/app/impressum/page.tsx)
- **Privacy Policy**: [`/privacy`](file:///Users/lukapetrovic/Desktop/showitglo/src/app/privacy/page.tsx)
