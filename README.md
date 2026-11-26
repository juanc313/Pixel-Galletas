# Pixel Galletas

Online ordering web app for **Pixel Galletas**, a small handmade cookie business in Cúcuta, Colombia.
Customers browse the catalog, build a cart and place an order; the shop owner gets a Telegram alert
and manages orders, products and users from an admin panel.

**Live site:** https://pixel-galletas.vercel.app
&nbsp;·&nbsp; Spanish documentation: [README.es.md](README.es.md)

## Tech stack

| Area | Tools |
|---|---|
| Backend | Node.js, Express 5, REST API |
| Database | MySQL (Aiven in production), parameterized queries with `mysql2` |
| Frontend | HTML, CSS and vanilla JavaScript (no framework), installable PWA |
| Auth & security | JWT, bcrypt, role checks in the database, `helmet` + strict CSP, rate limiting |
| Testing & CI | Node.js test runner (227 tests), GitHub Actions, Postman collection |
| Hosting | Vercel (static site + serverless API) |

## Features

- **Catalog and cart:** volume discounts (5%, 8%, 10%) and delivery fees by distance.
  The **server recalculates every price**: it never trusts the total sent by the browser.
- **Orders without an account:** customers can check their order status with the order number
  **and** their phone number (sent in a POST body, so it never appears in URLs or logs).
- **Accounts and roles:** registration always creates a `cliente` (customer) account; admin routes check the
  role in the database on every request, not only in the token.
- **Admin panel:** manage products, stock ("sold out" in one click), orders and users.
- **Telegram bot:** notifies each new order and sends reminders for orders that have been waiting too long
  (webhook with a secret header + scheduled GitHub Actions workflow).
- **Privacy-friendly analytics:** anonymous events only, no cookies, no IP addresses.

## Run it locally

Requirements: Node.js (LTS) and MySQL 8.

```bash
npm install
cp .env.example .env      # then fill in your MySQL password and a JWT_SECRET
# create the database by running database/schema.sql on a new, empty database
npm run crear-admin       # creates the first admin user
npm start                 # http://localhost:3000
```

## Tests

```bash
npm test
```

Runs 227 automated tests with an in-memory fake database, so **no MySQL is needed**.
They cover the API, authentication, orders and cart, stock, security (roles, tokens, SQL injection,
price tampering), rate limits, the Telegram bot and the frontend logic.
The same tests run on every push in GitHub Actions (`.github/workflows/ci.yml`).

## API overview

| Method | Route | Access |
|---|---|---|
| POST | `/api/usuarios/registro`, `/api/usuarios/login` | Public (login returns a 2-hour JWT) |
| GET | `/api/productos` | Public |
| POST · PUT · DELETE | `/api/productos/:id` | Admin only |
| POST | `/api/pedidos` | Public (total calculated by the server) |
| POST | `/api/pedidos/estado` | Public (requires order number + phone) |
| GET · PUT | `/api/pedidos`, `/api/pedidos/:id/estado` | Admin only |
| GET · PUT · DELETE | `/api/usuarios/:id` | Admin only |

Send the token as `Authorization: Bearer <token>`. Invalid token → **401**; missing permission → **403**.
A full Postman collection is in [`postman/`](postman/).

## Project structure

```
api/index.js      Vercel entry point
server.js         Local entry point
src/              Backend: config, models, controllers, middlewares, routes
public/           Frontend: HTML, CSS, JavaScript and images
database/         SQL schema
tests/            Automated tests
postman/          API collection and environments
docs/             Test plan
```

## Author

**Juan Camilo Sandoval Uribe**, Software Engineering student (FESC, Cúcuta).
[GitHub](https://github.com/juanc313) · [LinkedIn](https://www.linkedin.com/in/juan-sandoval-172819438/)
