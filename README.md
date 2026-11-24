# MediBook — Clinic Appointment System

Node.js · Express · MySQL (`mysql2`, parameterized queries only, no ORM) · Redis (`ioredis`) · Jest.

## Demo

Walkthrough video:  
https://drive.google.com/file/d/18n_nLm8YoNQxq80GvmmpNRJoGjgQkWL8/view?usp=sharing

## Contents

| Path | What |
|---|---|
| `schema-diagram.png / .pdf / .svg` | Part A – 3NF schema diagram (PKs, FKs, cardinality, constraints) |
| `database/schema.sql`, `database/seed.sql` | Part B – DDL and sample data |
| `src/models` | **All SQL lives here** (every statement uses `?` placeholders) |
| `src/services` | Booking / cancel / waitlist business logic (calls models, no SQL) |
| `src/controllers`, `src/routes` | HTTP layer |
| `src/lib/auditLogger.js` | Part D – async `fs` audit log |
| `src/lib/queue.js`, `src/worker.js` | Part E – Redis queues + separate worker process |
| `src/utils` | Pure functions: refund calculator, slot validator, input validators |
| `tests/` | Part F – Jest unit tests (no MySQL / Redis needed) |
| `locales/`, `src/controllers/feedbackController.js` | Part G – i18n feedback page |

## Setup

Requirements: Node 18+, MySQL 8.0.16+ (CHECK constraints are enforced from 8.0.16; recursive CTEs need 8.0), Redis 6.2+ (`BLMOVE`).

```bash
npm install
cp .env.example .env          # then edit DB_USER / DB_PASSWORD (never commit .env)

# 1. create database + tables + sample data (pick one)
mysql -u <user> -p < database/schema.sql && mysql -u <user> -p < database/seed.sql
#   or, using the credentials in .env:
npm run db:setup

# 2. start Redis (e.g. `redis-server`), then in two terminals:
npm start                     # web server  -> http://localhost:3000
npm run worker                # background worker (waitlist promotion + notifications)

npm test                      # unit tests
```

The seed dates are relative to the day it runs (`CURDATE() + INTERVAL n DAY`), so the appointments are always in the future. Dr. Boateng is fully booked (12/12) on day +3, Dr. Quaye has no appointments.

`.env.example`:
```
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=medibook_user
DB_PASSWORD=change_me
DB_NAME=medibook
REDIS_URL=redis://127.0.0.1:6379
AUDIT_LOG_PATH=logs/audit.log
```

## API

| Method & path | Purpose | Success |
|---|---|---|
| `GET/POST /api/patients` | list / create | 200 / 201 |
| `GET/PUT/PATCH/DELETE /api/patients/:id` | read / replace / partial update / delete | 200 / 204 |
| `GET/POST /api/doctors` | list / create | 200 / 201 |
| `GET/PUT/PATCH/DELETE /api/doctors/:id` | read / replace / partial update / delete | 200 / 204 |
| `GET /api/doctors/:id/statistics` | revenue, upcoming count, next-7-days load, utilization % | 200 |
| `POST /api/appointments` `{patientId, doctorId, datetime}` | book | 201 |
| `GET /api/appointments/:id` | read one | 200 |
| `DELETE /api/appointments/:id` | cancel; body reports the refund | 200 |
| `POST /api/waitlist` `{patientId, doctorId, datetime}` | join the waitlist for a full slot/day | 201 |
| `GET /api/reports/doctors` | every doctor's appointments + revenue (incl. zero) | 200 |
| `GET /api/reports/busy-days` | (doctor, date) with > 80 % of 12 slots booked | 200 |
| `GET /feedback?lang=fr` | Part G page | 200 |

`datetime` is clinic wall-clock time, `"YYYY-MM-DD HH:mm"`.
Status codes: `400` malformed/missing input · `404` not found · `409` conflict (slot taken, day full, duplicate email, delete with appointments, already cancelled) · `422` valid syntax but breaks a rule (past, outside 09:00–16:30, not on :00/:30, cancelling a past appointment) · `503` waitlist (Redis) unavailable. All errors go through one middleware and have the shape `{ "error": { "code", "message", "details?" } }`.

Example:
```bash
curl -X POST localhost:3000/api/appointments -H 'content-type: application/json' \
     -d '{"patientId":1,"doctorId":3,"datetime":"2026-12-01 09:30"}'
curl -X DELETE localhost:3000/api/appointments/7
# {"appointment":{...,"status":"cancelled","refund_amount":150},"refund":{"percentage":100,"amount":150,"hoursNotice":73.6}}
```

## Design justifications

### Part C — API design & business rules

