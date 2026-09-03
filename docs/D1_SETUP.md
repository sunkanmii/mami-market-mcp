# Cloudflare D1 setup

The database and binding are configured in `wrangler.jsonc`. The versioned SQL
migrations live in `migrations/`.

## Apply the schema locally

```powershell
npm.cmd run db:migrate:local
npm.cmd run db:list:local
```

Local D1 data is stored under `.wrangler/` and is ignored by Git.

## Apply the schema to Cloudflare

```powershell
npm.cmd run db:migrate:remote
npm.cmd run db:list:remote
```

## Protect pilot writes

Set a private code interactively. Do not include its value in source code or a
command argument:

```powershell
npx.cmd wrangler pages secret put PILOT_ACCESS_CODE --project-name trader-network
```

Tell the code only to invited pilot participants. The app keeps it in session
storage and sends it to Pages Functions for write requests.

Deploy again after changing the secret:

```powershell
npm.cmd run build
npx.cmd wrangler pages deploy dist --project-name trader-network --branch main
```

Wrangler asks for confirmation before applying a remote migration. Review the
migration name, then confirm it.

## Dashboard alternative

Use this only instead of the remote Wrangler migration, not in addition to it.
Running the SQL manually does not create Wrangler's migration record, so a
later `db:migrate:remote` command would try to apply the same schema again.

1. Open the Cloudflare dashboard.
2. Select **Storage & databases** and then **D1 SQL database**.
3. Open **trader-network-db**.
4. Open the database console.
5. Copy the contents of `migrations/0001_initial_pilot_schema.sql` into the
   console and select **Execute**.
6. Run this verification query:

```sql
SELECT name
FROM sqlite_master
WHERE type = 'table'
ORDER BY name;
```

Prefer Wrangler migrations. Wrangler records applied migrations in
`d1_migrations`, prevents accidental duplicate application, and keeps the live
database aligned with the repository.

## Creating later schema changes

Do not edit an already-applied migration. Create a new one:

```powershell
npx.cmd wrangler d1 migrations create trader-network-db describe_the_change
```

Edit the generated SQL file, test it locally, and then apply it remotely.

Never store API tokens, access codes, or participant contact details in
`wrangler.jsonc` or a committed SQL migration.
