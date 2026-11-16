# AI Tutor — Competitive Exam Preparation Platform

A production-grade, AI-powered exam preparation platform built on the MERN stack. Currently targets **SSC CGL** with a fully exam-agnostic architecture ready to expand to all major competitive examinations.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router v6, Recharts, Lucide React |
| Backend | Node.js, Express.js, MongoDB, Mongoose |
| Auth | JWT, bcryptjs |
| Security | Helmet, CORS, express-rate-limit, express-validator |
| AI | Configurable LLM via environment variables (Phase 6) |

---

## Project Structure

```
AI Tutor/
├── backend/
│   ├── src/
│   │   ├── app.js              # Express app setup
│   │   ├── server.js           # Entry point
│   │   ├── config/db.js        # MongoDB connection
│   │   ├── controllers/        # Route handlers
│   │   ├── middleware/         # Auth, error handling, validation
│   │   ├── models/             # Mongoose schemas
│   │   ├── routes/             # Express route definitions
│   │   └── utils/              # Helpers, seeder
│   ├── .env                    # Environment variables (not committed)
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx             # Router setup
    │   ├── components/         # Reusable UI components
    │   ├── context/            # React context (auth)
    │   ├── pages/              # Page components
    │   └── services/           # API service layer
    └── index.html
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
npm install
npm run dev
```

### 2. Seed Database (SSC CGL data)

```bash
cd backend
npm run seed
```

This creates:
- SSC CGL exam with 4 subjects and 23 topics
- 50+ realistic practice questions
- Admin account: `admin@aitutor.com` / `Admin@1234`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`  
Backend runs at: `http://localhost:5000`

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/ai-tutor
JWT_SECRET=your_secret_here
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
AI_PROVIDER=openai
AI_API_KEY=your_openai_key        # Required for Phase 6 AI Tutor
AI_MODEL=gpt-4o-mini
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:5000/api
```

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Health check | Public |
| POST | `/api/auth/register` | Create account | Public |
| POST | `/api/auth/login` | Login | Public |
| GET | `/api/auth/me` | Current user | Protected |
| GET | `/api/exams` | List exams | Public |
| GET | `/api/subjects?examId=` | Subjects for exam | Public |
| GET | `/api/topics?subjectId=` | Topics for subject | Public |
| GET | `/api/questions` | List questions (paginated) | Protected |
| POST | `/api/practice/start` | Start practice session | Protected |
| POST | `/api/practice/:id/submit` | Submit session | Protected |
| GET | `/api/practice/:id/result` | Session result | Protected |
| GET | `/api/practice/mistakes/me` | My wrong answers | Protected |
| GET | `/api/analytics/dashboard` | Dashboard data | Protected |
| GET | `/api/progress/me` | Progress data | Protected |
| GET | `/api/admin/dashboard` | Admin stats | Admin |
| GET | `/api/admin/users` | Manage users | Admin |

---

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 — Foundation | ✅ Complete | MERN setup, auth, routing, design system |
| 2 — Authentication | ✅ Complete | JWT, register, login, profile |
| 3 — Exam Structure | ✅ Complete | Exam/Subject/Topic CRUD + seed data |
| 4 — Question Engine | ✅ Complete | Practice system, scoring, result analysis |
| 5 — Dashboard | ✅ Complete | Real analytics, progress tracking |
| 6 — AI Tutor | 🔄 Next | LLM integration, chat interface, context |
| 7 — AI Question Gen | 📋 Planned | Generate + validate questions via AI |
| 8 — Adaptive Learning | 📋 Planned | Weakness detection, recommendations |
| 9 — Study Plan | 📋 Planned | AI-generated daily study schedules |
| 10 — Mock Tests | 📋 Planned | Full exam simulation with timer |
| 11 — RAG | 📋 Planned | Study materials + vector search |
| 12 — Production | 📋 Planned | Security hardening, monitoring |

---

## User Roles

- **Student** — Practice questions, view analytics, use AI Tutor, track progress
- **Admin** — Manage exams/subjects/topics/questions, view platform stats, manage users

---

## Supported Exams (Roadmap)

Currently: **SSC CGL**

Coming soon: SSC CHSL, Banking PO, TNPSC, UPSC, Railway, GATE, CAT, JEE, NEET
