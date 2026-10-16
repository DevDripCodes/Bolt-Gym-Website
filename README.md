# Bolt Gym Booking

Bolt is a gym equipment booking and membership app built with Node.js, Express, MongoDB Atlas, and plain HTML, CSS, and JavaScript.

Members can sign in, check equipment availability, and reserve a continuous time range. Admins manage gym hours, equipment capacity, daily booking limits, and memberships.

## Features

- Persistent sign-in through a signed, seven-day `HttpOnly` browser cookie.
- Yoga, cardio, and strength training availability, tracked separately.
- Member-selected bookings in 30-minute increments. For example, 6:30–7:30 reserves both the 6:30–7:00 and 7:00–7:30 intervals.
- Per-interval equipment capacity, defaulting to 20 people for each training type.
- Server-side capacity checks and atomic reservations to prevent bookings from exceeding available equipment.
- Membership tracking and booking access checks. Members without an active membership can still sign in but cannot book.
- Admin controls for gym operating hours, default capacities, one-time capacity overrides, memberships, and the daily booking limit.
- Responsive interface built without React or another frontend framework.

## Requirements

- Node.js and npm
- A MongoDB Atlas connection string (or another MongoDB deployment)

## Setup

1. Install the dependencies:

   ```powershell
   npm install
   ```

2. Create `.env` from the example if you do not already have one:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Set the environment variables in `.env`:

   | Variable | Purpose |
   | --- | --- |
   | `PORT` | Web server port; defaults to `5000`. |
   | `MONGO_URI` | MongoDB connection string. |
   | `JWT_SECRET` | Private signing secret, at least 32 characters long. |
   | `ADMIN_NAME` | Name for the administrator account created at startup. |
   | `ADMIN_EMAIL` | Administrator sign-in email. |
   | `ADMIN_PASSWORD` | Administrator password, at least 8 characters and no more than 72 bytes. |
   | `GYM_TIMEZONE` | Gym's IANA timezone; defaults to `Asia/Kolkata`. |

   If `ADMIN_EMAIL` already belongs to an account, startup promotes that account to admin without changing its password.

4. Start the app:

   ```powershell
   npm run dev
   ```

   For a normal server start, use `npm start`.

5. Open [http://localhost:5000](http://localhost:5000), or use the port configured in `.env`. Sign in with the administrator credentials to access the Admin tab.

For production, set `NODE_ENV=production` and serve the site over HTTPS. Production cookies use the `Secure` attribute.

## Booking rules

- Default gym hours are 06:00–22:00 in `GYM_TIMEZONE`.
- Members choose the date, training type, start time, and end time. Times must align to the 30-minute grid and fall within gym hours.
- Each 30-minute interval has its own capacity and booked count. A booking that spans multiple intervals needs capacity in every interval.
- The default daily limit is four half-hour blocks per member. Admins can change it from 1 to 48 blocks per day.
- Members cannot make overlapping bookings. An active membership must cover the full booking window.
- Admins can adjust future interval capacity individually. Reducing gym hours is blocked if it would place an existing future booking outside the new hours.
- There are no payments or payment-provider integrations.

Availability records are created when a member or admin requests a date. The app does not generate a timetable of classes in advance. On startup, it migrates supported legacy bookings and reconciles stored equipment and daily-limit counters.

## API overview

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Create an account and sign in. |
| `POST` | `/api/auth/login` | Public | Sign in. |
| `POST` | `/api/auth/logout` | Public | Sign out and clear the cookie. |
| `GET` | `/api/auth/me` | Signed in | Get the current account and membership. |
| `GET` | `/api/slots?date=YYYY-MM-DD&category=yoga` | Signed in | Get 30-minute availability for a date and training type. |
| `GET` | `/api/bookings/me` | Signed in | List the current member's bookings. |
| `POST` | `/api/bookings` | Signed in | Reserve a continuous time range. |
| `DELETE` | `/api/bookings/:id` | Signed in | Cancel a future booking. |
| `GET`, `PATCH` | `/api/admin/config` | Admin | Read or update gym hours and default capacities. |
| `GET` | `/api/admin/slots?date=YYYY-MM-DD&category=yoga` | Admin | View interval occupancy. |
| `PATCH` | `/api/admin/slot-capacity` | Admin | Set or clear an individual interval capacity. |
| `GET`, `PATCH` | `/api/admin/settings` | Admin | Read or update the daily block limit. |
| `GET`, `POST` | `/api/admin/memberships` | Admin | List or add memberships. |
| `PATCH`, `DELETE` | `/api/admin/memberships/:id` | Admin | Edit or remove a membership. |

## Project structure

```text
config/       Database connection and administrator setup
middleware/   Sign-in and administrator access checks
models/       MongoDB models for users, bookings, capacity, and memberships
public/       HTML, CSS, and browser JavaScript
routes/       Authentication, availability, booking, and admin APIs
services/     Gym configuration and booking inventory setup
utils/        Timezone, interval, date, and availability helpers
```

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for additional design details and the implementation log.
