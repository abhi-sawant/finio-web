# Finio API Documentation

**Base URL**: `https://api.finio.slowatcoding.com`

**Content Type**: All requests and responses use `application/json; charset=utf-8`  
**Authentication**: JWT Bearer tokens (HS256) with 30-day expiry

---

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
  - [Auth](#auth)
    - [POST /auth/register](#post-authregister)
    - [POST /auth/verify-otp](#post-authverify-otp)
    - [POST /auth/resend-otp](#post-authresend-otp)
    - [POST /auth/login](#post-authlogin)
    - [POST /auth/forgot-password](#post-authforgot-password)
    - [POST /auth/reset-password](#post-authreset-password)
  - [User](#user)
    - [GET /user/me](#get-userme)
    - [PUT /user/me](#put-userme)
    - [DELETE /user/me](#delete-userme)
  - [Backup](#backup)
    - [POST /backup/upload](#post-backupupload)
    - [GET /backup/latest](#get-backuplatest)
    - [GET /backup/list](#get-backuplist)
    - [GET /backup/{date}](#get-backupdate)
    - [DELETE /backup/{date}](#delete-backupdate)

---

## Getting Started

### Quick Start

1. **Register** an account via `POST /auth/register`
2. **Verify** your email using the 6-digit OTP sent to your inbox via `POST /auth/verify-otp`
3. **Use the token** returned from verification (or login) in the `Authorization` header for all protected endpoints

### Making Requests

All requests should be made to:

```
https://api.finio.slowatcoding.com/<endpoint>
```

**Example using cURL:**

```bash
curl -X POST https://api.finio.slowatcoding.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com", "password": "mypassword123"}'
```

**Example using JavaScript (fetch):**

```javascript
const response = await fetch('https://api.finio.slowatcoding.com/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'mypassword123'
  })
});
const data = await response.json();
// data.token → use this for authenticated requests
```

**Authenticated request example:**

```javascript
const response = await fetch('https://api.finio.slowatcoding.com/user/me', {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
});
```

---

## Authentication

Protected endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### How to Get a Token

Tokens are returned from two endpoints:
- `POST /auth/verify-otp` — after verifying your email during registration
- `POST /auth/login` — when logging into an existing verified account

### Token Details

| Property    | Value                           |
| ----------- | ------------------------------- |
| Algorithm   | HS256                           |
| Expiry      | 30 days from issue              |
| Format      | Standard JWT (header.payload.signature) |

### JWT Payload

```json
{
  "iss": "https://api.finio.slowatcoding.com",
  "sub": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "iat": 1700000000,
  "exp": 1702592000
}
```

| Field   | Description                          |
| ------- | ------------------------------------ |
| `sub`   | User ID (integer)                    |
| `email` | User email                           |
| `name`  | User display name                    |
| `iat`   | Issued at (Unix timestamp)           |
| `exp`   | Expiration (Unix timestamp)          |

---

## Error Handling

All error responses follow this format:

```json
{
  "error": "Human-readable error message."
}
```

### HTTP Status Codes

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| 200  | Success                                          |
| 201  | Created (e.g., account registered)               |
| 400  | Bad Request (validation error, malformed JSON)   |
| 401  | Unauthorized (invalid credentials or token)      |
| 403  | Forbidden (account not verified, wrong password) |
| 404  | Not Found                                        |
| 409  | Conflict (duplicate resource)                    |
| 410  | Gone (expired OTP)                               |
| 500  | Internal Server Error                            |

---

## Endpoints

---

### Auth

All auth endpoints are **public** — no token required.

---

#### POST /auth/register

Creates a new user account and sends a 6-digit OTP to the provided email for verification.

```
POST https://api.finio.slowatcoding.com/auth/register
```

**Request Body**

| Field      | Type   | Required | Constraints                |
| ---------- | ------ | -------- | -------------------------- |
| `name`     | string | Yes      | Non-empty                  |
| `email`    | string | Yes      | Valid email format          |
| `password` | string | Yes      | Minimum 8 characters       |

**Example Request**

```bash
curl -X POST https://api.finio.slowatcoding.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepass123"
  }'
```

**Success Response** — `201 Created`

```json
{
  "message": "Account created. Enter the 6-digit OTP sent to your email.",
  "email": "john@example.com"
}
```

**Error Responses**

| Status | Condition                                              |
| ------ | ------------------------------------------------------ |
| 400    | Name is empty, email is invalid, or password < 8 chars |
| 409    | An account with this email already exists              |

**Notes**
- If an unverified account with the same email exists, it updates the password/OTP and resends verification.
- OTP expires in **15 minutes**.
- Check your spam/junk folder if you don't see the email.

---

#### POST /auth/verify-otp

Verifies the email OTP and activates the account. Returns a JWT token on success.

```
POST https://api.finio.slowatcoding.com/auth/verify-otp
```

**Request Body**

| Field   | Type   | Required | Description              |
| ------- | ------ | -------- | ------------------------ |
| `email` | string | Yes      | Account email            |
| `otp`   | string | Yes      | 6-digit OTP from email   |

**Example Request**

```bash
curl -X POST https://api.finio.slowatcoding.com/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "otp": "482913"
  }'
```

**Success Response** — `200 OK`

```json
{
  "message": "Email verified successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses**

| Status | Condition                                |
| ------ | ---------------------------------------- |
| 400    | Email or OTP is empty                    |
| 401    | Invalid OTP                              |
| 404    | No account found with this email         |
| 410    | OTP has expired (request a new one)      |

---

#### POST /auth/resend-otp

Sends a new 6-digit OTP to an unverified account's email.

```
POST https://api.finio.slowatcoding.com/auth/resend-otp
```

**Request Body**

| Field   | Type   | Required | Description          |
| ------- | ------ | -------- | -------------------- |
| `email` | string | Yes      | Valid email address   |

**Example Request**

```bash
curl -X POST https://api.finio.slowatcoding.com/auth/resend-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}'
```

**Success Response** — `200 OK`

```json
{
  "message": "A new OTP has been sent to your email."
}
```

**Error Responses**

| Status | Condition                        |
| ------ | -------------------------------- |
| 400    | Invalid email format             |
| 400    | Account is already verified      |
| 404    | No account found with this email |

---

#### POST /auth/login

Authenticates a verified user and returns a JWT token.

```
POST https://api.finio.slowatcoding.com/auth/login
```

**Request Body**

| Field      | Type   | Required | Description       |
| ---------- | ------ | -------- | ----------------- |
| `email`    | string | Yes      | Account email     |
| `password` | string | Yes      | Account password  |

**Example Request**

```bash
curl -X POST https://api.finio.slowatcoding.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securepass123"
  }'
```

**Success Response** — `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses**

| Status | Condition                                       |
| ------ | ----------------------------------------------- |
| 400    | Email or password is empty                      |
| 401    | Invalid email or password                       |
| 403    | Account not verified (complete OTP verification first) |

---

#### POST /auth/forgot-password

Initiates a password reset by sending a 6-digit OTP to the user's email.

```
POST https://api.finio.slowatcoding.com/auth/forgot-password
```

**Request Body**

| Field   | Type   | Required | Description        |
| ------- | ------ | -------- | ------------------ |
| `email` | string | Yes      | Valid email address |

**Example Request**

```bash
curl -X POST https://api.finio.slowatcoding.com/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}'
```

**Success Response** — `200 OK`

```json
{
  "message": "If an account with that email exists, a 6-digit OTP has been sent."
}
```

**Notes**
- Always returns success regardless of whether the email exists (security by design).
- OTP expires in **15 minutes**.

---

#### POST /auth/reset-password

Resets the user's password using the OTP received via email.

```
POST https://api.finio.slowatcoding.com/auth/reset-password
```

**Request Body**

| Field      | Type   | Required | Constraints          |
| ---------- | ------ | -------- | -------------------- |
| `email`    | string | Yes      | Account email        |
| `otp`      | string | Yes      | 6-digit reset OTP    |
| `password` | string | Yes      | Minimum 8 characters |

**Example Request**

```bash
curl -X POST https://api.finio.slowatcoding.com/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "otp": "193847",
    "password": "newSecurePass456"
  }'
```

**Success Response** — `200 OK`

```json
{
  "message": "Password has been reset. You can now log in."
}
```

**Error Responses**

| Status | Condition                              |
| ------ | -------------------------------------- |
| 400    | Email/OTP empty or password < 8 chars  |
| 401    | Invalid OTP                            |
| 404    | No account or no pending reset request |
| 410    | OTP has expired                        |

---

### User

All user endpoints require authentication.

**Required Header:**
```
Authorization: Bearer <token>
```

---

#### GET /user/me

Returns the authenticated user's profile.

```
GET https://api.finio.slowatcoding.com/user/me
```

**Example Request**

```bash
curl https://api.finio.slowatcoding.com/user/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Success Response** — `200 OK`

```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "created_at": "2024-01-15 10:30:00"
  }
}
```

**Error Responses**

| Status | Condition                   |
| ------ | --------------------------- |
| 401    | Missing or invalid token    |
| 404    | User not found              |

---

#### PUT /user/me

Updates the authenticated user's name and/or password.

```
PUT https://api.finio.slowatcoding.com/user/me
```

**Request Body**

| Field              | Type   | Required | Description                     |
| ------------------ | ------ | -------- | ------------------------------- |
| `name`             | string | No       | New display name                |
| `new_password`     | string | No       | New password (min 8 chars)      |
| `current_password` | string | No*      | Required when changing password |

**Example — Update Name**

```bash
curl -X PUT https://api.finio.slowatcoding.com/user/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe"}'
```

**Example — Change Password**

```bash
curl -X PUT https://api.finio.slowatcoding.com/user/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "oldPass123",
    "new_password": "newSecurePass456"
  }'
```

**Success Response** — `200 OK`

```json
{
  "message": "Profile updated.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "email": "john@example.com"
  }
}
```

> **Important**: A new JWT is returned. Replace your stored token with this one.

**Error Responses**

| Status | Condition                                    |
| ------ | -------------------------------------------- |
| 400    | No changes provided or new password < 8 chars |
| 401    | Missing or invalid token                     |
| 403    | Current password is incorrect                |
| 404    | User not found                               |

---

#### DELETE /user/me

Permanently deletes the account and all associated data. **This cannot be undone.**

```
DELETE https://api.finio.slowatcoding.com/user/me
```

**Request Body**

| Field      | Type   | Required | Description                       |
| ---------- | ------ | -------- | --------------------------------- |
| `password` | string | Yes      | Current password for confirmation |

**Example Request**

```bash
curl -X DELETE https://api.finio.slowatcoding.com/user/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"password": "securepass123"}'
```

**Success Response** — `200 OK`

```json
{
  "message": "Account and all data permanently deleted."
}
```

**Error Responses**

| Status | Condition                 |
| ------ | ------------------------- |
| 401    | Missing or invalid token  |
| 403    | Incorrect password        |
| 404    | User not found            |

---

### Backup

All backup endpoints require authentication. Backups store arbitrary JSON data (one backup per day per user). Old backups are automatically cleaned up after 30 days.

**Required Header:**
```
Authorization: Bearer <token>
```

---

#### POST /backup/upload

Uploads a JSON backup. One backup per day — uploading again on the same day overwrites the previous one.

```
POST https://api.finio.slowatcoding.com/backup/upload
```

**Request Body**

The entire request body is the raw JSON you want to back up. It can be any valid JSON structure.

**Example Request**

```bash
curl -X POST https://api.finio.slowatcoding.com/backup/upload \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "abc-123", "name": "Cash", "type": "cash", "balance": 5000}
    ],
    "transactions": [
      {"id": "tx-001", "type": "expense", "amount": 250, "date": "2024-06-15"}
    ],
    "categories": [],
    "labels": [],
    "settings": {"currency": "INR", "theme": "dark"}
  }'
```

**Success Response** — `200 OK`

```json
{
  "message": "Backup uploaded successfully.",
  "backup_date": "2024-06-15",
  "file_size": 284
}
```

**Error Responses**

| Status | Condition                       |
| ------ | ------------------------------- |
| 400    | Empty body or invalid JSON      |
| 401    | Missing or invalid token        |
| 500    | Server error writing file       |

**Notes**:
- `file_size` is in bytes.
- Backups older than 30 days are automatically deleted.

---

#### GET /backup/latest

Downloads the most recent backup. The response body is the exact JSON that was uploaded.

```
GET https://api.finio.slowatcoding.com/backup/latest
```

**Example Request**

```bash
curl https://api.finio.slowatcoding.com/backup/latest \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Success Response** — `200 OK`

The response body is the raw backup JSON exactly as it was uploaded:

```json
{
  "accounts": [...],
  "transactions": [...],
  "settings": {...}
}
```

**Error Responses**

| Status | Condition                |
| ------ | ------------------------ |
| 401    | Missing or invalid token |
| 404    | No backups found         |

---

#### GET /backup/list

Returns metadata for all available backups, ordered newest first.

```
GET https://api.finio.slowatcoding.com/backup/list
```

**Example Request**

```bash
curl https://api.finio.slowatcoding.com/backup/list \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Success Response** — `200 OK`

```json
{
  "backups": [
    {
      "backup_date": "2024-06-15",
      "file_size": 28456,
      "created_at": "2024-06-15 14:30:22"
    },
    {
      "backup_date": "2024-06-14",
      "file_size": 27890,
      "created_at": "2024-06-14 09:15:03"
    }
  ]
}
```

| Field         | Type   | Description                       |
| ------------- | ------ | --------------------------------- |
| `backup_date` | string | Date of backup (`YYYY-MM-DD`)     |
| `file_size`   | int    | Size in bytes                     |
| `created_at`  | string | When the backup was created/updated |

**Error Responses**

| Status | Condition                |
| ------ | ------------------------ |
| 401    | Missing or invalid token |

---

#### GET /backup/{date}

Downloads a specific backup by date.

```
GET https://api.finio.slowatcoding.com/backup/2024-06-15
```

**URL Parameters**

| Parameter | Format       | Description        |
| --------- | ------------ | ------------------ |
| `date`    | `YYYY-MM-DD` | Date of the backup |

**Example Request**

```bash
curl https://api.finio.slowatcoding.com/backup/2024-06-15 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Success Response** — `200 OK`

The response body is the raw backup JSON.

**Error Responses**

| Status | Condition                     |
| ------ | ----------------------------- |
| 400    | Invalid date format           |
| 401    | Missing or invalid token      |
| 404    | No backup found for that date |

---

#### DELETE /backup/{date}

Deletes a specific backup by date.

```
DELETE https://api.finio.slowatcoding.com/backup/2024-06-15
```

**URL Parameters**

| Parameter | Format       | Description        |
| --------- | ------------ | ------------------ |
| `date`    | `YYYY-MM-DD` | Date of the backup |

**Example Request**

```bash
curl -X DELETE https://api.finio.slowatcoding.com/backup/2024-06-14 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Success Response** — `200 OK`

```json
{
  "message": "Backup for 2024-06-14 deleted."
}
```

**Error Responses**

| Status | Condition                     |
| ------ | ----------------------------- |
| 400    | Invalid date format           |
| 401    | Missing or invalid token      |
| 404    | No backup found for that date |

---

## Endpoint Summary

| Method | Endpoint              | Auth | Description                    |
| ------ | --------------------- | ---- | ------------------------------ |
| POST   | `/auth/register`      | No   | Create account, sends OTP      |
| POST   | `/auth/verify-otp`    | No   | Verify email, get token        |
| POST   | `/auth/resend-otp`    | No   | Resend verification OTP        |
| POST   | `/auth/login`         | No   | Login, get token               |
| POST   | `/auth/forgot-password` | No | Send password reset OTP        |
| POST   | `/auth/reset-password`| No   | Reset password with OTP        |
| GET    | `/user/me`            | Yes  | Get profile                    |
| PUT    | `/user/me`            | Yes  | Update name/password           |
| DELETE | `/user/me`            | Yes  | Delete account permanently     |
| POST   | `/backup/upload`      | Yes  | Upload JSON backup             |
| GET    | `/backup/latest`      | Yes  | Download latest backup         |
| GET    | `/backup/list`        | Yes  | List all backups with metadata |
| GET    | `/backup/{date}`      | Yes  | Download backup by date        |
| DELETE | `/backup/{date}`      | Yes  | Delete backup by date          |

---

## Tips

- **OTP emails** may end up in spam/junk — check there if you don't receive one.
- **Token expiry**: Tokens last 30 days. After that, just call `/auth/login` again.
- **Password rules**: Minimum 8 characters. No other restrictions.
- **Backup data**: You can store any valid JSON as a backup — it doesn't have to follow a specific schema.
- **One backup per day**: Uploading multiple times on the same day overwrites the previous backup for that date.
- **Date format**: Always use `YYYY-MM-DD` (e.g., `2024-06-15`) for backup date parameters.
