# Prototype (Contains AI slop)
## Folder Structure
- `db` - SQL with a current DB structure
- `app` - Crud API and business logic. Runs manually
- `app/bruno` - Bruno collection to play with the API
- `app/drizzle` - Drizzle ORM setup and DB migrations (useless now used to get drizzle schema from DB structure)
- `app/src` - App source code. Using Fastify, Drizzle ORM, Postgres. Some queries are done directly outside of Drizzle.
- `compose.yaml` - Docker compose file to run the DB

## Setup
1. run `docker compose up -d` to start the DB
2. switch to `app` folder
3. run `npm install` to install dependencies
4. run `npm run dev` to start the app
5. API will be running on `http://localhost:3000`

## Using Bruno to play with API
    User API is useless just ignore.
1. Download and install Bruno from [here](https://www.usebruno.com/)
2. Open Bruno and add a collection from `app/bruno`