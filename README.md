# 🧭 LifePilot AI — Student Life Operating System

> An AI that learns how much you can actually handle — and plans your academic life accordingly.

LifePilot isn't a to-do app. It's a **proactive planning partner** for students: it understands natural language, splits big work into executable sessions, negotiates load when your plate is full, reshuffles missed work, learns your real capacity over time, and measures *recovery* instead of just failure.

## ✨ Features

- 🧠 **Natural language task creation** — "Finish DBMS assignment by Friday, about 5 hours" becomes 5 scheduled 60-min sessions across the week.
- 🧩 **AI task decomposition** — big goals like *"prepare for semester exams"* break into subject subtopics automatically.
- ⚠️ **Load Negotiation** — the AI warns you if adding a task will overload days and offers alternatives.
- ⚡ **Reality Mode** — "I have 90 minutes. What should I *actually* do?"
- 📊 **Consistency Profile** — execution %, on-time rate, recovery score, planning accuracy, streak, average delay.
- 🔄 **Automatic rescheduling** — missed sessions get proposed for new slots; recovery is measured.
- 💳 **Planning Debt detection** — tasks postponed 3+ times trigger an "AI split this up" intervention.
- ❤️ **Well-being layer** — after 3 "ran out of time" failures, your daily capacity is automatically lowered to be realistic.
- 🤝 **End-of-day Accountability** — asks *why* things were missed (too tired, didn't understand, ran out of time, etc.) and adapts.
- 👥 **Squad Mode** — private friend groups with weekly collaborative challenges (no raw-workload leaderboards).
- ⏰ **Free Time detector** — spots open windows and suggests optimal fills (with buffer time).
- 🧬 **Personal Productivity Model** — learns your actual study capacity, estimates vs actuals, and preferred productivity windows.

## 🏗️ Architecture

```
React (Vite)  ──/api──▶  Express API
                            │
    ┌───────────────────────┴────────────────────────┐
    │                                                │
    ▼                                                ▼
 NLP Engine        Scheduling Engine    Capacity/Load Engine
 (parse intent,    (spread chunks,      (budget calc, overload
 durations,        deadline-aware,      detection, free gaps)
 deadlines,       productivity-window
 decompose)        aware)
    │                   │                     │
    └─────────┬─────────┴──────────┬──────────┘
              ▼                    ▼
       Personalization        Analytics Engine
       Model (learned         (execution, on-time,
       capacity, est vs       recovery, accuracy,
       actual ratios)         planning debt)
                                │
                                ▼
                        Accountability Partner
                        (failure reasons, nudges)
```

## 🚀 Getting Started

```bash
npm install
npm run dev        # starts API on :3001 and Vite on :5173
```

Open http://localhost:5173 and you're in.

The app is single-user (MVP). Default seed user is *Rahul (B.Tech CSE Year 2)* with Mon–Fri classes 9–4 and a sample squad called **CSE Warriors**.

## 🧭 Try these flows

1. Type *"I need to finish my DBMS assignment by Friday, about 5 hours"* — watch it schedule 5 sessions, respecting classes and your night-owl preference.
2. Click **⚡ Reality Mode** — give it 90 minutes and see what it recommends right now.
3. Add a second heavy task — the Load Negotiation modal will pop up.
4. Visit **Consistency** to see your Recovery Score, on-time rate, and planning accuracy.
5. Add friends via the **Squad** page and chase a weekly task goal together.

## 🔑 The Differentiator

Not *"AI to-do list"* — an AI that:

**Understands me → Understands my tasks → Plans my day → Detects overload → Asks permission → Adapts → Learns my behavior → Improves tomorrow.**
