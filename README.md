# CollabSheet

A real-time collaborative spreadsheet application Think Google Sheets, stripped to its core — focused on architectural decisions, real-time sync, and clean code.

**Live Demo:** [collabsheets.vercel.app](https://collabsheets.vercel.app)

---

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS**
- **Firebase** (Firestore + Realtime Database + Auth)
- **Deployed on Vercel**

---

## Features

### Core
- **Document Dashboard** — lists all your spreadsheets with title, last modified date, and who last edited
- **Spreadsheet Editor** — scrollable grid with 100 rows × 26 columns (A–Z), rows numbered, columns lettered
- **Formula Support** — custom-built parser supporting `=SUM`, `=AVERAGE`, `=MAX`, `=MIN`, and basic arithmetic with cell references (e.g. `=A1+B2*3`, `=(A1+B1)/2`)
- **Real-time Sync** — changes sync instantly across all open sessions of the same document via Firestore `onSnapshot`
- **Write-state Indicator** — shows `Saving...` → `✓ Saved` → `⚠ Unsaved` so users always know if their changes landed
- **Presence System** — active users are shown as avatars in the top bar; hovering shows their name and current cell
- **Cell Highlighting** — each collaborator's selected cell is highlighted in their unique color
- **Authentication** — Google sign-in via Firebase Auth, or guest sign-in with a custom display name

### Bonus
- **Cell Formatting** — bold, italic, text color, and background fill color per cell
- **Column & Row Resize** — drag the border between headers to resize
- **Keyboard Navigation** — arrow keys, Tab, Enter, Escape, Delete all work as expected
- **Export to CSV** — download the spreadsheet as a `.csv` file
- **Dark Mode** — toggle between light and dark themes
- **Editable Title** — click the document title to rename it inline
- **User Color Picker** — users can choose their own presence color

---

## Architecture Decisions

### Server vs Client Components
The dashboard (`app/dashboard/page.tsx`) fetches document metadata and could be a Server Component, but since it requires auth state it is a Client Component. The editor (`app/doc/[id]/page.tsx`) is fully client-side — it needs real-time listeners, keyboard events, and local state.

### State Management
Cell state lives locally in a `useReducer`-style pattern using `useRef` for synchronous access and `useState` for rendering. This avoids the stale closure problem common with Firestore listeners. Only deltas (changed cells) are written to Firestore, not the entire sheet on every keystroke. Saves are debounced by 600ms to avoid hammering the database.

### Real-time Sync
Firestore's `onSnapshot` listener drives all real-time updates. Every open session subscribes to the same document reference — when any user writes, all sessions receive the update within milliseconds.

### Presence
Presence (who's online, which cell they're on) uses Firebase **Realtime Database** rather than Firestore. Realtime Database is better suited for ephemeral, high-frequency presence data. `onDisconnect().remove()` ensures stale presence entries are cleaned up automatically when a user closes their tab.

### Formula Parser
The formula parser (`lib/formulaParser.ts`) is a custom regex-based evaluator. It handles:
- Named functions: `SUM`, `AVERAGE`, `MAX`, `MIN`
- Range expansion: `A1:C3` → list of cell IDs
- Cell reference substitution in arithmetic expressions
- Safe evaluation using `Function()` constructor (no `eval`)

### Conflict Handling
The current implementation uses **last-write-wins** — if two users edit the same cell simultaneously, the last Firestore write wins. For a production system, Operational Transformation (OT) or CRDTs would provide better conflict resolution, but last-write-wins is appropriate for this scope and is acknowledged explicitly.

---

## Folder Structure

```
collabsheet/
├── app/
│   ├── dashboard/
│   │   └── page.tsx         # Document listing page
│   ├── doc/
│   │   └── [id]/
│   │       └── page.tsx     # Spreadsheet editor
│   ├── globals.css
│   ├── layout.tsx           # Root layout with AuthProvider
│   └── page.tsx             # Login page
├── components/
│   └── (ui components)
├── hooks/
│   └── usePresence.ts       # Realtime presence hook
├── lib/
│   ├── authContext.tsx      # Auth state + Google/guest sign-in
│   ├── firebase.ts          # Firebase initialization
│   └── formulaParser.ts     # Custom formula engine
└── types/
    └── index.ts             # Shared TypeScript interfaces
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project with Firestore, Realtime Database, and Authentication enabled

### Installation

```bash
git clone https://github.com/Nishita-Gupta/collabsheet.git
cd collabsheet
npm install
```

### Environment Variables

Create a `.env.local` file in the root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_DATABASE_URL=your_rtdb_url
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
```

---

## Submission

- **Live URL:** [collabsheet.vercel.app](https://collabsheet.vercel.app)
