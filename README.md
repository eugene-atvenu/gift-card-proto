# Prototype (Contains AI slop)
**NODE VERSION: 22**
## Folder Structure
- `db` - SQL with a current DB structure
- `app` - Crud API and business logic. Runs manually
- `app/bruno` - Bruno collection to play with the API
- `app/drizzle` - Drizzle ORM setup and DB migrations (useless now used to get drizzle schema from DB structure)
- `app/src` - App source code. Using Fastify, Drizzle ORM, Postgres. Some queries are done directly outside of Drizzle.
- `compose.yaml` - Docker compose file to run the DB

## Setup
1. run `docker compose up -d` to start the DB
2. Using tool of your choice connect to pg db and run `db/db-structure.sql` to create DB structure
3. switch to `app` folder
4. run `npm install` to install dependencies
5. run `npm run dev` to start the app
6. API will be running on `http://localhost:3000`

## Play with API
    User API is useless just ignore.
    Using Bruno to avoid Postman license issues.
1. Download and install Bruno from [here](https://www.usebruno.com/)
2. Open Bruno and add a collection from `app/bruno`

## Accounts
This may not be the optimal structure, but it serves the current purpose (prototype).
Also all account do have `allowed_credit` column that is currently not used.
### Per company
* company.company - Keeps transactions on giftcard creations. In future should have transactions on paying the bill.
* company.generic_in - Currently shows transactions on funds added to gift cards after release.
* company.generic_out - Currently shows transactions on funds spent from gift cards released.
### Per giftcard
* giftcard - Kinda like a bank account list funds in and out.

## Money flow
    company.comany -> giftcard (issue gift card)
    giftcard -> company.generic_out (redeem gift card)
    company.generic_in -> giftcard (top up gift card)