* **REST resources, verbs for actions.** Nouns in the path (`/patients`, `/doctors`, `/appointments`), HTTP methods carry the verb. `PUT` replaces (all fields required), `PATCH` updates a subset. Statistics and reports are read-only sub-resources/collections (`/doctors/:id/statistics`, `/reports/...`).
* **Cancel = `DELETE /api/appointments/:id`.** The brief says appointments get their create/delete behaviour from book/cancel. The row is *soft*-deleted (`status='cancelled'`) because refund history must be kept; it returns `200` + the refund (not `204`) because the response has to state the refund amount.
* **Same slot, same instant (race condition).** Defence in depth: (1) the booking runs in a transaction that first takes `SELECT … FOR UPDATE` on the doctor row, so bookings for one doctor are serialised; (2) the database itself refuses duplicates through `UNIQUE (doctor_id, active_slot)`. `active_slot` is a stored generated column equal to `appt_datetime` while booked and `NULL` once cancelled — MySQL allows many NULLs in a unique index, so the cancelled row stays for history *and* the slot becomes bookable again. Verified with 10 parallel requests for one slot → exactly one `201`, nine `409`.
* **12 per day.** Not expressible as a row-level CHECK, so it is a count inside the same locked transaction. The doctor-row lock is what makes the count safe: without it two transactions could both read 11 and both insert. Verified with 6 parallel requests when 10/12 were taken → exactly 2 succeeded.
* **Refund policy** (`src/utils/refund.js`, documented boundaries): notice **> 48 h → 100 %**, **24 h ≤ notice ≤ 48 h → 50 %**, **< 24 h → 0 %**. "More than 48" and "less than 24" are strict, so *exactly* 48 h and *exactly* 24 h both fall in the 50 % band. Computed in integer cents on the server. The status change and refund fields are written by a single `UPDATE` inside a transaction (cancel and refund record succeed or fail together).
* **Revenue** = `SUM(amount_paid) − SUM(refund_amount)` per doctor. `amount_paid` is stored on the appointment (the spreadsheet shows a patient paying 120 on a 150 fee), not derived from the doctor's current fee.
* **Statistics/reports are computed in SQL**: a recursive CTE generates the 7 calendar days so days with zero appointments still appear, `LEFT JOIN` keeps doctors with no appointments in the report, and `GROUP BY … HAVING 100*COUNT(*)/12 > 80` finds busy days (≥ 10 bookings).
* **No SQL injection surface:** every value is bound with `?`. The only dynamic SQL is the `SET` list of `PATCH`/`PUT`, whose column names come from a hard-coded whitelist in the model, never from the request.

### Part D — audit log with `fs`

`src/lib/auditLogger.js` uses `fs/promises` only (`mkdir(recursive)` once, then `appendFile` of one JSON line) — no `*Sync` call anywhere in a request path. `audit()` catches every error, writes it to `stderr` and resolves `false`, so **a logging failure can never fail a booking or cancellation** (tested with an unwritable path: booking still returns `201`). `appendFile` with a single short line is effectively atomic, so concurrent requests do not interleave lines. A failed `mkdir` is not cached, so the next call retries.

### Part E — queues & Redis

* **Waitlist.** Booking a full slot/day returns `409` with `details.waitlist` explaining how to join. `POST /api/waitlist` is accepted only if the slot is really taken or the day is really full, and stores the patient in a per-doctor-per-day Redis list (`waitlist:<doctorId>:<date>`, FIFO). If the *day* was full the entry is `flexible` (any slot freed that day will do); if only the slot was taken it waits for that exact slot.
* **Cancellation → worker.** Cancelling enqueues a `waitlist.promote` job (list `queue:jobs`). The **worker process** (`npm run worker`, separate from the web server) picks it up with `BLMOVE queue:jobs → queue:jobs:processing`, finds the first matching waitlist entry and books it with the same `createBooking` code path (same rules, same locks, same audit/notification side-effects).
* **If the promoted booking fails, the patient never vanishes.** An entry is deleted from Redis **only after its outcome is durable**:
  * booked in MySQL → entry removed;
  * slot grabbed by someone else meanwhile → entry stays queued, nothing lost;
  * entry can never succeed (e.g. patient no longer exists) → copied to `waitlist:failed` *first*, then removed, and the next entry is tried;
  * transient error (MySQL/Redis down) → the error propagates, the entry is still in the list and the job is retried (3 attempts, then `queue:jobs:dead`);
  * crash after the booking but before the entry was removed → on retry the worker sees the patient already holds that slot and just removes the entry.
  Jobs sit in `queue:jobs:processing` while being worked on, and a restarted worker re-queues anything left there.
* **Confirmation jobs.** Every confirmed appointment (including waitlist promotions) enqueues `notify.confirmation`; the worker writes a `notification.sent` line to `logs/audit.log`. Enqueueing is best-effort: if Redis is down the booking still succeeds and an `notification.enqueue_failed` audit line is written (trade-off: that one confirmation is not sent; the waitlist endpoint answers `503`).

### Part F — tests

`npm test` runs 27 Jest tests (refund tiers and both boundaries, slot validation incl. 17:00 / 09:15 / `2026-02-31` / non-strings, patient/doctor validators, locale fallback). They exercise pure functions only, so no MySQL/Redis is needed.

### Part G — i18n / l10n

`GET /feedback?lang=en|fr` renders the title, instructions and the 5 questions from `locales/<lang>.json`. Unsupported, missing or array-valued `lang` falls back to English. The date uses `Intl.DateTimeFormat(lang, { dateStyle: 'full' })`. All locale text is HTML-escaped.

## Notes / assumptions

* The last bookable slot starts at **16:30** (so it ends at 17:00); "17:00 exactly" is rejected.
* Times are clinic-local wall-clock; MySQL `dateStrings` is on so there is no time-zone shifting.
* A patient/doctor with appointments cannot be deleted (`409`) — appointments are financial history.
