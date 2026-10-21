# The Heaven Hospitality

## Project

Premium Boys PG / Paying Guest hospitality website.

## Applications

### Frontend
- React + Vite + Tailwind CSS

### Backend
- Node.js + Express.js

### Database
- MongoDB

### Images
- Cloudinary

## Folder Structure

```text
The_heavan_hospility/
├── frontend/
├── backend/
├── .gitignore
├── README.md
```

- `frontend/` contains the public website built with React, Vite, and Tailwind.
- `backend/` contains the Express API, MongoDB models, authentication, and admin data services.

## Local Development

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
npm run dev
```

Before starting the backend, configure `MONGODB_URI` and `JWT_SECRET` in `backend/.env`.
To create the first admin account, set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`
there, then run `npm run seed:admin` from `backend/`. Use a unique password of at least
12 characters. Re-running the command with the same credentials does not create a duplicate.
Admin sign-in is available at `/admin/login` on the frontend.

> Deployment will be added later.
