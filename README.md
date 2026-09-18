# 🏦 SHG Tracker — Self-Help Group Savings & Micro-Loan System

An end-to-end community finance ledger and micro-loan management web platform built to digitize paper ledgers for **Self-Help Groups (SHGs)** and microfinance communities.

---

## ✨ Features

### 🔐 Authentication & Roles
- **Google OAuth 2.0**: One-click "Continue with Google" sign-in via Passport.js.
- **Local Authentication**: Secure email and bcrypt-hashed password authentication.
- **Role-Based Access Control**:
  - **Admin**: Create & configure SHGs, manage interest rates, approve/reject loans, record savings, and collect repayments.
  - **Member**: View savings passbook, request micro-loans, check repayment schedules, and track active debt.

### 💰 Savings Passbook
- Monthly savings contribution tracking for all members.
- Real-time passbook ledger calculation and exportable records.

### 💳 Loan & Repayment Management
- **Customizable Interest Rates**: Per-group annual interest percentage.
- **Auto-generated Schedules**: Simple-interest installment schedules calculated upon admin approval.
- **Repayment Tracking**: Real-time tracking of principal, interest, and outstanding balance.

### ⚖️ Late Payment Penalty & Default Policy
- **Grace Period**: Configurable grace days (default: 5 days) with zero penalty.
- **Fixed Late Fine**: Standard overdue fee (default: ₹50).
- **Penal Interest**: Monthly default rate (default: 2%/month) applied to overdue principal.
- **Borrowing Freeze**: Automatically restricts defaulters with overdue EMIs from submitting new loan applications.
- **Admin Waiver**: Ability for group leaders to waive penalties for medical/emergency hardship.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Passport.js (Google OAuth 2.0 & Session-based local auth)
- **View Engine**: EJS (Embedded JavaScript) templates
- **Styling**: Vanilla CSS (modern clean banking design, responsive)
- **Icons**: Lucide Icons

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- MongoDB Atlas cluster URI or a local MongoDB instance.
- Google Cloud OAuth credentials (optional for Google Login).

### 2. Installation

Clone the repository:
```bash
git clone https://github.com/kjaid0341-creator/ASSIGNMENT-2-WEBD-SAFAK_ALI.git
cd ASSIGNMENT-2-WEBD-SAFAK_ALI
```

Install dependencies:
```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory (refer to `.env.example`):
```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_secret_session_key

# Google OAuth Credentials (from console.cloud.google.com)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

### 4. Run Application

For development (with automatic restart via nodemon):
```bash
npm run dev
```

For production:
```bash
npm start
```

Visit the app at: **`http://localhost:3000`**

---

## 📁 Project Structure

```
├── middleware/
│   └── auth.js             # Authentication and authorization guards
├── models/
│   ├── Group.js            # SHG Group schema & penalty rules
│   ├── Loan.js             # Loan request, schedule & penalty schema
│   ├── Savings.js          # Member monthly savings schema
│   └── User.js             # User credentials, roles & Google OAuth schema
├── public/
│   ├── css/style.css       # Core design system & responsive styling
│   └── js/main.js          # Front-end interactivity & modals
├── routes/
│   ├── admin.js            # Admin dashboard, loans, groups & repayments
│   ├── auth.js             # Login, register, Google OAuth routes
│   └── member.js           # Member dashboard, passbook & loan requests
├── views/
│   ├── admin/              # Admin-specific templates
│   ├── auth/               # Login & Register views
│   ├── member/             # Member-specific templates
│   └── partials/           # Reusable header, footer, sidebar & alerts
├── .env.example            # Environment variables template
├── server.js               # Express application entrypoint
└── package.json            # Project metadata & dependencies
```

---

## 📜 License

This project is created for academic and demonstration purposes.
