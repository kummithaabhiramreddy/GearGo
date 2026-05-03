# 🚀 GearGo - Project Setup Guide

Follow these steps to build and run the 프로젝트 perfectly in this folder.

## 🛠️ 1. Local Setup (Run on your Computer)

### Step 1: Clone the Repository
Open your Terminal or Command Prompt and run:
```bash
git clone https://github.com/your-username/gear-go.git
```

### Step 2: Go into Project Folder
```bash
cd gear-go
```

### Step 3: Install Dependencies
This will install all required packages listed in `package.json`:
```bash
npm install
```

### Step 4: Setup Environment Variables
Create a `.env` file in the root folder and add your Database and API credentials:
```env
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=geargo
DB_HOST=localhost
DB_PORT=5432
```

### Step 5: Run the Server
You can now start the backend server:
```bash
npm start
```
*Tip: Use `npm run dev` if you want the server to restart automatically when you save changes.*

---

## 🌐 2. Open in Browser
Once the server is running, you can access the application at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ⚠️ Common Errors & Fixes

### ❌ Error: `Cannot find module`
**Fix:** Run `npm install` again to ensure all packages are downloaded.

### ❌ Error: `Port 3000 already in use`
**Fix:** 
1. Close other terminals running the server.
2. Or change the port in `server.js`: `const PORT = 5000;`

### ❌ Error: `Database not connecting`
**Fix:** Ensure your PostgreSQL server is running and the credentials in your `.env` file are correct.

---

## 🚀 3. Online Deployment (Deploy)
If you want to host your project online for others to use:

1. **GitHub**: Push your code to a GitHub repository.
2. **Render.com**:
   - Link your GitHub account.
   - Select **New Web Service**.
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment Variables**: Add all variables from your local `.env`.

---

✨ **GearGo** is now ready to go!
