# 🎬 Mithai Mitra — 3-minute demo

Start the backend (`backend/.venv/Scripts/python backend/app.py`) and open http://localhost:8130.
Sound on. Demo accounts: `…demo@swaadsujhav.test` / `SwaadDemo#2026`.

| Time | Do this | What the audience sees |
|---|---|---|
| **0:00** | Click **Andar Aao 🪔** | Diya flares, curtains open, Paaji waves and *speaks*: "Jai Shree Ram ji! Muzaffarnagar di sabton mithi dukaan vich swagat hai." |
| 0:15 | Point at the hero | Toran garland, floating sweets (parallax), live countdown to Lakshmi Puja, rotating offers. Toggle 🌙 **Deepawali Night**. |
| 0:25 | Profile → **Sign up** (any email) | Paaji dances, then the **Mithai Taste Quiz** opens. Answer 5 questions — Paaji reacts to each ("Asli meethe ke shaukeen ho!"). |
| 0:50 | Back to Home | **Paaji's Sujhaav for You** row now matches the quiz, each with a reason ("Matches your taste"). Tap the **Feeling light** mood → row re-ranks. |
| 1:05 | Add **Rasgulla** | Sweet flies into the cart, badge bounces, sparkles. Paaji recites its shayari (Devanagari in the bubble), then: **"Ye … bhi le jao, poore Muzaffarnagar mein nayi hai!"** with a one-tap Add. |
| 1:20 | Watch the **Trio bar** slide up | "Trio banao ji! … · 5% off unlocked" → **Add both**. Paaji: "Balle balle! 5% Mix & Save unlock ho gaya ji!" |
| 1:35 | Click any sweet | Overview: story, ingredients, taste bars, weights with live stock, shayari, **More dishes like this** (ML), **Goes great with**, **Customers also bought**. |
| 1:50 | Open **🎁 Gift Box** | Pick 9, tap two sweets, hit **Paaji, bharo!** → box fills with variety; choose ribbon, write a card, add to thaali. |
| 2:05 | Open the cart | Mix & Save progress (5% → 10%), free gift-box bar, free taste note, Paaji's "ye bhi le lo" picks. **Place Order**. |
| 2:20 | Checkout → **Cash on Delivery** → Place | Fireworks + confetti, diyas light up, Paaji dances and says a thank-you shayari, live tracker at "Placed". |
| 2:35 | (Second window) log in as **admin@** → Admin → Orders → set **Out for delivery** | The customer's tracker updates **live** and Paaji announces it. |
| 2:45 | Log in as **meera.demo@** (sugar-free) then **arjun.demo@** | Completely different picks: Meera only ever sees sugar-free sweets; Arjun gets Kunafa, Mochi, Baklava ("Because you loved Tiramisu"). |
| 3:00 | Close on Paaji | Tap Paaji for a fresh suggestion. *"Ek banda ek cheez lene aaya… teen le gaya."* |

**Backup beats** (if time): Budget Mode ("₹500 for 10 guests"), the Mithai World Map, voice command
"Paaji, do kilo kaju katli daal do", Admin → CSV import with `supabase/templates/stock_update_template.csv`.


---

# 🎬 Feature Pack 2 — 4-minute demo

Two windows: **A** = customer (`priya.demo@`), **B** = owner (admin account). Sound on.

| Time | Do this | What the judges see |
|---|---|---|
| **0:00** | A: open `/?demo=cold#/` | Weather banner: 🧣 "Thand hai ji! Garam halwe da time" · "📍 Muzaffarnagar · 11°C". Row of gajar halwa, gond laddoo, pinni — each says "Kyunki bahar 11°C hai". Paaji says it. (Then `?demo=off` → live Open-Meteo weather.) |
| 0:25 | A: Home → **Bhooli Hui Mithai** → type *"peeli lambi si, chashni wali, bengali, upar khoya laga tha — woh chum wali"* | Big reveal: **"Mil gayi ji! Yeh thi… Chamcham!"** 95% · clues: chashni wali, chhena se bani, long shape, Bengal se. (Close call? Paaji asks a yes/no question first.) |
| 0:55 | A: **Add to cart**, open the cart | Combo card: 🥨 "Meetha ho gaya, ab thoda namkeen?" — one tap adds Aloo Bhujia; Paaji: "Kaju katli de naal bhujia, kya baat hai!" Server total updates with the Jodi combo discount. |
| 1:15 | A: Checkout → apply **SSDEMO10** → Place | Total recalculated in Postgres (deal + combo + Mix & Save + coupon). Order success → **golden scratch card** → scratch with a finger → sparkle burst → prize + coupon code. Paaji cheers (or "Koi gal nahi ji, agli baar pakka!"). |
| 1:45 | A: **Gift Planner** → Paaji, plan karo! | 5 boxes in seconds for Mausi ji (sugar-free), Chacha's family (dry fruit + namkeen), Boss (Bengali)… each with reasons, live budget bar, swap button, gift-card shayari. |
| 2:25 | B: Admin → **📈 Owner dashboard** | "Kal Kitna Banana Hai?": tomorrow's production plan with kg and reasons ("Dussehra is tomorrow"), accuracy chart, waste falling week by week, pre-orders by festival. Open **Kitchen view**. |
| 3:00 | B: **Fresh batch bana** (Kalakand, 5 kg) → then **Garam batch aa raha hai** (Jalebi, 10 min) | A updates live: Kalakand gets "🔥 Aaj ka Taaza · Bana: abhi abhi"; a big orange banner "Garam Jalebi 10 minute mein!" with countdown and *kitna bacha*. A taps **Mere liye rakh lo** → 250 g reserved, the counter drops for everyone. |
| 3:35 | B: tap **⏰ Open deal window now** (demo switch) | A's home shows the **Last Hour Deals** strip with a countdown to closing, struck-through prices and "Sirf 3.5 kg bacha". |
| 3:55 | Close | *"Ek banda ek cheez lene aaya tha… teen le gaya."* |
